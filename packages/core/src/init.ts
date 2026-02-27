/**
 * soulguard init — one-time workspace setup.
 *
 * Creates system user/group, writes config, syncs vault files,
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
  /** Whether staging directory was created */
  stagingCreated: boolean;
  /** Whether git was initialized (false if already existed or git disabled) */
  gitInitialized: boolean;
  /** Whether .gitignore was updated with staging entry */
  gitignoreUpdated: boolean;
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
  /** Agent's OS username (for sudoers and staging ownership) */
  agentUser: string;
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
export function generateSudoers(agentUser: string, soulguardBin: string): string {
  const cmds = ["sync", "stage", "status", "diff"].map((cmd) => `${soulguardBin} ${cmd} *`);
  return `# Soulguard — scoped sudo for agent user\n${agentUser} ALL=(root) NOPASSWD: ${cmds.join(", ")}\n`;
}

const DEFAULT_SUDOERS_PATH = "/etc/sudoers.d/soulguard";
const SOULGUARD_BIN = "/usr/local/bin/soulguard";

export async function init(options: InitOptions): Promise<Result<InitResult, InitError>> {
  const {
    ops,
    identity,
    config: configOption,
    agentUser,
    writeAbsolute,
    existsAbsolute,
    sudoersPath = DEFAULT_SUDOERS_PATH,
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

  // ── 4. Sync vault files ──────────────────────────────────────────────
  const vaultOwnership: FileOwnership = {
    user: identity.user,
    group: identity.group,
    mode: "444",
  };
  const ledgerOwnership: FileOwnership = {
    user: agentUser,
    group: identity.group,
    mode: "644",
  };

  const syncResult = await sync({
    config,
    expectedVaultOwnership: vaultOwnership,
    expectedLedgerOwnership: ledgerOwnership,
    ops,
  });
  if (!syncResult.ok) {
    // sync currently never errors at the Result level, but handle it
    return err({ kind: "config_write_failed", message: "sync failed unexpectedly" });
  }

  // ── 5. Create staging ────────────────────────────────────────────────
  // Always (re)create staging — idempotent, self-healing on partial state
  const stagingCreated = true;
  const mkdirResult = await ops.mkdir(".soulguard/staging");
  if (!mkdirResult.ok) {
    return err({ kind: "staging_failed", message: `mkdir failed: ${mkdirResult.error.kind}` });
  }
  // .soulguard/ owned by soulguardian — agent CANNOT create/delete files here.
  // Only staging/ is agent-writable.
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
  const chownStaging = await ops.chown(".soulguard/staging", {
    user: agentUser,
    group: identity.group,
  });
  if (!chownStaging.ok) {
    return err({
      kind: "staging_failed",
      message: `chown staging failed: ${chownStaging.error.kind}`,
    });
  }
  const chmodStaging = await ops.chmod(".soulguard/staging", "755");
  if (!chmodStaging.ok) {
    return err({
      kind: "staging_failed",
      message: `chmod staging failed: ${chmodStaging.error.kind}`,
    });
  }
  // Copy vault files to staging (resolve globs first)
  const vaultGlob = await resolvePatterns(ops, config.vault);
  if (!vaultGlob.ok) {
    return err({ kind: "staging_failed", message: `glob failed: ${vaultGlob.error.message}` });
  }
  const vaultFiles = vaultGlob.value;
  for (const vaultFile of vaultFiles) {
    const fileExists = await ops.exists(vaultFile);
    if (fileExists.ok && fileExists.value) {
      const copyResult = await ops.copyFile(vaultFile, `.soulguard/staging/${vaultFile}`);
      if (!copyResult.ok) {
        return err({
          kind: "staging_failed",
          message: `copy ${vaultFile} failed: ${copyResult.error.kind}`,
        });
      }
      // Make staging copy agent-writable
      const chownFile = await ops.chown(`.soulguard/staging/${vaultFile}`, {
        user: agentUser,
        group: identity.group,
      });
      if (!chownFile.ok) {
        return err({
          kind: "staging_failed",
          message: `chown staging/${vaultFile} failed: ${chownFile.error.kind}`,
        });
      }
      const chmodFile = await ops.chmod(`.soulguard/staging/${vaultFile}`, "644");
      if (!chmodFile.ok) {
        return err({
          kind: "staging_failed",
          message: `chmod staging/${vaultFile} failed: ${chmodFile.error.kind}`,
        });
      }
    }
  }

  // ── 6. Git integration ────────────────────────────────────────────────
  let gitInitialized = false;
  let gitignoreUpdated = false;
  if (config.git !== false) {
    // Check if .git exists
    const gitExists = await ops.exists(".git");
    if (gitExists.ok && !gitExists.value) {
      const gitResult = await ops.exec("git", ["init"]);
      if (!gitResult.ok) {
        return err({ kind: "git_failed", message: gitResult.error.message });
      }
      gitInitialized = true;
    }

    // Ensure .gitignore contains .soulguard/ (staging, pending, backup are all internal)
    const soulguardEntry = ".soulguard/";
    const gitignoreExists = await ops.exists(".gitignore");
    if (gitignoreExists.ok && gitignoreExists.value) {
      const content = await ops.readFile(".gitignore");
      if (content.ok) {
        const lines = content.value.split("\n");
        if (!lines.some((line) => line.trim() === soulguardEntry)) {
          const newContent = content.value.endsWith("\n")
            ? content.value + soulguardEntry + "\n"
            : content.value + "\n" + soulguardEntry + "\n";
          const writeResult = await ops.writeFile(".gitignore", newContent);
          if (!writeResult.ok) {
            return err({
              kind: "git_failed",
              message: `write .gitignore: ${writeResult.error.kind}`,
            });
          }
          gitignoreUpdated = true;
        }
      }
    } else {
      const writeResult = await ops.writeFile(".gitignore", soulguardEntry + "\n");
      if (!writeResult.ok) {
        return err({ kind: "git_failed", message: `create .gitignore: ${writeResult.error.kind}` });
      }
      gitignoreUpdated = true;
    }
  }

  // ── 7. Write sudoers ─ ─────────────────────────────────────────────────
  let sudoersCreated = false;
  const sudoersAlreadyExists = await existsAbsolute(sudoersPath);
  if (!sudoersAlreadyExists) {
    const sudoersContent = generateSudoers(agentUser, SOULGUARD_BIN);
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
    stagingCreated,
    gitInitialized,
    gitignoreUpdated,
    syncResult: syncResult.value,
  });
}
