/**
 * soulguard stage — stage protect-tier files for editing or deletion.
 *
 * This module provides the core staging logic, separated from CLI concerns.
 * Staging prepares files for review via diff/apply:
 * - Edit mode: copies protect-tier files to staging tree
 * - Delete mode: writes DELETE_SENTINEL to signal file/directory deletion
 */

import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig, Result } from "../util/types.js";
import { ok, err } from "../util/result.js";
import { stagingPath, DELETE_SENTINEL, isDeleteSentinel } from "./staging.js";
import { protectPatterns } from "./config.js";
import { dirname } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────

export type StageOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  /** Single path to stage */
  path: string;
  /** Stage for deletion instead of editing */
  delete?: boolean;
};

export type StageResult = {
  /** Files that were staged in this operation (excludes already-staged files) */
  stagedFiles: Array<{ path: string; action: "edit" | "delete" }>;
};

export type StageError =
  | { kind: "not_in_protect_tier"; path: string }
  | { kind: "stage_failed"; path: string; message: string };

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Check if a path is in the protect tier (either directly or as a child of a protected directory).
 */
function isInProtectTier(path: string, protectPatterns: string[]): boolean {
  for (const pattern of protectPatterns) {
    const normalized = pattern.endsWith("/") ? pattern.slice(0, -1) : pattern;
    // Direct match (handles both "SOUL.md"=="SOUL.md" and "memory"=="memory/")
    if (path === normalized || path === pattern) return true;
    // Child of a protected directory (handles "skills/python.md" under "skills/" or "skills")
    if (path.startsWith(normalized + "/")) return true;
  }

  return false;
}

/**
 * Ensure parent directories exist for a given path.
 */
async function ensureParentDir(ops: SystemOperations, path: string): Promise<Result<void, string>> {
  const parentDir = dirname(path);
  if (parentDir === "." || parentDir === "/") {
    return ok(undefined);
  }

  const mkdirResult = await ops.mkdir(parentDir);
  if (!mkdirResult.ok) {
    return err(`Cannot create parent directory ${parentDir}: ${mkdirResult.error.kind}`);
  }

  return ok(undefined);
}

// ── Main Function ──────────────────────────────────────────────────────

/**
 * Stage a file or directory for editing or deletion.
 */
export async function stage(options: StageOptions): Promise<Result<StageResult, StageError>> {
  const { ops, config, path, delete: isDelete } = options;

  const protectFiles = protectPatterns(config);

  // 1. Validate path is in protect tier
  if (!isInProtectTier(path, protectFiles)) {
    return err({ kind: "not_in_protect_tier", path });
  }

  const stagedFiles: Array<{ path: string; action: "edit" | "delete" }> = [];

  // 2. Determine if path is a directory (if it exists)
  const pathStat = await ops.stat(path);

  // Handle stat errors (only "not_found" is acceptable - means file doesn't exist yet)
  if (!pathStat.ok && pathStat.error.kind !== "not_found") {
    return err({
      kind: "stage_failed",
      path,
      message: `Cannot stat path: ${pathStat.error.kind}`,
    });
  }

  const isDirectory = pathStat.ok && pathStat.value.isDirectory;

  // 3. Stage the path based on type and mode
  if (isDirectory && isDelete) {
    // ── Directory deletion: write DELETE_SENTINEL as a file ──
    const stagePath = stagingPath(path);

    // Check if already staged for deletion
    const existsResult = await ops.exists(stagePath);
    if (existsResult.ok && existsResult.value) {
      const readResult = await ops.readFile(stagePath);
      if (readResult.ok && isDeleteSentinel(readResult.value)) {
        // Already staged for deletion, skip
        return ok({ stagedFiles: [] });
      }
      // Otherwise it's staged for editing (directory contents), overwrite with delete sentinel
    }

    // Ensure parent directory exists for staging path
    const parentResult = await ensureParentDir(ops, stagePath);
    if (!parentResult.ok) {
      return err({ kind: "stage_failed", path, message: parentResult.error });
    }

    // Write DELETE_SENTINEL as a file (not directory) to signal directory deletion
    const writeResult = await ops.writeFile(stagePath, JSON.stringify(DELETE_SENTINEL, null, 2));
    if (!writeResult.ok) {
      return err({
        kind: "stage_failed",
        path,
        message: `Cannot write delete sentinel: ${writeResult.error.kind}`,
      });
    }

    stagedFiles.push({ path, action: "delete" });
  } else if (isDirectory && !isDelete) {
    // ── Directory editing: recursively stage all files ──
    const listResult = await ops.listDir(path);
    if (!listResult.ok) {
      return err({
        kind: "stage_failed",
        path,
        message: `Cannot list directory: ${listResult.error.kind}`,
      });
    }

    // Recursively stage each file/subdirectory in the directory
    for (const filePath of listResult.value) {
      const result = await stage({ ops, config, path: filePath, delete: isDelete });

      if (!result.ok) {
        return result; // Propagate error
      }

      // Accumulate all staged files from recursive call
      stagedFiles.push(...result.value.stagedFiles);
    }
  } else if (!isDirectory && isDelete) {
    // ── File deletion: write DELETE_SENTINEL ──
    const stagePath = stagingPath(path);

    // Check if already staged for deletion
    const existsResult = await ops.exists(stagePath);
    if (existsResult.ok && existsResult.value) {
      const readResult = await ops.readFile(stagePath);
      if (readResult.ok && isDeleteSentinel(readResult.value)) {
        // Already staged for deletion, skip
        return ok({ stagedFiles: [] });
      }
      // Otherwise it's staged for editing, overwrite with delete sentinel
    }

    // Ensure parent directory exists
    const parentResult = await ensureParentDir(ops, stagePath);
    if (!parentResult.ok) {
      return err({ kind: "stage_failed", path, message: parentResult.error });
    }

    // Write DELETE_SENTINEL
    const writeResult = await ops.writeFile(stagePath, JSON.stringify(DELETE_SENTINEL, null, 2));
    if (!writeResult.ok) {
      return err({
        kind: "stage_failed",
        path,
        message: `Cannot write delete sentinel: ${writeResult.error.kind}`,
      });
    }

    stagedFiles.push({ path, action: "delete" });
  } else if (!isDirectory && !isDelete) {
    // ── File editing ──
    const stagePath = stagingPath(path);

    // Check if already staged
    const existsResult = await ops.exists(stagePath);
    if (existsResult.ok && existsResult.value) {
      // Check if it's a DELETE_SENTINEL - if so, we need to overwrite it
      const readResult = await ops.readFile(stagePath);
      if (readResult.ok && isDeleteSentinel(readResult.value)) {
        // It's staged for deletion, overwrite with edit staging
        // (fall through to staging logic below)
      } else {
        // Already staged for editing, skip
        return ok({ stagedFiles: [] });
      }
    }

    // Ensure parent directory exists
    const parentResult = await ensureParentDir(ops, stagePath);
    if (!parentResult.ok) {
      return err({ kind: "stage_failed", path, message: parentResult.error });
    }

    // Check if source file exists
    const sourceExists = await ops.exists(path);

    if (sourceExists.ok && sourceExists.value) {
      // File exists: read and write to staging (not copy, to avoid inheriting 444 permissions)
      const readResult = await ops.readFile(path);
      if (!readResult.ok) {
        return err({
          kind: "stage_failed",
          path,
          message: `Cannot read file: ${readResult.error.kind}`,
        });
      }
      const writeResult = await ops.writeFile(stagePath, readResult.value);
      if (!writeResult.ok) {
        return err({
          kind: "stage_failed",
          path,
          message: `Cannot write staging copy: ${writeResult.error.kind}`,
        });
      }
    } else {
      // File doesn't exist: create empty staging file (for new files in protected directories)
      const writeResult = await ops.writeFile(stagePath, "");
      if (!writeResult.ok) {
        return err({
          kind: "stage_failed",
          path,
          message: `Cannot create empty staging file: ${writeResult.error.kind}`,
        });
      }
    }

    stagedFiles.push({ path, action: "edit" });
  }

  return ok({ stagedFiles });
}
