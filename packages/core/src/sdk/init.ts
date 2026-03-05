/**
 * soulguard init — one-time workspace setup.
 *
 * Creates system user/group, writes config, initializes registry and git.
 * Does NOT enforce protection — that's `sync`.
 *
 * Idempotent: skips already-completed steps, reports what was done.
 * Requires root (sudo).
 */

import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig, Result } from "../util/types.js";
import { ok, err } from "../util/result.js";
import { SOULGUARDIAN_IDENTITY, PROTECT_OWNERSHIP } from "../util/constants.js";
import { ensureConfig } from "./config.js";
import type { ConfigError } from "./config.js";
import { Registry } from "./registry.js";
import { status } from "./status.js";

/** Result of `soulguard init` — idempotent, booleans report what was done */
export type InitResult = {
  userCreated: boolean;
  groupCreated: boolean;
  configCreated: boolean;
  registryCreated: boolean;
  gitInitialized: boolean;
  issueCount: number;
};

/** Errors specific to init */
export type InitError =
  | { kind: "not_root"; message: string }
  | { kind: "config_invalid"; message: string }
  | { kind: "registry_invalid"; message: string }
  | { kind: "system_error"; message: string };

export type InitOptions = {
  ops: SystemOperations;
  /** @internal Skip root check (for testing only) */
  _skipRootCheck?: boolean;
};

// ── Helpers ────────────────────────────────────────────────────────────

/** Create soulguardian user and soulguard group if they don't exist. */
async function ensureGuardianExists(
  ops: SystemOperations,
): Promise<Result<{ userCreated: boolean; groupCreated: boolean }, InitError>> {
  let groupCreated = false;
  const groupExists = await ops.groupExists(SOULGUARDIAN_IDENTITY.group);
  if (!groupExists.ok) {
    return err({
      kind: "system_error",
      message: `group check failed: ${groupExists.error.message}`,
    });
  }
  if (!groupExists.value) {
    const result = await ops.createGroup(SOULGUARDIAN_IDENTITY.group);
    if (!result.ok) {
      return err({ kind: "system_error", message: `create group failed: ${result.error.message}` });
    }
    groupCreated = true;
  }

  let userCreated = false;
  const userExists = await ops.userExists(SOULGUARDIAN_IDENTITY.user);
  if (!userExists.ok) {
    return err({ kind: "system_error", message: `user check failed: ${userExists.error.message}` });
  }
  if (!userExists.value) {
    const result = await ops.createUser(SOULGUARDIAN_IDENTITY.user, SOULGUARDIAN_IDENTITY.group);
    if (!result.ok) {
      return err({ kind: "system_error", message: `create user failed: ${result.error.message}` });
    }
    userCreated = true;
  }

  return ok({ userCreated, groupCreated });
}

/** Create .soulguard/ directory owned by soulguardian:soulguard 755. */
async function ensureSoulguardDir(ops: SystemOperations): Promise<Result<void, InitError>> {
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
    user: SOULGUARDIAN_IDENTITY.user,
    group: SOULGUARDIAN_IDENTITY.group,
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

/** Create .soulguard-staging/ directory with default permissions. */
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
  return ok(undefined);
}

/**
 * Load or create registry. If missing, creates with soulguard.json tracked.
 * If present but unparseable, returns registry_invalid error.
 */
async function ensureRegistry(
  ops: SystemOperations,
): Promise<Result<{ registry: Registry; created: boolean }, InitError>> {
  const exists = await ops.exists(".soulguard/registry.json");

  if (exists.ok && exists.value) {
    // Validate existing registry
    const result = await Registry.load(ops);
    if (!result.ok) {
      return err({ kind: "registry_invalid", message: result.error.message });
    }
    return ok({ registry: result.value, created: false });
  }

  // Create new registry tracking soulguard.json
  const result = await Registry.load(ops); // loads empty
  if (!result.ok) {
    return err({ kind: "registry_invalid", message: result.error.message });
  }
  const registry = result.value;
  await registry.register("soulguard.json", "protect");
  const writeResult = await registry.write();
  if (!writeResult.ok) {
    return err({
      kind: "system_error",
      message: `write registry failed: ${writeResult.error.message}`,
    });
  }

  // Set ownership: soulguardian:soulguard 444
  const chown = await ops.chown(".soulguard/registry.json", {
    user: SOULGUARDIAN_IDENTITY.user,
    group: SOULGUARDIAN_IDENTITY.group,
  });
  if (!chown.ok) {
    return err({
      kind: "system_error",
      message: `chown registry.json failed: ${chown.error.kind}`,
    });
  }
  const chmod = await ops.chmod(".soulguard/registry.json", "444");
  if (!chmod.ok) {
    return err({
      kind: "system_error",
      message: `chmod registry.json failed: ${chmod.error.kind}`,
    });
  }

  return ok({ registry, created: true });
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

  // ── 1. Ensure config ─────────────────────────────────────────────────
  const configResult = await ensureConfig(ops);
  if (!configResult.ok) {
    return err(configErrorToInitError(configResult.error));
  }
  const { config, created: configCreated } = configResult.value;

  // ── 2. Ensure guardian user/group ─────────────────────────────────────
  const guardianResult = await ensureGuardianExists(ops);
  if (!guardianResult.ok) return guardianResult;
  const { userCreated, groupCreated } = guardianResult.value;

  // ── 2b. Enforce soulguard.json ownership ──────────────────────────────
  const sgJsonChown = await ops.chown("soulguard.json", {
    user: SOULGUARDIAN_IDENTITY.user,
    group: SOULGUARDIAN_IDENTITY.group,
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
  const sgDirResult = await ensureSoulguardDir(ops);
  if (!sgDirResult.ok) return sgDirResult;

  // ── 4. Ensure .soulguard-staging/ directory ──────────────────────────
  const stagingResult = await ensureStagingDir(ops);
  if (!stagingResult.ok) return stagingResult;

  // ── 5. Ensure registry ───────────────────────────────────────────────
  const registryResult = await ensureRegistry(ops);
  if (!registryResult.ok) return registryResult;
  const { registry, created: registryCreated } = registryResult.value;

  // ── 6. Ensure git ────────────────────────────────────────────────────
  const gitResult = await ensureGit(ops, config);
  if (!gitResult.ok) return gitResult;
  const { gitInitialized } = gitResult.value;

  // ── 7. Status check ──────────────────────────────────────────────────
  let issueCount = 0;
  const statusResult = await status({
    config,
    expectedProtectOwnership: PROTECT_OWNERSHIP,
    ops,
    registry,
  });
  if (statusResult.ok) {
    issueCount = statusResult.value.issues.length;
  }

  return ok({
    userCreated,
    groupCreated,
    configCreated,
    registryCreated,
    gitInitialized,
    issueCount,
  });
}
