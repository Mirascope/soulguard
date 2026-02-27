/**
 * soulguard approve — apply staging changes to vault files.
 *
 * Implicit proposal model: staging IS the proposal. At approval time:
 * 1. Compute diff to find modified files
 * 2. Copy modified staging files to protected .soulguard/pending/
 * 3. Hash the frozen pending copies and verify against reviewer's hash
 * 4. Backup current vault files
 * 5. Apply from pending copies, re-protect vault files
 * 6. Sync staging, cleanup
 *
 * The protected copy step eliminates timing attacks — once files are in
 * .soulguard/pending/ (owned by soulguardian), the agent cannot modify them.
 * The hash is verified against these frozen copies, not the live staging dir.
 */

import type { SystemOperations } from "./system-ops.js";
import type { FileOwnership, SoulguardConfig, Result } from "./types.js";
import { diff, computeApprovalHash } from "./diff.js";
import type { FileDiff } from "./diff.js";
import { ok, err } from "./result.js";
import type { GitCommitResult } from "./git.js";
import { isGitEnabled, gitCommit, vaultCommitMessage } from "./git.js";
import type { Policy, ApprovalContext } from "./policy.js";
import { validatePolicies, evaluatePolicies } from "./policy.js";
import { validateSelfProtection } from "./self-protection.js";

// ── Types ──────────────────────────────────────────────────────────────

export type ApproveOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  /** SHA-256 approval hash — must match computed hash of frozen pending copies */
  hash: string;
  /** Expected vault ownership to restore after writing */
  vaultOwnership: FileOwnership;
  /** Ownership for staging copies after sync (agent-writable) */
  stagingOwnership?: FileOwnership;
  /** Named policy hooks — all evaluated before applying changes.
   *  Duplicate policy names are rejected with policy_name_collision error. */
  policies?: Policy[];
};

/** Errors from approve. */
export type ApprovalError =
  | { kind: "no_changes" }
  | { kind: "hash_mismatch"; message: string }
  | { kind: "self_protection"; message: string }
  | { kind: "policy_violation"; violations: Array<{ policy: string; message: string }> }
  | { kind: "policy_name_collision"; duplicates: string[] }
  | { kind: "apply_failed"; message: string }
  | { kind: "diff_failed"; message: string };

export type ApproveResult = {
  /** Files that were updated */
  appliedFiles: string[];
  /** Git commit result (undefined if git not enabled) */
  gitResult?: GitCommitResult;
};

/**
 * Approve and apply staging changes to vault.
 */
export async function approve(
  options: ApproveOptions,
): Promise<Result<ApproveResult, ApprovalError>> {
  const { ops, config, hash, vaultOwnership, policies } = options;

  // ── Phase 0: Validate policy names (fail fast on collisions) ────────
  if (policies && policies.length > 0) {
    const validation = validatePolicies(policies);
    if (!validation.ok) {
      return err(validation.error);
    }
  }

  // ── Phase 1: Compute diff to find changed files ────────────────────
  const diffResult = await diff({ ops, config });
  if (!diffResult.ok) {
    return err({ kind: "diff_failed", message: diffResult.error.kind });
  }

  if (!diffResult.value.hasChanges) {
    return err({ kind: "no_changes" });
  }

  // Files that need to be applied (modified, new, or deleted)
  const changedFiles = diffResult.value.files.filter(
    (f) => f.status === "modified" || f.status === "vault_missing" || f.status === "deleted",
  );
  const deletedFiles = changedFiles.filter((f) => f.status === "deleted");
  const contentFiles = changedFiles.filter((f) => f.status !== "deleted");

  // ── Phase 2: Copy staging to protected working dir ─────────────────
  // Once in .soulguard/pending/ (owned by soulguardian), the agent cannot
  // modify these files. This freezes the content before we verify the hash.
  await ops.mkdir(".soulguard/pending");
  for (const file of contentFiles) {
    const copyResult = await ops.copyFile(
      `.soulguard/staging/${file.path}`,
      `.soulguard/pending/${file.path}`,
    );
    if (!copyResult.ok) {
      await cleanupPending(ops, contentFiles);
      return err({ kind: "apply_failed", message: `Cannot copy staging/${file.path} to pending` });
    }
  }

  // Protect the pending dir so agent can't tamper during approval
  // TODO: chown recursively (needs ops interface change — tracked upstack)
  const chownPending = await ops.chown(".soulguard/pending", vaultOwnership);
  if (!chownPending.ok) {
    await cleanupPending(ops, contentFiles);
    return err({ kind: "apply_failed", message: "Cannot protect pending directory" });
  }

  // ── Phase 3: Hash the frozen pending copies and verify ─────────────
  // Compute the approval hash from the now-protected pending files.
  // This is the authoritative check — if the agent modified staging between
  // the diff and the copy, the pending hash won't match the reviewer's hash.
  const pendingHash = await computePendingHash(ops, contentFiles, deletedFiles);
  if (!pendingHash.ok) {
    await cleanupPending(ops, contentFiles);
    return err({ kind: "apply_failed", message: pendingHash.error });
  }

  if (pendingHash.value !== hash) {
    await cleanupPending(ops, contentFiles);
    return err({
      kind: "hash_mismatch",
      message: `Expected hash ${hash} but got hash ${pendingHash.value}`,
    });
  }

  // ── Phase 3a: Read all pending file contents (used by self-protection + policies) ──
  const pendingContents = new Map<string, string>();
  for (const file of contentFiles) {
    const content = await ops.readFile(`.soulguard/pending/${file.path}`);
    if (!content.ok) {
      await cleanupPending(ops, contentFiles);
      return err({
        kind: "apply_failed",
        message: `Cannot read pending/${file.path}`,
      });
    }
    pendingContents.set(file.path, content.value);
  }

  // ── Phase 3b: Built-in self-protection (hardcoded, cannot be bypassed) ──
  {
    // Block deletion of soulguard.json — config must always exist
    if (deletedFiles.some((f) => f.path === "soulguard.json")) {
      await cleanupPending(ops, contentFiles);
      return err({
        kind: "self_protection",
        message: "Cannot delete soulguard.json — it is required for soulguard to function",
      });
    }
    const selfCheck = validateSelfProtection(pendingContents);
    if (!selfCheck.ok) {
      await cleanupPending(ops, contentFiles);
      return err(selfCheck.error);
    }
  }

  // ── Phase 3c: Run user-provided policy hooks against frozen content ──
  if (policies && policies.length > 0) {
    const ctx: ApprovalContext = new Map();
    for (const file of contentFiles) {
      let previous = "";
      if (file.status === "modified") {
        const vaultContent = await ops.readFile(file.path);
        if (vaultContent.ok) {
          previous = vaultContent.value;
        }
      }
      ctx.set(file.path, {
        final: pendingContents.get(file.path)!,
        diff: file.diff ?? "",
        previous,
      });
    }
    for (const file of deletedFiles) {
      const vaultContent = await ops.readFile(file.path);
      ctx.set(file.path, {
        final: "",
        diff: `File deleted: ${file.path}`,
        previous: vaultContent.ok ? vaultContent.value : "",
      });
    }

    const policyResult = await evaluatePolicies(policies, ctx);
    if (!policyResult.ok) {
      await cleanupPending(ops, contentFiles);
      return err(policyResult.error);
    }
  }

  // ── Phase 4: Backup all affected vault files ───────────────────────
  const backedUpFiles: string[] = [];
  await ops.mkdir(".soulguard/backup");
  for (const file of changedFiles) {
    // Only backup files that exist in vault (skip new files)
    if (file.status === "vault_missing") continue;
    const backupResult = await ops.copyFile(file.path, `.soulguard/backup/${file.path}`);
    if (!backupResult.ok) {
      await cleanupBackup(ops, backedUpFiles);
      await cleanupPending(ops, contentFiles);
      return err({ kind: "apply_failed", message: `Backup of ${file.path} failed` });
    }
    backedUpFiles.push(file.path);
  }

  // ── Phase 5: Apply changes ─────────────────────────────────────────
  const appliedFiles: string[] = [];

  // 5a: Apply content changes (modified + new files)
  for (const file of contentFiles) {
    const content = await ops.readFile(`.soulguard/pending/${file.path}`);
    if (!content.ok) {
      await rollback(ops, contentFiles, appliedFiles, backedUpFiles, vaultOwnership);
      return err({ kind: "apply_failed", message: `Cannot read pending/${file.path}` });
    }

    const writeResult = await ops.writeFile(file.path, content.value);
    if (!writeResult.ok) {
      await rollback(ops, contentFiles, appliedFiles, backedUpFiles, vaultOwnership);
      return err({
        kind: "apply_failed",
        message: `Cannot write ${file.path}: ${writeResult.error.kind}`,
      });
    }

    // Re-protect
    const chownResult = await ops.chown(file.path, vaultOwnership);
    if (!chownResult.ok) {
      await rollback(ops, contentFiles, appliedFiles, backedUpFiles, vaultOwnership);
      return err({
        kind: "apply_failed",
        message: `Cannot chown ${file.path}: ${chownResult.error.kind}`,
      });
    }

    const chmodResult = await ops.chmod(file.path, vaultOwnership.mode);
    if (!chmodResult.ok) {
      await rollback(ops, contentFiles, appliedFiles, backedUpFiles, vaultOwnership);
      return err({
        kind: "apply_failed",
        message: `Cannot chmod ${file.path}: ${chmodResult.error.kind}`,
      });
    }

    appliedFiles.push(file.path);
  }

  // 5b: Apply deletions
  for (const file of deletedFiles) {
    const deleteResult = await ops.deleteFile(file.path);
    if (!deleteResult.ok) {
      await rollback(ops, contentFiles, appliedFiles, backedUpFiles, vaultOwnership);
      return err({
        kind: "apply_failed",
        message: `Cannot delete ${file.path}: ${deleteResult.error.kind}`,
      });
    }
    appliedFiles.push(file.path);
  }

  // ── Phase 6: Sync staging copies + cleanup ─────────────────────────
  for (const file of contentFiles) {
    const stagingPath = `.soulguard/staging/${file.path}`;
    await ops.copyFile(file.path, stagingPath);
    if (options.stagingOwnership) {
      await ops.chown(stagingPath, options.stagingOwnership);
      await ops.chmod(stagingPath, options.stagingOwnership.mode);
    }
  }
  // Deleted files: staging copy is already gone (that's how we detected the deletion)

  // Clean up backup and pending
  await cleanupBackup(ops, backedUpFiles);
  await cleanupPending(ops, contentFiles);

  // ── Git auto-commit (best-effort) ──────────────────────────────────
  let gitResult: GitCommitResult | undefined;
  if (await isGitEnabled(ops, config)) {
    const message = vaultCommitMessage(appliedFiles);
    const result = await gitCommit(ops, appliedFiles, message);
    if (result.ok) {
      gitResult = result.value;
    }
    // Git failures are swallowed — vault update already succeeded
  }

  return ok({ appliedFiles, gitResult });
}

/**
 * Compute approval hash from frozen pending copies.
 * Reuses computeApprovalHash from diff.ts for a single hash algorithm.
 */
async function computePendingHash(
  ops: SystemOperations,
  contentFiles: FileDiff[],
  deletedFiles: FileDiff[],
): Promise<Result<string, string>> {
  // Build FileDiff-compatible entries with hashes from pending copies
  const withHashes: FileDiff[] = [];
  for (const f of contentFiles) {
    const fileHash = await ops.hashFile(`.soulguard/pending/${f.path}`);
    if (!fileHash.ok) {
      return err(`Cannot hash pending/${f.path}`);
    }
    withHashes.push({ ...f, stagedHash: fileHash.value });
  }
  // Deleted files pass through — they use protectedHash from the vault file
  for (const f of deletedFiles) {
    withHashes.push(f);
  }
  return ok(computeApprovalHash(withHashes));
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
 * Clean up backup files.
 */
async function cleanupBackup(ops: SystemOperations, backedUpFiles: string[]): Promise<void> {
  for (const filePath of backedUpFiles) {
    await ops.deleteFile(`.soulguard/backup/${filePath}`);
  }
}

/**
 * Rollback: restore vault files from backups after a partial apply failure.
 */
async function rollback(
  ops: SystemOperations,
  contentFiles: FileDiff[],
  appliedFiles: string[],
  backedUpFiles: string[],
  vaultOwnership: FileOwnership,
): Promise<void> {
  for (const filePath of appliedFiles) {
    const backupContent = await ops.readFile(`.soulguard/backup/${filePath}`);
    if (backupContent.ok) {
      await ops.writeFile(filePath, backupContent.value);
      await ops.chown(filePath, vaultOwnership);
      await ops.chmod(filePath, vaultOwnership.mode);
    }
  }
  await cleanupBackup(ops, backedUpFiles);
  await cleanupPending(ops, contentFiles);
}
