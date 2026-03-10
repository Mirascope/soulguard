/**
 * soulguard diff — thin layer over StateTree.
 *
 * Builds a StateTree, collects changed files, and generates unified
 * diff text for modified ones. No parallel type system — uses StateFile
 * directly from state.ts.
 */

import { createTwoFilesPatch } from "diff";
import type { Result } from "../util/result.js";
import { ok, err } from "../util/result.js";
import type { SoulguardConfig } from "../util/types.js";
import type { SystemOperations } from "../util/system-ops.js";
import { StateTree } from "./state.js";
import type { StateFile } from "./state.js";
import { stagingPath } from "./staging.js";

// ── Types ──────────────────────────────────────────────────────────────

/** A changed file with unified diff text. */
export type DiffFile = {
  file: StateFile;
  /** Unified diff string for modified/created/deleted files. */
  diff: string;
};

export type DiffResult = {
  files: DiffFile[];
  hasChanges: boolean;
  /** Approval hash from StateTree. Only present when there are changes. */
  approvalHash?: string;
};

export type DiffError = { kind: "build_failed"; message: string };

export type DiffOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  /** Specific files to diff (default: all changed files) */
  files?: string[];
};

// ── Implementation ─────────────────────────────────────────────────────

/**
 * Compare protect-tier files against their staging copies.
 *
 * Builds a StateTree and returns only changed files with unified diffs.
 */
export async function diff(options: DiffOptions): Promise<Result<DiffResult, DiffError>> {
  const { ops, config, files: filterFiles } = options;

  const treeResult = await StateTree.build({ ops, config });
  if (!treeResult.ok) {
    return err({ kind: "build_failed", message: treeResult.error.message });
  }

  const tree = treeResult.value;

  // Get changed files (modified/created/deleted)
  let changed = tree.changedFiles();

  // Apply file filter if specified
  if (filterFiles && filterFiles.length > 0) {
    const filterSet = new Set(filterFiles);
    changed = changed.filter((f) => filterSet.has(f.path));
  }

  // Generate unified diffs for all changed files
  const files: DiffFile[] = [];
  for (const sf of changed) {
    const diffText = await generateDiff(ops, sf);
    if (!diffText.ok) return diffText;
    files.push({ file: sf, diff: diffText.value });
  }

  return ok({
    files,
    hasChanges: files.length > 0,
    approvalHash: tree.approvalHash ?? undefined,
  });
}

/**
 * Generate a unified diff for a changed file (like git diff).
 * - modified: old content vs new content
 * - created:  /dev/null vs new content
 * - deleted:  old content vs /dev/null
 */
async function generateDiff(
  ops: SystemOperations,
  sf: StateFile,
): Promise<Result<string, DiffError>> {
  let oldContent = "";
  let newContent = "";

  if (sf.status !== "created") {
    const result = await ops.readFile(sf.path);
    if (!result.ok) {
      return err({ kind: "build_failed", message: `read failed for ${sf.path}` });
    }
    oldContent = result.value;
  }

  if (sf.status !== "deleted") {
    const result = await ops.readFile(stagingPath(sf.path));
    if (!result.ok) {
      return err({ kind: "build_failed", message: `read failed for ${stagingPath(sf.path)}` });
    }
    newContent = result.value;
  }

  const oldName = sf.status === "created" ? "/dev/null" : `a/${sf.path}`;
  const newName = sf.status === "deleted" ? "/dev/null" : `b/${sf.path}`;

  return ok(createTwoFilesPatch(oldName, newName, oldContent, newContent));
}
