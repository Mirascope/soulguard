/**
 * soulguard apply — apply staging changes to protect-tier files.
 *
 * Implicit proposal model: staging IS the proposal. At approval time:
 * 1. Compute diff to find modified files
 * 2. Copy modified staging files to protected .soulguard/pending/
 * 3. Hash the frozen pending copies and verify against reviewer's hash
 * 4. Backup current protect-tier files
 * 5. Apply from pending copies, re-protect protect-tier files
 * 6. Sync staging, cleanup
 *
 * The protected copy step eliminates timing attacks — once files are in
 * .soulguard/pending/ (owned by soulguardian), the agent cannot modify them.
 * The hash is verified against these frozen copies, not the live staging dir.
 *
 * Directory support: when a protect entry is a directory, diff produces
 * individual FileDiff entries for each file within. Apply handles these
 * transparently — creating parent directories as needed for pending/backup
 * copies and cleaning up directory trees after apply.
 */

import type { SystemOperations } from "../util/system-ops.js";
import type { FileOwnership, SoulguardConfig, Result } from "../util/types.js";
import { diff, computeApprovalHash } from "./diff.js";
import type { FileDiff } from "./diff.js";
import { ok, err } from "../util/result.js";
import type { GitCommitResult } from "../util/git.js";
import { isGitEnabled, gitCommit, protectCommitMessage } from "../util/git.js";
import type { Policy, ApprovalContext } from "./policy.js";
import { validatePolicies, evaluatePolicies } from "./policy.js";
import { validateSelfProtection } from "./self-protection.js";
import { stagingPath, STAGING_DIR } from "./staging.js";
import { dirname } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────

export type ApplyOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  /** SHA-256 approval hash — must match computed hash of frozen pending copies.
   *  If omitted, hash verification is skipped (convenient but slightly less secure). */
  hash?: string;
  /** Expected protect ownership to restore after writing */
  protectOwnership: FileOwnership;
  /** Named policy hooks — all evaluated before applying changes.
   *  Duplicate policy names are rejected with policy_name_collision error. */
  policies?: Policy[];
};

/** Errors from apply. */
export type ApplyError =
  | { kind: "no_changes" }
  | { kind: "hash_mismatch"; message: string }
  | { kind: "self_protection"; message: string }
  | { kind: "policy_violation"; violations: Array<{ policy: string; message: string }> }
  | { kind: "policy_name_collision"; duplicates: string[] }
  | { kind: "apply_failed"; message: string }
  | { kind: "diff_failed"; message: string };

export type ApplyResult = {
  /** Files that were updated */
  appliedFiles: string[];
  /** Git commit result (undefined if git not enabled) */
  gitResult?: GitCommitResult;
};

/**
 * Collect unique parent directories that need to be created for a set of
 * file paths under a given prefix (e.g. ".soulguard/pending").
 */
function collectParentDirs(prefix: string, paths: string[]): string[] {
  const dirs = new Set<string>();
  for (const p of paths) {
    const parent = dirname(`${prefix}/${p}`);
    if (parent !== prefix) {
      dirs.add(parent);
    }
  }
  return [...dirs].sort();
}

/**
 * Apply staging changes to protect.
 */
export async function apply(options: ApplyOptions): Promise<Result<ApplyResult, ApplyError>> {
  const { ops, config, hash, protectOwnership, policies } = options;

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
    (f) => f.status === "modified" || f.status === "protect_missing" || f.status === "deleted",
  );

  // ── Phase 2: Copy staging to protected working dir ─────────────────
  // Once in .soulguard/pending/ (owned by soulguardian), the agent cannot
  // modify these files. This freezes the content before we verify the hash.
  await ops.mkdir(".soulguard/pending");

  // Create parent directories for nested file paths in pending
  const nonDeletedFiles = changedFiles.filter((f) => f.status !== "deleted");
  const pendingParents = collectParentDirs(
    ".soulguard/pending",
    nonDeletedFiles.map((f) => f.path),
  );
  for (const dir of pendingParents) {
    await ops.mkdir(dir);
  }

  for (const file of nonDeletedFiles) {
    const copyResult = await ops.copyFile(
      stagingPath(file.path),
      `.soulguard/pending/${file.path}`,
    );
    if (!copyResult.ok) {
      await cleanupPending(ops);
      return err({ kind: "apply_failed", message: `Cannot copy staging/${file.path} to pending` });
    }
  }

  // Protect the pending dir so agent can't tamper during approval
  const chownPending = await ops.chown(".soulguard/pending", protectOwnership);
  if (!chownPending.ok) {
    await cleanupPending(ops);
    return err({ kind: "apply_failed", message: "Cannot protect pending directory" });
  }

  // ── Phase 3: Hash the frozen pending copies and verify ─────────────
  // If hash is provided, verify it matches the frozen pending state.
  // If hash is omitted (--yes mode), skip verification for convenience.
  if (hash) {
    const pendingHash = await computePendingHash(ops, changedFiles);
    if (!pendingHash.ok) {
      await cleanupPending(ops);
      return err({ kind: "apply_failed", message: pendingHash.error });
    }

    if (pendingHash.value !== hash) {
      await cleanupPending(ops);
      return err({
        kind: "hash_mismatch",
        message: `Expected hash ${hash} but got hash ${pendingHash.value}`,
      });
    }
  }

  // ── Phase 3a: Read all pending file contents (used by self-protection + policies) ──
  const pendingContents = new Map<string, string>();
  for (const file of nonDeletedFiles) {
    const content = await ops.readFile(`.soulguard/pending/${file.path}`);
    if (!content.ok) {
      await cleanupPending(ops);
      return err({
        kind: "apply_failed",
        message: `Cannot read pending/${file.path}`,
      });
    }
    pendingContents.set(file.path, content.value);
  }

  // ── Phase 3b: Built-in self-protection (hardcoded, cannot be bypassed) ──
  {
    const selfCheck = validateSelfProtection(
      pendingContents,
      changedFiles.filter((f) => f.status === "deleted"),
    );
    if (!selfCheck.ok) {
      await cleanupPending(ops);
      return err(selfCheck.error);
    }
  }

  // ── Phase 3c: Run user-provided policy hooks against frozen content ──
  if (policies && policies.length > 0) {
    const ctx: ApprovalContext = new Map();
    for (const file of changedFiles) {
      if (file.status === "deleted") {
        const protectContent = await ops.readFile(file.path);
        ctx.set(file.path, {
          final: "",
          diff: `File deleted: ${file.path}`,
          previous: protectContent.ok ? protectContent.value : "",
        });
      } else {
        let previous = "";
        if (file.status === "modified") {
          const protectContent = await ops.readFile(file.path);
          if (protectContent.ok) {
            previous = protectContent.value;
          }
        }
        ctx.set(file.path, {
          final: pendingContents.get(file.path)!,
          diff: file.diff ?? "",
          previous,
        });
      }
    }

    const policyResult = await evaluatePolicies(policies, ctx);
    if (!policyResult.ok) {
      await cleanupPending(ops);
      return err(policyResult.error);
    }
  }

  // ── Phase 4: Backup all affected protect-tier files ───────────────────────
  await ops.mkdir(".soulguard/backup");

  // Create parent directories for nested file paths in backup
  const filesToBackup = changedFiles.filter((f) => f.status !== "protect_missing");
  const backupParents = collectParentDirs(
    ".soulguard/backup",
    filesToBackup.map((f) => f.path),
  );
  for (const dir of backupParents) {
    await ops.mkdir(dir);
  }

  for (const file of filesToBackup) {
    const backupResult = await ops.copyFile(file.path, `.soulguard/backup/${file.path}`);
    if (!backupResult.ok) {
      await cleanupBackup(ops);
      await cleanupPending(ops);
      return err({ kind: "apply_failed", message: `Backup of ${file.path} failed` });
    }
  }

  // ── Phase 5: Apply changes ─────────────────────────────────────────
  const appliedFiles: string[] = [];

  for (const file of changedFiles) {
    if (file.status === "deleted") {
      // Delete protect-tier file
      const deleteResult = await ops.deleteFile(file.path);
      if (!deleteResult.ok) {
        await rollback(ops, appliedFiles, protectOwnership);
        return err({
          kind: "apply_failed",
          message: `Cannot delete ${file.path}: ${deleteResult.error.kind}`,
        });
      }
    } else {
      // For new files in directories, ensure parent dirs exist
      if (file.status === "protect_missing") {
        const parentDir = dirname(file.path);
        if (parentDir !== ".") {
          await ops.mkdir(parentDir);
        }
      }

      // Write content from pending
      const content = await ops.readFile(`.soulguard/pending/${file.path}`);
      if (!content.ok) {
        await rollback(ops, appliedFiles, protectOwnership);
        return err({ kind: "apply_failed", message: `Cannot read pending/${file.path}` });
      }

      const writeResult = await ops.writeFile(file.path, content.value);
      if (!writeResult.ok) {
        await rollback(ops, appliedFiles, protectOwnership);
        return err({
          kind: "apply_failed",
          message: `Cannot write ${file.path}: ${writeResult.error.kind}`,
        });
      }

      // Re-protect
      const chownResult = await ops.chown(file.path, protectOwnership);
      if (!chownResult.ok) {
        await rollback(ops, appliedFiles, protectOwnership);
        return err({
          kind: "apply_failed",
          message: `Cannot chown ${file.path}: ${chownResult.error.kind}`,
        });
      }

      const chmodResult = await ops.chmod(file.path, protectOwnership.mode);
      if (!chmodResult.ok) {
        await rollback(ops, appliedFiles, protectOwnership);
        return err({
          kind: "apply_failed",
          message: `Cannot chmod ${file.path}: ${chmodResult.error.kind}`,
        });
      }
    }
    appliedFiles.push(file.path);
  }

  // ── Phase 6: Sync staging copies + cleanup ─────────────────────────
  for (const file of nonDeletedFiles) {
    const stagePath = stagingPath(file.path);
    // Ensure parent dirs exist in staging for directory entries
    const stageParent = dirname(stagePath);
    if (stageParent !== STAGING_DIR) {
      await ops.mkdir(stageParent);
    }
    await ops.copyFile(file.path, stagePath);
    // Staging siblings inherit default ownership — no special chown needed
  }
  // Deleted files: staging copy is already gone (that's how we detected the deletion)

  // Clean up backup and pending
  await cleanupBackup(ops);
  await cleanupPending(ops);

  // ── Git auto-commit (best-effort) ──────────────────────────────────
  let gitResult: GitCommitResult | undefined;
  if (await isGitEnabled(ops, config)) {
    const message = protectCommitMessage(appliedFiles);
    const result = await gitCommit(ops, appliedFiles, message);
    if (result.ok) {
      gitResult = result.value;
    }
    // Git failures are swallowed — protect update already succeeded
  }

  return ok({ appliedFiles, gitResult });
}

/**
 * Compute approval hash from frozen pending copies.
 * Reuses computeApprovalHash from diff.ts for a single hash algorithm.
 */
async function computePendingHash(
  ops: SystemOperations,
  changedFiles: FileDiff[],
): Promise<Result<string, string>> {
  const withHashes: FileDiff[] = [];
  for (const f of changedFiles) {
    if (f.status === "deleted") {
      // Deleted files pass through — they use protectedHash from the protect-tier file
      withHashes.push(f);
    } else {
      const fileHash = await ops.hashFile(`.soulguard/pending/${f.path}`);
      if (!fileHash.ok) {
        return err(`Cannot hash pending/${f.path}`);
      }
      withHashes.push({ ...f, stagedHash: fileHash.value });
    }
  }
  return ok(computeApprovalHash(withHashes));
}

/**
 * Clean up pending directory on early exit.
 * Simply removes the entire temporary working directory.
 */
async function cleanupPending(ops: SystemOperations): Promise<void> {
  await ops.deleteFile(".soulguard/pending");
}

/**
 * Clean up backup directory.
 * Simply removes the entire temporary working directory.
 */
async function cleanupBackup(ops: SystemOperations): Promise<void> {
  await ops.deleteFile(".soulguard/backup");
}

/**
 * Rollback: restore protect-tier files from backups after a partial apply failure.
 */
async function rollback(
  ops: SystemOperations,
  appliedFiles: string[],
  protectOwnership: FileOwnership,
): Promise<void> {
  for (const filePath of appliedFiles) {
    const backupContent = await ops.readFile(`.soulguard/backup/${filePath}`);
    if (backupContent.ok) {
      await ops.writeFile(filePath, backupContent.value);
      await ops.chown(filePath, protectOwnership);
      await ops.chmod(filePath, protectOwnership.mode);
    }
  }
  await cleanupBackup(ops);
  await cleanupPending(ops);
}
