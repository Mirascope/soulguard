/**
 * soulguard approve — apply staging changes to vault files.
 *
 * Implicit proposal model: staging IS the proposal. At approval time:
 * 1. Compute diff (staging vs vault)
 * 2. Compute approval hash from the diff
 * 3. Verify hash matches what the reviewer saw
 * 4. Run beforeApprove policy hook (if provided)
 * 5. Backup, apply, re-protect, sync staging, cleanup
 * 6. On any failure, rollback from backups
 */

import type { SystemOperations } from "./system-ops.js";
import type { FileOwnership, SoulguardConfig, Result } from "./types.js";
import { diff } from "./diff.js";
import { ok, err } from "./result.js";

// ── Types ──────────────────────────────────────────────────────────────

/** Context passed to beforeApprove policy hooks. */
export type ApprovalContext = Map<
  string,
  {
    /** Content that would be applied (staging content) */
    final: string;
    /** Unified diff string (vault → staging) */
    diff: string;
    /** Current vault content */
    previous: string;
  }
>;

/** Policy error returned by beforeApprove hooks. */
export type PolicyError = {
  kind: "policy_violation";
  message: string;
};

export type ApproveOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  /** SHA-256 approval hash — must match computed hash of current staging diff */
  hash: string;
  /** Expected vault ownership to restore after writing */
  vaultOwnership: FileOwnership;
  /** Ownership for staging copies after sync (agent-writable) */
  stagingOwnership?: FileOwnership;
  /** Password provided by owner (undefined if no password set) */
  password?: string;
  /** Verify password callback — returns true if valid */
  verifyPassword?: (password: string) => Promise<boolean>;
  /** Policy hook — called with approval context before applying changes.
   *  Return err({ kind: "policy_violation", message }) to block. */
  beforeApprove?: (
    ctx: ApprovalContext,
  ) => Result<void, PolicyError> | Promise<Result<void, PolicyError>>;
};

/** Errors from approve. */
export type ApprovalError =
  | { kind: "no_changes" }
  | { kind: "wrong_password" }
  | { kind: "hash_mismatch"; message: string }
  | { kind: "policy_violation"; message: string }
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
  const { ops, config, hash, vaultOwnership, password, verifyPassword, beforeApprove } = options;

  // Verify password if configured
  if (verifyPassword) {
    if (!password) {
      return err({ kind: "wrong_password" });
    }
    const valid = await verifyPassword(password);
    if (!valid) {
      return err({ kind: "wrong_password" });
    }
  }

  // ── Phase 1: Compute diff and verify hash ──────────────────────────
  const diffResult = await diff({ ops, config });
  if (!diffResult.ok) {
    return err({ kind: "diff_failed", message: diffResult.error.kind });
  }

  if (!diffResult.value.hasChanges) {
    return err({ kind: "no_changes" });
  }

  const currentHash = diffResult.value.approvalHash!;
  if (currentHash !== hash) {
    return err({
      kind: "hash_mismatch",
      message: "Staging content changed since review. Please re-review the diff.",
    });
  }

  // ── Phase 2: Build approval context and run policy hook ────────────
  // Reuse diff results from Phase 1 to avoid redundant file reads.
  const modifiedFiles = diffResult.value.files.filter((f) => f.status === "modified");

  if (beforeApprove) {
    const ctx: ApprovalContext = new Map();
    for (const file of modifiedFiles) {
      const stagingContent = await ops.readFile(`.soulguard/staging/${file.path}`);
      const vaultContent = await ops.readFile(file.path);
      if (!stagingContent.ok || !vaultContent.ok) {
        return err({ kind: "apply_failed", message: `Cannot read ${file.path} for policy check` });
      }
      ctx.set(file.path, {
        final: stagingContent.value,
        diff: file.diff ?? "",
        previous: vaultContent.value,
      });
    }

    const policyResult = await beforeApprove(ctx);
    if (!policyResult.ok) {
      return err({ kind: "policy_violation", message: policyResult.error.message });
    }
  }

  // ── Phase 3: Re-verify hash (guard against changes during policy check) ──
  // This catches both staging AND vault changes since the diff is recomputed.
  // The approval hash covers staged content hashes; if vault changed, the diff
  // itself changes (different protectedHash), producing a different approval hash.
  const recheck = await diff({ ops, config });
  if (!recheck.ok || recheck.value.approvalHash !== hash) {
    return err({
      kind: "hash_mismatch",
      message: "Files changed during approval. Please re-review.",
    });
  }

  // ── Phase 4: Backup all affected vault files ───────────────────────
  await ops.mkdir(".soulguard/backup");
  for (const file of modifiedFiles) {
    const backupResult = await ops.copyFile(file.path, `.soulguard/backup/${file.path}`);
    if (!backupResult.ok) {
      return err({ kind: "apply_failed", message: `Backup of ${file.path} failed` });
    }
  }

  // ── Phase 5: Apply all changes ─────────────────────────────────────
  const appliedFiles: string[] = [];

  for (const file of modifiedFiles) {
    const content = await ops.readFile(`.soulguard/staging/${file.path}`);
    if (!content.ok) {
      await rollback(
        ops,
        modifiedFiles.map((f) => f.path),
        appliedFiles,
        vaultOwnership,
      );
      return err({ kind: "apply_failed", message: `Cannot read staging/${file.path}` });
    }

    const writeResult = await ops.writeFile(file.path, content.value);
    if (!writeResult.ok) {
      await rollback(
        ops,
        modifiedFiles.map((f) => f.path),
        appliedFiles,
        vaultOwnership,
      );
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
      await rollback(
        ops,
        modifiedFiles.map((f) => f.path),
        appliedFiles,
        vaultOwnership,
      );
      return err({
        kind: "apply_failed",
        message: `Cannot chown ${file.path}: ${chownResult.error.kind}`,
      });
    }

    const chmodResult = await ops.chmod(file.path, vaultOwnership.mode);
    if (!chmodResult.ok) {
      await rollback(
        ops,
        modifiedFiles.map((f) => f.path),
        appliedFiles,
        vaultOwnership,
      );
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

  // Clean up backups
  for (const file of modifiedFiles) {
    await ops.deleteFile(`.soulguard/backup/${file.path}`);
  }

  return ok({ appliedFiles });
}

/**
 * Rollback: restore vault files from backups after a partial apply failure.
 */
async function rollback(
  ops: SystemOperations,
  allFiles: string[],
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
  for (const filePath of allFiles) {
    await ops.deleteFile(`.soulguard/backup/${filePath}`);
  }
}
