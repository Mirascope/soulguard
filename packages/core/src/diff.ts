/**
 * soulguard diff — compare protect-tier files against their staging copies.
 */

import { createHash } from "node:crypto";
import { createTwoFilesPatch } from "diff";
import type { Result } from "./result.js";
import { ok, err } from "./result.js";
import type { SoulguardConfig } from "./types.js";
import type { SystemOperations } from "./system-ops.js";
import { resolvePatterns } from "./glob.js";
import { stagingPath } from "./staging.js";

// ── Types ──────────────────────────────────────────────────────────────

export type FileDiff = {
  path: string;
  status: "modified" | "unchanged" | "protect_missing" | "staging_missing" | "deleted";
  /** Unified diff string (only for modified) */
  diff?: string;
  protectedHash?: string;
  stagedHash?: string;
};

export type DiffResult = {
  files: FileDiff[];
  hasChanges: boolean;
  /**
   * Approval hash — SHA-256 of all modified file paths + staged content hashes,
   * sorted deterministically. Used for hash-based apply integrity check.
   * Only present when there are changes.
   */
  approvalHash?: string;
};

export type DiffError =
  | { kind: "no_config" }
  | { kind: "read_failed"; path: string; message: string };

export type DiffOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  /** Specific files to diff (default: all protect-tier files) */
  files?: string[];
};

// ── Implementation ─────────────────────────────────────────────────────

/**
 * Compare protect-tier files against their staging copies.
 */
export async function diff(options: DiffOptions): Promise<Result<DiffResult, DiffError>> {
  const { ops, config, files: filterFiles } = options;

  // Resolve glob patterns to concrete file paths
  const resolved = await resolvePatterns(ops, config.protect);
  if (!resolved.ok) {
    return err({ kind: "read_failed", path: "glob", message: resolved.error.message });
  }
  let protectFiles = resolved.value;
  if (filterFiles && filterFiles.length > 0) {
    const filterSet = new Set(filterFiles);
    protectFiles = protectFiles.filter((p) => filterSet.has(p));
  }

  const fileDiffs: FileDiff[] = [];

  for (const path of protectFiles) {
    const stagePath = stagingPath(path);

    const [protectExists, stagingExists] = await Promise.all([
      ops.exists(path),
      ops.exists(stagePath),
    ]);

    if (!protectExists.ok) {
      return err({ kind: "read_failed", path, message: protectExists.error.message });
    }
    if (!stagingExists.ok) {
      return err({
        kind: "read_failed",
        path: stagePath,
        message: stagingExists.error.message,
      });
    }

    // Missing cases
    if (protectExists.value && !stagingExists.value) {
      // Protect-tier file exists but staging copy deleted → agent wants to delete this file
      const protectHash = await ops.hashFile(path);
      fileDiffs.push({
        path,
        status: "deleted",
        protectedHash: protectHash.ok ? protectHash.value : undefined,
      });
      continue;
    }
    if (!protectExists.value && stagingExists.value) {
      // New file — hash staging so it's covered by the approval hash
      const newHash = await ops.hashFile(stagePath);
      fileDiffs.push({
        path,
        status: "protect_missing",
        stagedHash: newHash.ok ? newHash.value : undefined,
      });
      continue;
    }
    if (!protectExists.value && !stagingExists.value) {
      fileDiffs.push({ path, status: "staging_missing" });
      continue;
    }

    // Both exist — compare hashes
    const [protectHash, stagingHash] = await Promise.all([
      ops.hashFile(path),
      ops.hashFile(stagePath),
    ]);

    if (!protectHash.ok) {
      return err({ kind: "read_failed", path, message: "hash failed" });
    }
    if (!stagingHash.ok) {
      return err({ kind: "read_failed", path: stagePath, message: "hash failed" });
    }

    if (protectHash.value === stagingHash.value) {
      fileDiffs.push({
        path,
        status: "unchanged",
        protectedHash: protectHash.value,
        stagedHash: stagingHash.value,
      });
      continue;
    }

    // Modified — generate unified diff
    const [protectContent, stagingContent] = await Promise.all([
      ops.readFile(path),
      ops.readFile(stagePath),
    ]);

    if (!protectContent.ok) {
      return err({ kind: "read_failed", path, message: "read failed" });
    }
    if (!stagingContent.ok) {
      return err({ kind: "read_failed", path: stagePath, message: "read failed" });
    }

    const unifiedDiff = createTwoFilesPatch(
      `a/${path}`,
      `b/${path}`,
      protectContent.value,
      stagingContent.value,
    );

    fileDiffs.push({
      path,
      status: "modified",
      diff: unifiedDiff,
      protectedHash: protectHash.value,
      stagedHash: stagingHash.value,
    });
  }

  const hasChanges = fileDiffs.some((f) => f.status !== "unchanged");

  // Compute approval hash from modified files (deterministic)
  let approvalHash: string | undefined;
  if (hasChanges) {
    approvalHash = computeApprovalHash(fileDiffs);
  }

  return ok({ files: fileDiffs, hasChanges, approvalHash });
}

/**
 * Compute a deterministic approval hash from file diffs.
 * Covers all modified files — sorted by path, hashing path + stagedHash pairs.
 * This is the integrity token for hash-based apply.
 */
export function computeApprovalHash(files: FileDiff[]): string {
  // Include modified, new (protect_missing), and deleted files in the hash
  const actionable = files
    .filter(
      (f) =>
        ((f.status === "modified" || f.status === "protect_missing") && f.stagedHash) ||
        f.status === "deleted",
    )
    .sort((a, b) => a.path.localeCompare(b.path));

  const hash = createHash("sha256");
  for (const f of actionable) {
    if (f.status === "deleted") {
      // Use a sentinel for deletions — hash includes the protect hash to prevent replay
      hash.update(`${f.path}\0DELETED\0${f.protectedHash ?? ""}\0`);
    } else {
      hash.update(`${f.path}\0${f.stagedHash}\0`);
    }
  }
  return hash.digest("hex");
}
