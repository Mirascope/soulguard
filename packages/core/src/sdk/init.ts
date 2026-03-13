/**
 * soulguard init — one-time workspace setup.
 *
 * Creates system user/group, writes config, initializes git.
 * Does NOT enforce protection — that's `sync`.
 *
 * Idempotent: skips already-completed steps, reports what was done.
 * Requires root (sudo).
 */

import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig, Result } from "../util/types.js";
import { ok, err } from "../util/result.js";
import { SOULGUARD_GROUP, guardianName } from "../util/constants.js";
import { ensureConfig, writeConfig } from "./config.js";
import type { ConfigError } from "./config.js";
import { status } from "./status.js";
import { StateTree } from "./state.js";

/** Result of `soulguard init` — idempotent, booleans report what was done */
export type InitResult = {
  userCreated: boolean;
  groupCreated: boolean;
  configCreated: boolean;
  gitInitialized: boolean;
  issueCount: number;
};

/** Errors specific to init */
export type InitError =
  | { kind: "not_root"; message: string }
  | { kind: "config_invalid"; message: string }
  | { kind: "system_error"; message: string };

export type InitOptions = {
  ops: SystemOperations;
  /** Override agent username (defaults to process.env.SUDO_USER) */
  agentUser?: string;
  /** @internal Skip root check (for testing only) */
  _skipRootCheck?: boolean;
};

// ── Helpers ────────────────────────────────────────────────────────────

/** Create guardian user and soulguard group if they don't exist. */
async function ensureGuardianExists(
  ops: SystemOperations,
  guardian: string,
): Promise<Result<{ userCreated: boolean; groupCreated: boolean }, InitError>> {
  let groupCreated = false;
  const groupExists = await ops.groupExists(SOULGUARD_GROUP);
  if (!groupExists.ok) {
    return err({
      kind: "system_error",
      message: `group check failed: ${groupExists.error.message}`,
    });
  }
  if (!groupExists.value) {
    const result = await ops.createGroup(SOULGUARD_GROUP);
    if (!result.ok) {
      return err({ kind: "system_error", message: `create group failed: ${result.error.message}` });
    }
    groupCreated = true;
  }

  let userCreated = false;
  const userExists = await ops.userExists(guardian);
  if (!userExists.ok) {
    return err({ kind: "system_error", message: `user check failed: ${userExists.error.message}` });
  }
  if (!userExists.value) {
    const result = await ops.createUser(guardian, SOULGUARD_GROUP);
    if (!result.ok) {
      return err({ kind: "system_error", message: `create user failed: ${result.error.message}` });
    }
    userCreated = true;
  }

  return ok({ userCreated, groupCreated });
}

/** Create .soulguard/ directory owned by guardian:soulguard 755. */
async function ensureSoulguardDir(
  ops: SystemOperations,
  guardian: string,
): Promise<Result<void, InitError>> {
  const exists = await ops.exists(".soulguard");
  if (exists.ok && !exists.value) {
    const mkResult = await ops.mkdir(".soulguard");
    if (!mkResult.ok) {
      return err({
        kind: "system_error",
        message: `mkdir .soulguard failed: ${mkResult.error.kind}`,
      });
    }
  }
  const chown = await ops.chown(".soulguard", {
    user: guardian,
    group: SOULGUARD_GROUP,
  });
  if (!chown.ok) {
    return err({ kind: "system_error", message: `chown .soulguard failed: ${chown.error.kind}` });
  }
  const chmod = await ops.chmod(".soulguard", "755");
  if (!chmod.ok) {
    return err({ kind: "system_error", message: `chmod .soulguard failed: ${chmod.error.kind}` });
  }
  return ok(undefined);
}

/** Create .soulguard-staging/ directory with agent-writable permissions (755). */
async function ensureStagingDir(ops: SystemOperations): Promise<Result<void, InitError>> {
  const exists = await ops.exists(".soulguard-staging");
  if (exists.ok && !exists.value) {
    const mkResult = await ops.mkdir(".soulguard-staging");
    if (!mkResult.ok) {
      return err({
        kind: "system_error",
        message: `mkdir .soulguard-staging failed: ${mkResult.error.kind}`,
      });
    }
  }
  // Ensure world-writable permissions so agent can write staging files without sudo
  const chmod = await ops.chmod(".soulguard-staging", "777");
  if (!chmod.ok) {
    return err({
      kind: "system_error",
      message: `chmod .soulguard-staging failed: ${chmod.error.kind}`,
    });
  }
  return ok(undefined);
}

/** Initialize git repo in .soulguard/.git with initial commit of soulguard.json. */
async function ensureGit(
  ops: SystemOperations,
  config: SoulguardConfig,
): Promise<Result<{ gitInitialized: boolean }, InitError>> {
  if (config.git === false) {
    return ok({ gitInitialized: false });
  }

  const gitDirExists = await ops.exists(".soulguard/.git");
  if (gitDirExists.ok && gitDirExists.value) {
    return ok({ gitInitialized: false });
  }

  const gitResult = await ops.exec("git", ["init", "--bare", ".soulguard/.git"]);
  if (!gitResult.ok) {
    return err({ kind: "system_error", message: `git init failed: ${gitResult.error.message}` });
  }

  await ops.exec("git", [
    "--git-dir",
    ".soulguard/.git",
    "--work-tree",
    ".",
    "config",
    "user.email",
    "soulguardian@soulguard.ai",
  ]);
  await ops.exec("git", [
    "--git-dir",
    ".soulguard/.git",
    "--work-tree",
    ".",
    "config",
    "user.name",
    "SoulGuardian",
  ]);

  const sgJsonExists = await ops.exists("soulguard.json");
  if (sgJsonExists.ok && sgJsonExists.value) {
    await ops.exec("git", [
      "--git-dir",
      ".soulguard/.git",
      "--work-tree",
      ".",
      "add",
      "--",
      "soulguard.json",
    ]);
    await ops.exec("git", [
      "--git-dir",
      ".soulguard/.git",
      "--work-tree",
      ".",
      "commit",
      "-m",
      "soulguard: initial commit",
    ]);
  }

  return ok({ gitInitialized: true });
}

/** Map ConfigError to InitError. */
function configErrorToInitError(e: ConfigError): InitError {
  switch (e.kind) {
    case "not_found":
      // Should not happen in ensureConfig path, but handle gracefully
      return { kind: "system_error", message: "config not found unexpectedly" };
    case "parse_failed":
      return { kind: "config_invalid", message: e.message };
    case "io_error":
      return { kind: "system_error", message: e.message };
  }
}

// ── Main ───────────────────────────────────────────────────────────────

export async function init(options: InitOptions): Promise<Result<InitResult, InitError>> {
  const { ops } = options;

  // ── 0. Check root ─────────────────────────────────────────────────────
  if (
    !options._skipRootCheck &&
    typeof process !== "undefined" &&
    typeof process.getuid === "function" &&
    process.getuid() !== 0
  ) {
    return err({
      kind: "not_root",
      message: "soulguard init requires sudo. Run with: sudo soulguard init",
    });
  }

  // ── 0b. Derive guardian name ─────────────────────────────────────────
  const agentUser = options.agentUser ?? process.env.SUDO_USER;
  if (!agentUser) {
    return err({
      kind: "not_root",
      message:
        "Cannot determine agent user. Run with sudo (SUDO_USER is set automatically) or pass agentUser option.",
    });
  }
  const guardian = guardianName(agentUser);

  // ── 1. Ensure config ─────────────────────────────────────────────────
  const configResult = await ensureConfig(ops, guardian);
  if (!configResult.ok) {
    return err(configErrorToInitError(configResult.error));
  }
  let { config, created: configCreated } = configResult.value;

  // ── 1b. Detect default ownership if not set ──────────────────────────
  if (!config.defaultOwnership) {
    // Snapshot ownership from the workspace directory (.).
    // This represents the agent user/group, and becomes the restore-to
    // ownership when files are released from protect tier.
    const sgStat = await ops.stat(".");
    if (sgStat.ok) {
      config = {
        ...config,
        defaultOwnership: {
          // Use the workspace directory's user/group as the agent identity,
          // with a default file mode of 644 (readable by all, writable by owner)
          user: sgStat.value.ownership.user,
          group: sgStat.value.ownership.group,
          mode: "644",
        },
      };
      // Write updated config with defaultOwnership
      const writeResult = await writeConfig(ops, config);
      if (!writeResult.ok) {
        return err({
          kind: "system_error",
          message: "failed to write config with defaultOwnership",
        });
      }
    }
  }

  // ── 2. Ensure guardian user/group ─────────────────────────────────────
  const guardianResult = await ensureGuardianExists(ops, guardian);
  if (!guardianResult.ok) return guardianResult;
  const { userCreated, groupCreated } = guardianResult.value;

  // ── 2b. Enforce soulguard.json ownership ──────────────────────────────
  const sgJsonChown = await ops.chown("soulguard.json", {
    user: guardian,
    group: SOULGUARD_GROUP,
  });
  if (!sgJsonChown.ok) {
    return err({
      kind: "system_error",
      message: `chown soulguard.json failed: ${sgJsonChown.error.kind}`,
    });
  }
  const sgJsonChmod = await ops.chmod("soulguard.json", "444");
  if (!sgJsonChmod.ok) {
    return err({
      kind: "system_error",
      message: `chmod soulguard.json failed: ${sgJsonChmod.error.kind}`,
    });
  }

  // ── 3. Ensure .soulguard/ directory ──────────────────────────────────
  const sgDirResult = await ensureSoulguardDir(ops, guardian);
  if (!sgDirResult.ok) return sgDirResult;

  // ── 4. Ensure .soulguard-staging/ directory ──────────────────────────
  const stagingResult = await ensureStagingDir(ops);
  if (!stagingResult.ok) return stagingResult;

  // ── 5. Ensure git ────────────────────────────────────────────────────
  const gitResult = await ensureGit(ops, config);
  if (!gitResult.ok) return gitResult;
  const { gitInitialized } = gitResult.value;

  // ── 6. Status check ──────────────────────────────────────────────────
  let issueCount = 0;
  const treeResult = await StateTree.build({ ops, config });
  const statusResult = treeResult.ok
    ? await status({ tree: treeResult.value })
    : { ok: false as const };
  if (statusResult.ok) {
    issueCount = statusResult.value.drifts.length;
  }

  return ok({
    userCreated,
    groupCreated,
    configCreated,
    gitInitialized,
    issueCount,
  });
}
