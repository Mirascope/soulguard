/**
 * soulguard diff — compare protect-tier files/directories against their staging copies.
 */

import { createHash } from "node:crypto";
import { createTwoFilesPatch } from "diff";
import type { Result } from "../util/result.js";
import { ok, err } from "../util/result.js";
import type { SoulguardConfig } from "../util/types.js";
import type { SystemOperations } from "../util/system-ops.js";
import { protectPatterns } from "./config.js";
import { stagingPath, isDeleteSentinel } from "./staging.js";

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
 * Diff a single file (not directory) against its staging copy.
 */
async function diffFile(
  ops: SystemOperations,
  path: string,
  stagePath: string,
): Promise<Result<FileDiff[], DiffError>> {
  const [protectExists, stagingExists] = await Promise.all([
    ops.exists(path),
    ops.exists(stagePath),
  ]);

  if (!protectExists.ok) {
    return err({ kind: "read_failed", path, message: protectExists.error.message });
  }
  if (!stagingExists.ok) {
    return err({ kind: "read_failed", path: stagePath, message: stagingExists.error.message });
  }

  // Neither exists
  if (!protectExists.value && !stagingExists.value) {
    return ok([{ path, status: "staging_missing" }]);
  }

  // Staging exists but protect doesn't → new file
  if (!protectExists.value && stagingExists.value) {
    // Check for delete sentinel
    const content = await ops.readFile(stagePath);
    if (content.ok && isDeleteSentinel(content.value)) {
      return ok([{ path, status: "staging_missing" }]);
    }
    const newHash = await ops.hashFile(stagePath);
    return ok([
      {
        path,
        status: "protect_missing",
        stagedHash: newHash.ok ? newHash.value : undefined,
      },
    ]);
  }

  // Protect exists but staging doesn't → not staged, no pending changes
  if (protectExists.value && !stagingExists.value) {
    return ok([{ path, status: "staging_missing" }]);
  }

  // Both exist — check for delete sentinel
  const stagingContent = await ops.readFile(stagePath);
  if (!stagingContent.ok) {
    return err({ kind: "read_failed", path: stagePath, message: "read failed" });
  }

  if (isDeleteSentinel(stagingContent.value)) {
    const protectHash = await ops.hashFile(path);
    return ok([
      {
        path,
        status: "deleted",
        protectedHash: protectHash.ok ? protectHash.value : undefined,
      },
    ]);
  }

  // Both exist, not a sentinel — compare hashes
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
    return ok([
      {
        path,
        status: "unchanged",
        protectedHash: protectHash.value,
        stagedHash: stagingHash.value,
      },
    ]);
  }

  // Modified — generate unified diff
  const protectContent = await ops.readFile(path);
  if (!protectContent.ok) {
    return err({ kind: "read_failed", path, message: "read failed" });
  }

  const unifiedDiff = createTwoFilesPatch(
    `a/${path}`,
    `b/${path}`,
    protectContent.value,
    stagingContent.value,
  );

  return ok([
    {
      path,
      status: "modified",
      diff: unifiedDiff,
      protectedHash: protectHash.value,
      stagedHash: stagingHash.value,
    },
  ]);
}

/**
 * Diff a directory against its staging copy.
 */
async function diffDirectory(
  ops: SystemOperations,
  dirPath: string,
  stageDirPath: string,
): Promise<Result<FileDiff[], DiffError>> {
  const stagingExists = await ops.exists(stageDirPath);
  if (!stagingExists.ok) {
    return err({ kind: "read_failed", path: stageDirPath, message: stagingExists.error.message });
  }

  // No staging directory at all → no changes
  if (!stagingExists.value) {
    return ok([]);
  }

  // Check if staging path is a file (not directory) containing delete sentinel
  const stageStat = await ops.stat(stageDirPath);
  if (!stageStat.ok) {
    return err({ kind: "read_failed", path: stageDirPath, message: "stat failed" });
  }

  if (!stageStat.value.isDirectory) {
    // It's a file — check if it's a delete sentinel for the whole directory
    const content = await ops.readFile(stageDirPath);
    if (content.ok && isDeleteSentinel(content.value)) {
      // Delete entire directory — list all files in protected dir
      const protectedFiles = await ops.listDir(dirPath);
      if (!protectedFiles.ok) {
        return ok([]);
      }
      const diffs: FileDiff[] = [];
      for (const filePath of protectedFiles.value) {
        const protectHash = await ops.hashFile(filePath);
        diffs.push({
          path: filePath,
          status: "deleted",
          protectedHash: protectHash.ok ? protectHash.value : undefined,
        });
      }
      return ok(diffs);
    }
    return ok([]);
  }

  // Both are directories — walk and compare
  const [protectedFilesResult, stagedFilesResult] = await Promise.all([
    ops.listDir(dirPath),
    ops.listDir(stageDirPath),
  ]);

  const protectedFiles = protectedFilesResult.ok ? protectedFilesResult.value : [];
  const stagedFiles = stagedFilesResult.ok ? stagedFilesResult.value : [];

  // Build sets of relative-to-dir paths
  const dirPrefix = dirPath + "/";
  const stageDirPrefix = stageDirPath + "/";

  const protectedRelPaths = new Set<string>();
  const protectedAbsMap = new Map<string, string>();
  for (const f of protectedFiles) {
    if (f.startsWith(dirPrefix)) {
      const rel = f.slice(dirPrefix.length);
      protectedRelPaths.add(rel);
      protectedAbsMap.set(rel, f);
    }
  }

  const stagedRelPaths = new Set<string>();
  const stagedAbsMap = new Map<string, string>();
  for (const f of stagedFiles) {
    if (f.startsWith(stageDirPrefix)) {
      const rel = f.slice(stageDirPrefix.length);
      stagedRelPaths.add(rel);
      stagedAbsMap.set(rel, f);
    }
  }

  const allRels = new Set([...protectedRelPaths, ...stagedRelPaths]);
  const sortedRels = [...allRels].sort();

  const diffs: FileDiff[] = [];

  for (const rel of sortedRels) {
    const protectedPath = dirPrefix + rel;
    const stagedPath = stageDirPrefix + rel;
    const displayPath = dirPrefix + rel;

    const inProtected = protectedRelPaths.has(rel);
    const inStaged = stagedRelPaths.has(rel);

    if (inProtected && !inStaged) {
      // File in protected but not in staging → not staged, no pending changes
      continue;
    } else if (!inProtected && inStaged) {
      // File in staging but not in protected → check for delete sentinel, else new file
      const content = await ops.readFile(stagedPath);
      if (content.ok && isDeleteSentinel(content.value)) {
        continue;
      }
      const newHash = await ops.hashFile(stagedPath);
      diffs.push({
        path: displayPath,
        status: "protect_missing",
        stagedHash: newHash.ok ? newHash.value : undefined,
      });
    } else {
      // Both exist — check for delete sentinel first
      const stagedContent = await ops.readFile(stagedPath);
      if (!stagedContent.ok) {
        return err({ kind: "read_failed", path: stagedPath, message: "read failed" });
      }

      if (isDeleteSentinel(stagedContent.value)) {
        const protectHash = await ops.hashFile(protectedPath);
        diffs.push({
          path: displayPath,
          status: "deleted",
          protectedHash: protectHash.ok ? protectHash.value : undefined,
        });
        continue;
      }

      // Compare hashes
      const [protectHash, stagedHash] = await Promise.all([
        ops.hashFile(protectedPath),
        ops.hashFile(stagedPath),
      ]);

      if (!protectHash.ok) {
        return err({ kind: "read_failed", path: protectedPath, message: "hash failed" });
      }
      if (!stagedHash.ok) {
        return err({ kind: "read_failed", path: stagedPath, message: "hash failed" });
      }

      if (protectHash.value === stagedHash.value) {
        continue; // unchanged — skip
      }

      // Modified
      const protectContent = await ops.readFile(protectedPath);
      if (!protectContent.ok) {
        return err({ kind: "read_failed", path: protectedPath, message: "read failed" });
      }

      const unifiedDiff = createTwoFilesPatch(
        `a/${displayPath}`,
        `b/${displayPath}`,
        protectContent.value,
        stagedContent.value,
      );

      diffs.push({
        path: displayPath,
        status: "modified",
        diff: unifiedDiff,
        protectedHash: protectHash.value,
        stagedHash: stagedHash.value,
      });
    }
  }

  return ok(diffs);
}

/**
 * Compare protect-tier files against their staging copies.
 */
export async function diff(options: DiffOptions): Promise<Result<DiffResult, DiffError>> {
  const { ops, config, files: filterFiles } = options;

  let protectFiles = protectPatterns(config);
  if (filterFiles && filterFiles.length > 0) {
    const filterSet = new Set(filterFiles);
    protectFiles = protectFiles.filter((p) => filterSet.has(p));
  }

  const fileDiffs: FileDiff[] = [];

  for (const path of protectFiles) {
    const stageP = stagingPath(path);

    // Determine if this entry is a directory
    let isDir = false;

    const protectStat = await ops.stat(path);
    if (protectStat.ok && protectStat.value.isDirectory) {
      isDir = true;
    } else {
      const stageStat = await ops.stat(stageP);
      if (stageStat.ok && stageStat.value.isDirectory) {
        isDir = true;
      }
    }

    let result: Result<FileDiff[], DiffError>;
    if (isDir) {
      result = await diffDirectory(ops, path, stageP);
    } else {
      result = await diffFile(ops, path, stageP);
    }

    if (!result.ok) return result;
    fileDiffs.push(...result.value);
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
