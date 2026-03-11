/**
 * soulguard apply — apply staging changes to protected files.
 *
 * Built on top of StateTree: one walk, one snapshot, pure derivations.
 *
 * Implicit proposal model: staging IS the proposal. At approval time:
 * 1. Verify approval hash matches the StateTree snapshot
 * 2. Read staging content, run self-protection and policy checks
 * 3. Backup current protected files
 * 4. Apply from staging, verify each written file's hash matches snapshot
 * 5. Sync staging, cleanup
 *
 * The per-file hash verification after writing eliminates timing attacks —
 * if the agent modifies staging between the StateTree snapshot and the
 * actual copy, the written file's hash won't match the snapshot's stagedHash.
 */

import type { SystemOperations } from "../util/system-ops.js";
import type { FileOwnership, Result } from "../util/types.js";
import type { StateTree } from "./state.js";
import { ok, err } from "../util/result.js";
import type { GitCommitResult } from "../util/git.js";
import { isGitEnabled, gitCommit, protectCommitMessage } from "../util/git.js";
import type { Policy, ApprovalContext } from "./policy.js";
import { validatePolicies, evaluatePolicies } from "./policy.js";
import { validateSelfProtection } from "./self-protection.js";
import { stagingPath, STAGING_DIR } from "./staging.js";
import { dirname } from "node:path";
import { createTwoFilesPatch } from "diff";

// ── Types ──────────────────────────────────────────────────────────────

export type ApplyOptions = {
  ops: SystemOperations;
  /** Pre-built StateTree snapshot — the reviewed artifact. */
  tree: StateTree;
  /** SHA-256 approval hash — must match tree.approvalHash.
   *  If omitted, up-front hash verification is skipped. Per-file integrity
   *  checks still run unconditionally. */
  hash?: string;
  /** Named policy hooks — all evaluated before applying changes.
   *  Duplicate policy names are rejected with policy_name_collision error. */
  policies?: Policy[];
};

/** Errors from apply. */
export type ApplyError =
  | { kind: "hash_mismatch"; message: string }
  | { kind: "self_protection"; message: string }
  | { kind: "policy_violation"; violations: Array<{ policy: string; message: string }> }
  | { kind: "policy_name_collision"; duplicates: string[] }
  | { kind: "apply_failed"; message: string };

export type ApplyResult = {
  /** Files that were updated */
  appliedFiles: string[];
  /** Git commit result (undefined if git not enabled) */
  gitResult?: GitCommitResult;
};

/**
 * Collect unique parent directories that need to be created for a set of
 * file paths under a given prefix (e.g. ".soulguard/backup").
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
  const { ops, tree, hash, policies } = options;
  const protectOwnership = tree.protectOwnership;

  // ── Phase 0: Validate policies + verify approval hash up front ──────
  if (policies && policies.length > 0) {
    const validation = validatePolicies(policies);
    if (!validation.ok) {
      return err(validation.error);
    }
  }

  const changedFiles = tree.changedFiles();

  if (changedFiles.length === 0) {
    return ok({ appliedFiles: [] });
  }

  if (hash) {
    if (tree.approvalHash !== hash) {
      return err({
        kind: "hash_mismatch",
        message: `Expected hash ${hash} but got hash ${tree.approvalHash}`,
      });
    }
  }

  const nonDeletedFiles = changedFiles.filter((f) => f.status !== "deleted");

  // ── Phase 1: Read staging, self-protection, policies ────────────────
  const stagingContents = new Map<string, string>();
  for (const file of nonDeletedFiles) {
    const content = await ops.readFile(stagingPath(file.path));
    if (!content.ok) {
      return err({
        kind: "apply_failed",
        message: `Cannot read staging/${file.path}`,
      });
    }
    stagingContents.set(file.path, content.value);
  }

  // ── Phase 1a: Built-in self-protection ──────────────────────────────
  {
    const selfCheck = validateSelfProtection(
      stagingContents,
      changedFiles.filter((f) => f.status === "deleted"),
    );
    if (!selfCheck.ok) {
      return err(selfCheck.error);
    }
  }

  // ── Phase 1b: Run user-provided policy hooks ───────────────────────
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
        // Generate diff text for policies
        const final = stagingContents.get(file.path)!;
        const diffText =
          file.status === "modified"
            ? createTwoFilesPatch(`a/${file.path}`, `b/${file.path}`, previous, final)
            : "";
        ctx.set(file.path, { final, diff: diffText, previous });
      }
    }

    const policyResult = await evaluatePolicies(policies, ctx);
    if (!policyResult.ok) {
      return err(policyResult.error);
    }
  }

  // ── Phase 2: Backup all affected protected files ───────────────────
  await ops.mkdir(".soulguard/backup");

  const filesToBackup = changedFiles.filter((f) => f.status !== "created");
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
      return err({ kind: "apply_failed", message: `Backup of ${file.path} failed` });
    }
  }

  // ── Phase 3: Apply changes + per-file hash verification ─────────────
  const appliedFiles: string[] = [];

  for (const file of changedFiles) {
    if (file.status === "deleted") {
      const deleteResult = await ops.deleteFile(file.path);
      if (!deleteResult.ok) {
        await rollback(ops, appliedFiles, protectOwnership);
        return err({
          kind: "apply_failed",
          message: `Cannot delete ${file.path}: ${deleteResult.error.kind}`,
        });
      }
    } else {
      if (file.status === "created") {
        const parentDir = dirname(file.path);
        if (parentDir !== ".") {
          await ops.mkdir(parentDir);
        }
      }

      const content = await ops.readFile(stagingPath(file.path));
      if (!content.ok) {
        await rollback(ops, appliedFiles, protectOwnership);
        return err({ kind: "apply_failed", message: `Cannot read staging/${file.path}` });
      }

      const writeResult = await ops.writeFile(file.path, content.value);
      if (!writeResult.ok) {
        await rollback(ops, appliedFiles, protectOwnership);
        return err({
          kind: "apply_failed",
          message: `Cannot write ${file.path}: ${writeResult.error.kind}`,
        });
      }

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

      // Per-file integrity check: verify written content matches snapshot
      const writtenHash = await ops.hashFile(file.path);
      if (!writtenHash.ok || writtenHash.value !== file.stagedHash) {
        await rollback(ops, appliedFiles, protectOwnership);
        return err({
          kind: "hash_mismatch",
          message: `Staging tampered: ${file.path} content after write does not match snapshot`,
        });
      }
    }
    appliedFiles.push(file.path);
  }

  // ── Phase 4: Sync staging copies + cleanup ──────────────────────────
  for (const file of nonDeletedFiles) {
    const stagePath = stagingPath(file.path);
    const stageParent = dirname(stagePath);
    if (stageParent !== STAGING_DIR) {
      await ops.mkdir(stageParent);
    }
    await ops.copyFile(file.path, stagePath);
  }

  await cleanupBackup(ops);

  // ── Git auto-commit (best-effort) ───────────────────────────────────
  let gitResult: GitCommitResult | undefined;
  if (await isGitEnabled(ops, tree.config)) {
    const message = protectCommitMessage(appliedFiles);
    const result = await gitCommit(ops, appliedFiles, message);
    if (result.ok) {
      gitResult = result.value;
    }
  }

  return ok({ appliedFiles, gitResult });
}

async function cleanupBackup(ops: SystemOperations): Promise<void> {
  await ops.deleteFile(".soulguard/backup");
}

async function rollback(
  ops: SystemOperations,
  appliedFiles: string[],
  protectOwnership: FileOwnership,
): Promise<void> {
  for (const filePath of appliedFiles) {
    const backupExists = await ops.exists(`.soulguard/backup/${filePath}`);
    if (backupExists.ok && backupExists.value) {
      const backupContent = await ops.readFile(`.soulguard/backup/${filePath}`);
      if (backupContent.ok) {
        await ops.writeFile(filePath, backupContent.value);
        await ops.chown(filePath, protectOwnership);
        await ops.chmod(filePath, protectOwnership.mode);
      }
    } else {
      // No backup = was created by this apply. Delete to roll back.
      await ops.deleteFile(filePath);
    }
  }
  await cleanupBackup(ops);
}
