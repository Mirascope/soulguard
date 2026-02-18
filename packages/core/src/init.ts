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

/** Result of `soulguard init` — idempotent, booleans report what was done */
export type InitResult = {
  /** Whether the system user was created (false if it already existed) */
  userCreated: boolean;
  /** Whether the system group was created (false if it already existed) */
  groupCreated: boolean;
  /** Whether the password hash was written (false if it already existed) */
  passwordSet: boolean;
  /** Whether soulguard.json was written (false if it already existed) */
  configCreated: boolean;
  /** Whether the sudoers file was written */
  sudoersCreated: boolean;
  /** Whether staging directory was created */
  stagingCreated: boolean;
  /** Sync result from the initial sync after setup */
  syncResult: SyncResult;
};

/** Errors specific to init */
export type InitError =
  | { kind: "not_root"; message: string }
  | { kind: "user_creation_failed"; message: string }
  | { kind: "group_creation_failed"; message: string }
  | { kind: "password_hash_failed"; message: string }
  | { kind: "config_write_failed"; message: string }
  | { kind: "sudoers_write_failed"; message: string }
  | { kind: "staging_failed"; message: string };

/** Write content to an absolute path (outside workspace). Used for sudoers. */
export type AbsoluteWriter = (path: string, content: string) => Promise<Result<void, IOError>>;

export type InitOptions = {
  ops: SystemOperations;
  identity: SystemIdentity;
  config: SoulguardConfig;
  /** Agent's OS username (for sudoers and staging ownership) */
  agentUser: string;
  /** Writer for files outside the workspace (sudoers). Keeps SystemOperations clean. */
  writeAbsolute: AbsoluteWriter;
  /** Password to hash (undefined = skip password setup) */
  password?: string;
  /** Path to write sudoers file (default: /etc/sudoers.d/soulguard) */
  sudoersPath?: string;
};

/** Generate scoped sudoers content */
export function generateSudoers(agentUser: string, soulguardBin: string): string {
  const cmds = ["sync", "stage", "status", "propose", "diff"].map(
    (cmd) => `${soulguardBin} ${cmd} *`,
  );
  return `# Soulguard — scoped sudo for agent user\n${agentUser} ALL=(root) NOPASSWD: ${cmds.join(", ")}\n`;
}

const DEFAULT_SUDOERS_PATH = "/etc/sudoers.d/soulguard";
const SOULGUARD_BIN = "/usr/local/bin/soulguard";

export async function init(options: InitOptions): Promise<Result<InitResult, InitError>> {
  const {
    ops,
    identity,
    config,
    agentUser,
    writeAbsolute,
    password,
    sudoersPath = DEFAULT_SUDOERS_PATH,
  } = options;

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
  let stagingCreated = false;
  const stagingExists = await ops.exists(".soulguard/staging");
  if (!stagingExists.ok) {
    return err({ kind: "staging_failed", message: stagingExists.error.message });
  }
  if (!stagingExists.value) {
    const mkdirResult = await ops.mkdir(".soulguard/staging");
    if (!mkdirResult.ok) {
      return err({ kind: "staging_failed", message: `mkdir failed: ${mkdirResult.error.kind}` });
    }
    // Copy vault files to staging
    for (const vaultFile of config.vault) {
      if (vaultFile.includes("*")) continue; // skip globs
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
        await ops.chown(`.soulguard/staging/${vaultFile}`, {
          user: agentUser,
          group: identity.group,
        });
        await ops.chmod(`.soulguard/staging/${vaultFile}`, "644");
      }
    }
    stagingCreated = true;
  }

  // ── 6. Write sudoers ─────────────────────────────────────────────────
  let sudoersCreated = false;
  const sudoersContent = generateSudoers(agentUser, SOULGUARD_BIN);
  const sudoersResult = await writeAbsolute(sudoersPath, sudoersContent);
  if (!sudoersResult.ok) {
    return err({ kind: "sudoers_write_failed", message: sudoersResult.error.message });
  }
  sudoersCreated = true;

  // ── 7. Password (optional) ───────────────────────────────────────────
  let passwordSet = false;
  if (password !== undefined) {
    // TODO: argon2 hash + write to .soulguard/.secret
    // For now, just note it's not implemented
    passwordSet = false;
  }

  return ok({
    userCreated,
    groupCreated,
    passwordSet,
    configCreated,
    sudoersCreated,
    stagingCreated,
    syncResult: syncResult.value,
  });
}
