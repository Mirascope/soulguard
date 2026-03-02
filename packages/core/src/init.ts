/**
 * soulguard init — one-time workspace setup.
 *
 * Creates system user/group, writes config, syncs protect-tier files,
 * creates staging copies, generates scoped sudoers.
 *
 * Idempotent: skips already-completed steps, reports what was done.
 * Requires root (sudo).
 */

import type { SyncResult } from "./sync.js";
import type { SystemOperations } from "./system-ops.js";
import type { SoulguardConfig, SystemIdentity, FileOwnership, Result, IOError } from "./types.js";
import { ok, err } from "./result.js";
import { sync } from "./sync.js";
import { DEFAULT_CONFIG } from "./constants.js";
import { resolvePatterns } from "./glob.js";
import { protectPatterns } from "./config.js";
import { stagingPath } from "./staging.js";
import { dirname } from "node:path";
import { execSync } from "node:child_process";

/** Result of `soulguard init` — idempotent, booleans report what was done */
export type InitResult = {
  /** Whether the system user was created (false if it already existed) */
  userCreated: boolean;
  /** Whether the system group was created (false if it already existed) */
  groupCreated: boolean;
  /** Whether soulguard.json was written (false if it already existed) */
  configCreated: boolean;
  /** Whether the sudoers file was written */
  sudoersCreated: boolean;
  /** Whether git was initialized (false if already existed or git disabled) */
  gitInitialized: boolean;
  /** Sync result from the initial sync after setup */
  syncResult: SyncResult;
};

/** Errors specific to init */
export type InitError =
  | { kind: "not_root"; message: string }
  | { kind: "user_creation_failed"; message: string }
  | { kind: "group_creation_failed"; message: string }
  | { kind: "config_write_failed"; message: string }
  | { kind: "sudoers_write_failed"; message: string }
  | { kind: "staging_failed"; message: string }
  | { kind: "git_failed"; message: string };

/** Write content to an absolute path (outside workspace). Used for sudoers. */
export type AbsoluteWriter = (path: string, content: string) => Promise<Result<void, IOError>>;

/** Check if an absolute path exists (outside workspace). */
export type AbsoluteExists = (path: string) => Promise<boolean>;

export type InitOptions = {
  ops: SystemOperations;
  identity: SystemIdentity;
  config?: SoulguardConfig;
  /** Calling user's OS username (for sudoers) */
  callerUser: string;
  /** Writer for files outside the workspace (sudoers). Keeps SystemOperations clean. */
  writeAbsolute: AbsoluteWriter;
  /** Check if absolute path exists. Used for sudoers idempotency. */
  existsAbsolute: AbsoluteExists;
  /** Path to write sudoers file (default: /etc/sudoers.d/soulguard) */
  sudoersPath?: string;
  /** @internal Skip root check (for testing only) */
  _skipRootCheck?: boolean;
};

/** Generate scoped sudoers content */
export function generateSudoers(callerUser: string, soulguardBin: string): string {
  const cmds = ["sync", "status", "diff", "reset"].map((cmd) => `${soulguardBin} ${cmd} *`);
  return `# Soulguard — scoped sudo for calling user\n${callerUser} ALL=(root) NOPASSWD: ${cmds.join(", ")}\n`;
}

const DEFAULT_SUDOERS_PATH = "/etc/sudoers.d/soulguard";
/** Resolve the soulguard binary path dynamically. */
function resolveSoulguardBin(): string {
  try {
    return execSync("which soulguard", { encoding: "utf-8" }).trim();
  } catch {
    return "/usr/local/bin/soulguard";
  }
}

export async function init(options: InitOptions): Promise<Result<InitResult, InitError>> {
  const {
    ops,
    identity,
    config: configOption,
    writeAbsolute,
    existsAbsolute,
    sudoersPath = DEFAULT_SUDOERS_PATH,
    callerUser,
  } = options;
  const config = configOption ?? DEFAULT_CONFIG;

  // ── 0. Check root ─────────────────────────────────────────────────────
  if (
    !options._skipRootCheck &&
    typeof process !== "undefined" &&
    typeof process.getuid === "function" &&
    process.getuid() !== 0
  ) {
    return err({ kind: "not_root", message: "soulguard init requires root. Run with sudo." });
  }

  // ── 1. Create group ──────────────────────────────────────────────────
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

  // ── 2. Create user ───────────────────────────────────────────────────
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

  // ── 2b. Add agent user to soulguard group ─────────────────────────
  // Agent needs group membership to write staging siblings in group-writable dirs.
  if (process.platform === "darwin") {
    await ops.exec("dseditgroup", ["-o", "edit", "-a", callerUser, "-t", "user", identity.group]);
  } else {
    await ops.exec("usermod", ["-aG", identity.group, callerUser]);
  }

  // ── 3. Write config ──────────────────────────────────────────────────
  let configCreated = false;
  const configExists = await ops.exists("soulguard.json");
  if (!configExists.ok) {
    return err({ kind: "config_write_failed", message: configExists.error.message });
  }
  if (!configExists.value) {
    const content = JSON.stringify(config, null, 2) + "\n";
    const result = await ops.writeFile("soulguard.json", content);
    if (!result.ok) {
      return err({ kind: "config_write_failed", message: `write failed: ${result.error.kind}` });
    }
    configCreated = true;
  }

  // ── 4. Sync protect-tier files ──────────────────────────────────────────────
  const protectOwnership: FileOwnership = {
    user: identity.user,
    group: identity.group,
    mode: "444",
  };

  const syncResult = await sync({
    config,
    expectedProtectOwnership: protectOwnership,
    ops,
  });
  if (!syncResult.ok) {
    // sync currently never errors at the Result level, but handle it
    return err({ kind: "config_write_failed", message: "sync failed unexpectedly" });
  }

  // ── 5. Prepare directories for staging ─────────────────────────────
  // Make directories containing protect-tier files group-writable so
  // the agent can create staging siblings on-demand.
  const protectGlob = await resolvePatterns(ops, protectPatterns(config));
  if (!protectGlob.ok) {
    return err({ kind: "staging_failed", message: `glob failed: ${protectGlob.error.message}` });
  }
  const protectFiles = protectGlob.value;
  const stagingDirs = new Set<string>();
  for (const protectFile of protectFiles) {
    const dir = dirname(stagingPath(protectFile));
    stagingDirs.add(dir === "." ? "." : dir);
  }
  for (const dir of stagingDirs) {
    const chownDir = await ops.chown(dir, {
      user: identity.user,
      group: identity.group,
    });
    if (!chownDir.ok) {
      return err({
        kind: "staging_failed",
        message: `chown dir ${dir} failed: ${chownDir.error.kind}`,
      });
    }
    const chmodDir = await ops.chmod(dir, "775");
    if (!chmodDir.ok) {
      return err({
        kind: "staging_failed",
        message: `chmod dir ${dir} failed: ${chmodDir.error.kind}`,
      });
    }
  }

  // ── 6. Git integration ────────────────────────────────────────────────
  let gitInitialized = false;
  if (config.git !== false) {
    // Initialize git repo inside .soulguard/ (isolated from workspace git)
    const gitDirExists = await ops.exists(".soulguard/.git");
    if (gitDirExists.ok && !gitDirExists.value) {
      const gitResult = await ops.exec("git", ["init", "--bare", ".soulguard/.git"]);
      if (!gitResult.ok) {
        return err({ kind: "git_failed", message: gitResult.error.message });
      }
      gitInitialized = true;
    }

    // Initial commit of all tracked files
    if (gitInitialized) {
      const allFiles = Object.keys(config.files);
      // Resolve globs to actual files
      const resolved = await resolvePatterns(ops, allFiles);
      if (resolved.ok && resolved.value.length > 0) {
        // Need to configure git user for commits in bare repo
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
        for (const file of resolved.value) {
          await ops.exec("git", [
            "--git-dir",
            ".soulguard/.git",
            "--work-tree",
            ".",
            "add",
            "--",
            file,
          ]);
        }
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

  // ── 7. Write sudoers ─ ─────────────────────────────────────────────────
  let sudoersCreated = false;
  const sudoersAlreadyExists = await existsAbsolute(sudoersPath);
  if (!sudoersAlreadyExists) {
    const sudoersContent = generateSudoers(callerUser, resolveSoulguardBin());
    const sudoersResult = await writeAbsolute(sudoersPath, sudoersContent);
    if (!sudoersResult.ok) {
      return err({ kind: "sudoers_write_failed", message: sudoersResult.error.message });
    }
    sudoersCreated = true;
  }

  return ok({
    userCreated,
    groupCreated,
    configCreated,
    sudoersCreated,
    gitInitialized,
    syncResult: syncResult.value,
  });
}
