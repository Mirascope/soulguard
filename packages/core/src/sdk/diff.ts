/**
 * soulguard diff — compare protect-tier files/directories against their staging copies.
 *
 * Built on top of StateTree: one walk, one snapshot, pure derivations.
 * The unified diff text for modified files is generated on demand from
 * the state tree's file entries.
 */

import { createHash } from "node:crypto";
import { createTwoFilesPatch } from "diff";
import type { Result } from "../util/result.js";
import { ok, err } from "../util/result.js";
import type { SoulguardConfig } from "../util/types.js";
import type { SystemOperations } from "../util/system-ops.js";
import { StateTree } from "./state.js";
import type { StateFile } from "./state.js";
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
 *
 * Builds a StateTree and derives all diff information from it.
 */
export async function diff(options: DiffOptions): Promise<Result<DiffResult, DiffError>> {
  const { ops, config, files: filterFiles } = options;

  // Build the unified state tree
  const treeResult = await StateTree.build({ ops, config });
  if (!treeResult.ok) {
    return err({ kind: "read_failed", path: "", message: treeResult.error.message });
  }

  const tree = treeResult.value;

  // Collect directory paths so we can skip unchanged files inside directories —
  // matching the old diff behavior where directory diffs only reported changed files.
  // Use actual entities (not just config keys) since StateTree auto-detects directories.
  const dirConfigPaths = new Set<string>();
  for (const e of tree.entities) {
    if (e.kind === "directory") {
      dirConfigPaths.add(e.path);
    }
  }

  let stateFiles = tree.flatFiles();

  // Apply file filter if specified
  if (filterFiles && filterFiles.length > 0) {
    const filterSet = new Set(filterFiles);
    stateFiles = stateFiles.filter((f) => filterSet.has(f.path));
  }

  // Convert StateFile entries to FileDiff entries.
  // Skip unchanged files that live under directory config entries
  // (old diff behavior: directories only reported changed files).
  const fileDiffs: FileDiff[] = [];

  for (const sf of stateFiles) {
    const isUnderDir = [...dirConfigPaths].some((dp) => sf.path.startsWith(dp + "/"));
    if (isUnderDir && sf.status === "unchanged") continue;

    const fileDiff = await stateFileToFileDiff(ops, sf);
    if (!fileDiff.ok) return fileDiff;
    fileDiffs.push(fileDiff.value);
  }

  // Detect config entries with nothing on disk or in staging (staging_missing).
  // StateTree omits these as "no ghost entities", but the old diff API reports them.
  const allEntityPaths = new Set(tree.flatFiles().map((f) => f.path));
  for (const e of tree.entities) {
    allEntityPaths.add(e.path);
  }

  let configKeys = Object.keys(config.files);
  if (filterFiles && filterFiles.length > 0) {
    const filterSet = new Set(filterFiles);
    configKeys = configKeys.filter((k) => filterSet.has(k));
  }

  for (const key of configKeys) {
    const path = key.endsWith("/") ? key.slice(0, -1) : key;
    if (!allEntityPaths.has(path)) {
      fileDiffs.push({ path, status: "staging_missing" });
    }
  }

  const hasChanges = fileDiffs.some(
    (f) => f.status !== "unchanged" && f.status !== "staging_missing",
  );

  let approvalHash: string | undefined;
  if (hasChanges) {
    approvalHash = computeApprovalHash(fileDiffs);
  }

  return ok({ files: fileDiffs, hasChanges, approvalHash });
}

/**
 * Convert a StateFile from the state tree into a FileDiff.
 */
async function stateFileToFileDiff(
  ops: SystemOperations,
  sf: StateFile,
): Promise<Result<FileDiff, DiffError>> {
  switch (sf.status) {
    case "unchanged":
      // No staging copy at all → staging_missing (old: "⚠️ no staging copy")
      // Identical staging copy → unchanged (old: "✅ no changes")
      if (sf.stagedHash === null) {
        return ok({ path: sf.path, status: "staging_missing" });
      }
      return ok({
        path: sf.path,
        status: "unchanged",
        protectedHash: sf.canonicalHash ?? undefined,
        stagedHash: sf.stagedHash ?? undefined,
      });

    case "created":
      return ok({
        path: sf.path,
        status: "protect_missing",
        stagedHash: sf.stagedHash ?? undefined,
      });

    case "deleted":
      return ok({
        path: sf.path,
        status: "deleted",
        protectedHash: sf.canonicalHash ?? undefined,
      });

    case "modified": {
      // Generate unified diff by reading both files
      const protectContent = await ops.readFile(sf.path);
      if (!protectContent.ok) {
        return err({ kind: "read_failed", path: sf.path, message: "read failed" });
      }

      const stagedPath = stagingPath(sf.path);
      const stagingContent = await ops.readFile(stagedPath);
      if (!stagingContent.ok) {
        return err({ kind: "read_failed", path: stagedPath, message: "read failed" });
      }

      const unifiedDiff = createTwoFilesPatch(
        `a/${sf.path}`,
        `b/${sf.path}`,
        protectContent.value,
        stagingContent.value,
      );

      return ok({
        path: sf.path,
        status: "modified",
        diff: unifiedDiff,
        protectedHash: sf.canonicalHash ?? undefined,
        stagedHash: sf.stagedHash ?? undefined,
      });
    }
  }
}

/**
 * Compute a deterministic approval hash from file diffs.
 */
export function computeApprovalHash(files: FileDiff[]): string {
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
      hash.update(`${f.path}\0DELETED\0${f.protectedHash ?? ""}\0`);
    } else {
      hash.update(`${f.path}\0${f.stagedHash}\0`);
    }
  }
  return hash.digest("hex");
}
