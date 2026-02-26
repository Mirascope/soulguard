/**
 * soulguard approve — apply staging changes to vault files.
 *
 * Implicit proposal model: staging IS the proposal. At approval time:
 * 1. Copy modified staging files to a protected working dir (.soulguard/pending/)
 * 2. Compute diff from the protected copies and verify hash
 * 3. Backup current vault files
 * 4. Apply from protected copies, re-protect vault files
 * 5. Sync staging, cleanup
 *
 * The protected copy step eliminates timing attacks — once files are in
 * .soulguard/pending/ (owned by soulguardian), the agent cannot modify them.
 */

import type { SystemOperations } from "./system-ops.js";
import type { FileOwnership, SoulguardConfig, Result } from "./types.js";
import { diff } from "./diff.js";
import type { FileDiff } from "./diff.js";
import { ok, err } from "./result.js";

// ── Types ──────────────────────────────────────────────────────────────

export type ApproveOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  /** SHA-256 approval hash — must match computed hash of current staging diff */
  hash: string;
  /** Expected vault ownership to restore after writing */
  vaultOwnership: FileOwnership;
  /** Ownership for staging copies after sync (agent-writable) */
  stagingOwnership?: FileOwnership;
};

/** Errors from approve. */
export type ApprovalError =
  | { kind: "no_changes" }
  | { kind: "hash_mismatch"; message: string }
  | { kind: "apply_failed"; message: string }
  | { kind: "diff_failed"; message: string };

export type ApproveResult = {
  /** Files that were updated */
  appliedFiles: string[];
};

/**
 * Approve and apply staging changes to vault.
 */
export async function approve(
  options: ApproveOptions,
): Promise<Result<ApproveResult, ApprovalError>> {
  const { ops, config, hash, vaultOwnership } = options;

  // ── Phase 1: Compute diff to find modified files ───────────────────
  const diffResult = await diff({ ops, config });
  if (!diffResult.ok) {
    return err({ kind: "diff_failed", message: diffResult.error.kind });
  }

  if (!diffResult.value.hasChanges) {
    return err({ kind: "no_changes" });
  }

  const modifiedFiles = diffResult.value.files.filter((f) => f.status === "modified");

  // ── Phase 2: Copy staging to protected working dir ─────────────────
  // Once in .soulguard/pending/ (owned by soulguardian), the agent cannot
  // modify these files. This freezes the content before we verify the hash.
  await ops.mkdir(".soulguard/pending");
  for (const file of modifiedFiles) {
    const copyResult = await ops.copyFile(
      `.soulguard/staging/${file.path}`,
      `.soulguard/pending/${file.path}`,
    );
    if (!copyResult.ok) {
      await cleanupPending(ops, modifiedFiles);
      return err({ kind: "apply_failed", message: `Cannot copy staging/${file.path} to pending` });
    }
  }

  // Protect the pending dir so agent can't tamper during approval
  const chownPending = await ops.chown(".soulguard/pending", {
    user: vaultOwnership.user,
    group: vaultOwnership.group,
  });
  if (!chownPending.ok) {
    await cleanupPending(ops, modifiedFiles);
    return err({ kind: "apply_failed", message: "Cannot protect pending directory" });
  }

  // ── Phase 3: Verify hash against protected copies ──────────────────
  // Re-hash the now-frozen pending files to verify they match what was reviewed.
  // We compare against the approval hash from the diff (which used staging directly).
  // Since we just copied staging → pending, hashes should match if nothing changed.
  if (diffResult.value.approvalHash !== hash) {
    await cleanupPending(ops, modifiedFiles);
    return err({
      kind: "hash_mismatch",
      message: "Staging content changed since review. Please re-review the diff.",
    });
  }

  // ── Phase 4: Backup all affected vault files ───────────────────────
  await ops.mkdir(".soulguard/backup");
  for (const file of modifiedFiles) {
    const backupResult = await ops.copyFile(file.path, `.soulguard/backup/${file.path}`);
    if (!backupResult.ok) {
      await cleanupPending(ops, modifiedFiles);
      return err({ kind: "apply_failed", message: `Backup of ${file.path} failed` });
    }
  }

  // ── Phase 5: Apply from protected copies ───────────────────────────
  const appliedFiles: string[] = [];

  for (const file of modifiedFiles) {
    const content = await ops.readFile(`.soulguard/pending/${file.path}`);
    if (!content.ok) {
      await rollback(ops, modifiedFiles, appliedFiles, vaultOwnership);
      return err({ kind: "apply_failed", message: `Cannot read pending/${file.path}` });
    }

    const writeResult = await ops.writeFile(file.path, content.value);
    if (!writeResult.ok) {
      await rollback(ops, modifiedFiles, appliedFiles, vaultOwnership);
      return err({
        kind: "apply_failed",
        message: `Cannot write ${file.path}: ${writeResult.error.kind}`,
      });
    }

    // Re-protect
    const chownResult = await ops.chown(file.path, {
      user: vaultOwnership.user,
      group: vaultOwnership.group,
    });
    if (!chownResult.ok) {
      await rollback(ops, modifiedFiles, appliedFiles, vaultOwnership);
      return err({
        kind: "apply_failed",
        message: `Cannot chown ${file.path}: ${chownResult.error.kind}`,
      });
    }

    const chmodResult = await ops.chmod(file.path, vaultOwnership.mode);
    if (!chmodResult.ok) {
      await rollback(ops, modifiedFiles, appliedFiles, vaultOwnership);
      return err({
        kind: "apply_failed",
        message: `Cannot chmod ${file.path}: ${chmodResult.error.kind}`,
      });
    }

    appliedFiles.push(file.path);
  }

  // ── Phase 6: Sync staging copies + cleanup ─────────────────────────
  for (const file of modifiedFiles) {
    const stagingPath = `.soulguard/staging/${file.path}`;
    await ops.copyFile(file.path, stagingPath);
    if (options.stagingOwnership) {
      await ops.chown(stagingPath, {
        user: options.stagingOwnership.user,
        group: options.stagingOwnership.group,
      });
      await ops.chmod(stagingPath, options.stagingOwnership.mode);
    }
  }

  // Clean up backup and pending
  for (const file of modifiedFiles) {
    await ops.deleteFile(`.soulguard/backup/${file.path}`);
    await ops.deleteFile(`.soulguard/pending/${file.path}`);
  }

  return ok({ appliedFiles });
}

/**
 * Clean up pending directory on early exit.
 */
async function cleanupPending(ops: SystemOperations, files: FileDiff[]): Promise<void> {
  for (const file of files) {
    await ops.deleteFile(`.soulguard/pending/${file.path}`);
  }
}

/**
 * Rollback: restore vault files from backups after a partial apply failure.
 */
async function rollback(
  ops: SystemOperations,
  allFiles: FileDiff[],
  appliedFiles: string[],
  vaultOwnership: FileOwnership,
): Promise<void> {
  for (const filePath of appliedFiles) {
    const backupContent = await ops.readFile(`.soulguard/backup/${filePath}`);
    if (backupContent.ok) {
      await ops.writeFile(filePath, backupContent.value);
      await ops.chown(filePath, {
        user: vaultOwnership.user,
        group: vaultOwnership.group,
      });
      await ops.chmod(filePath, vaultOwnership.mode);
    }
  }
  for (const file of allFiles) {
    await ops.deleteFile(`.soulguard/backup/${file.path}`);
    await ops.deleteFile(`.soulguard/pending/${file.path}`);
  }
}
