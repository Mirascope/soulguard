/**
 * soulguard init — one-time workspace setup.
 *
 * Creates system user/group, writes config, initializes registry and git.
 * Does NOT enforce protection — that's `sync`.
 *
 * Idempotent: skips already-completed steps, reports what was done.
 * Requires root (sudo).
 */

import type { SystemOperations } from "./system-ops.js";
import type { SystemIdentity, FileOwnership, Result, IOError } from "./types.js";
import { ok, err } from "./result.js";
import { DEFAULT_CONFIG, PROTECT_OWNERSHIP } from "./constants.js";
import { parseConfig } from "./schema.js";
import { Registry } from "./registry.js";
import { status } from "./status.js";

/** Result of `soulguard init` — idempotent, booleans report what was done */
export type InitResult = {
  /** Whether the system user was created (false if it already existed) */
  userCreated: boolean;
  /** Whether the system group was created (false if it already existed) */
  groupCreated: boolean;
  /** Whether soulguard.json was written (false if it already existed) */
  configCreated: boolean;
  /** Whether .soulguard/registry.json was created (false if it already existed) */
  registryCreated: boolean;
  /** Whether git was initialized (false if already existed or git disabled) */
  gitInitialized: boolean;
  /** Number of issues found by status check (files needing sync) */
  issueCount: number;
};

/** Errors specific to init */
export type InitError =
  | { kind: "not_root"; message: string }
  | { kind: "user_creation_failed"; message: string }
  | { kind: "group_creation_failed"; message: string }
  | { kind: "config_write_failed"; message: string }
  | { kind: "config_invalid"; message: string }
  | { kind: "registry_invalid"; message: string }
  | { kind: "staging_failed"; message: string }
  | { kind: "git_failed"; message: string };

export type InitOptions = {
  ops: SystemOperations;
  identity: SystemIdentity;
  /** @internal Skip root check (for testing only) */
  _skipRootCheck?: boolean;
};

export async function init(options: InitOptions): Promise<Result<InitResult, InitError>> {
  const { ops, identity } = options;

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

  // ── 1. Validate config (if it exists) ─────────────────────────────────
  const configExists = await ops.exists("soulguard.json");
  if (!configExists.ok) {
    return err({ kind: "config_write_failed", message: configExists.error.message });
  }

  let config = DEFAULT_CONFIG;
  let configCreated = false;

  if (configExists.value) {
    const raw = await ops.readFile("soulguard.json");
    if (!raw.ok) {
      return err({
        kind: "config_invalid",
        message: `Could not read soulguard.json: ${raw.error.kind}`,
      });
    }
    try {
      const parsed = JSON.parse(raw.value);
      config = parseConfig(parsed);
    } catch (e) {
      return err({
        kind: "config_invalid",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // ── 2. Create group ──────────────────────────────────────────────────
  let groupCreated = false;
  const groupExists = await ops.groupExists(identity.group);
  if (!groupExists.ok) {
    return err({
      kind: "group_creation_failed",
      message: `check failed: ${groupExists.error.message}`,
    });
  }
  if (!groupExists.value) {
    const result = await ops.createGroup(identity.group);
    if (!result.ok) {
      return err({ kind: "group_creation_failed", message: result.error.message });
    }
    groupCreated = true;
  }

  // ── 3. Create user ───────────────────────────────────────────────────
  let userCreated = false;
  const userExists = await ops.userExists(identity.user);
  if (!userExists.ok) {
    return err({
      kind: "user_creation_failed",
      message: `check failed: ${userExists.error.message}`,
    });
  }
  if (!userExists.value) {
    const result = await ops.createUser(identity.user, identity.group);
    if (!result.ok) {
      return err({ kind: "user_creation_failed", message: result.error.message });
    }
    userCreated = true;
  }

  // ── 4. Write config ──────────────────────────────────────────────────
  if (!configExists.value) {
    const content = JSON.stringify(config, null, 2) + "\n";
    const result = await ops.writeFile("soulguard.json", content);
    if (!result.ok) {
      return err({ kind: "config_write_failed", message: `write failed: ${result.error.kind}` });
    }
    configCreated = true;
  }

  // ── 5. Create .soulguard/ directory ──────────────────────────────────
  const sgDirExists = await ops.exists(".soulguard");
  if (sgDirExists.ok && !sgDirExists.value) {
    const mkResult = await ops.mkdir(".soulguard");
    if (!mkResult.ok) {
      return err({
        kind: "staging_failed",
        message: `mkdir .soulguard failed: ${mkResult.error.kind}`,
      });
    }
  }
  const chownSg = await ops.chown(".soulguard", { user: identity.user, group: identity.group });
  if (!chownSg.ok) {
    return err({
      kind: "staging_failed",
      message: `chown .soulguard failed: ${chownSg.error.kind}`,
    });
  }
  const chmodSg = await ops.chmod(".soulguard", "755");
  if (!chmodSg.ok) {
    return err({
      kind: "staging_failed",
      message: `chmod .soulguard failed: ${chmodSg.error.kind}`,
    });
  }

  // ── 6. Create .soulguard-staging/ directory ──────────────────────────
  const stagingDirExists = await ops.exists(".soulguard-staging");
  if (stagingDirExists.ok && !stagingDirExists.value) {
    const mkResult = await ops.mkdir(".soulguard-staging");
    if (!mkResult.ok) {
      return err({
        kind: "staging_failed",
        message: `mkdir .soulguard-staging failed: ${mkResult.error.kind}`,
      });
    }
  }

  // ── 7. Initialize registry ──────────────────────────────────────────
  let registryCreated = false;
  const registryExists = await ops.exists(".soulguard/registry.json");
  if (registryExists.ok && registryExists.value) {
    const registryResult = await Registry.load(ops);
    if (!registryResult.ok) {
      return err({
        kind: "registry_invalid",
        message: registryResult.error.message,
      });
    }
  } else {
    const registryResult = await Registry.load(ops);
    if (!registryResult.ok) {
      return err({ kind: "registry_invalid", message: registryResult.error.message });
    }
    const registry = registryResult.value;
    await registry.register("soulguard.json", "protect");
    const writeResult = await registry.write();
    if (!writeResult.ok) {
      return err({ kind: "registry_invalid", message: writeResult.error.message });
    }
    registryCreated = true;

    const chownReg = await ops.chown(".soulguard/registry.json", {
      user: identity.user,
      group: identity.group,
    });
    if (!chownReg.ok) {
      return err({
        kind: "staging_failed",
        message: `chown registry.json failed: ${chownReg.error.kind}`,
      });
    }
    const chmodReg = await ops.chmod(".soulguard/registry.json", "444");
    if (!chmodReg.ok) {
      return err({
        kind: "staging_failed",
        message: `chmod registry.json failed: ${chmodReg.error.kind}`,
      });
    }
  }

  // ── 8. Git integration ────────────────────────────────────────────────
  let gitInitialized = false;
  if (config.git !== false) {
    const gitDirExists = await ops.exists(".soulguard/.git");
    if (gitDirExists.ok && !gitDirExists.value) {
      const gitResult = await ops.exec("git", ["init", "--bare", ".soulguard/.git"]);
      if (!gitResult.ok) {
        return err({ kind: "git_failed", message: gitResult.error.message });
      }
      gitInitialized = true;

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
    }
  }

  // ── 9. Run status check ───────────────────────────────────────────────
  let issueCount = 0;
  {
    const registryResult = await Registry.load(ops);
    if (registryResult.ok) {
      const statusResult = await status({
        config,
        expectedProtectOwnership: PROTECT_OWNERSHIP,
        ops,
        registry: registryResult.value,
      });
      if (statusResult.ok) {
        issueCount = statusResult.value.issues.length;
      }
    }
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
