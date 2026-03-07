/**
 * soulguard sync — fix all ownership drift in the workspace.
 *
 * Built on top of StateTree: one walk, one snapshot, pure derivations.
 *
 * 1. Build StateTree
 * 2. Detect drifted entities
 * 3. Fix ownership
 * 4. Best-effort git commit
 */

import type { DriftIssue, FileSystemError, IOError } from "../util/types.js";
import { ok, err } from "../util/result.js";
import type { Result } from "../util/result.js";
import { StateTree } from "./state.js";
import { isGitEnabled, gitCommit } from "../util/git.js";
import type { GitCommitResult } from "../util/git.js";
import { protectPatterns, watchPatterns } from "./config.js";

export type SyncError = {
  path: string;
  operation: string;
  error: FileSystemError;
};

export type SyncIssue = {
  path: string;
  status: "drifted" | "missing";
  tier: "protect" | "watch";
  issues?: DriftIssue[];
};

export type SyncResult = {
  /** Issues detected before fixing */
  beforeIssues: SyncIssue[];
  errors: SyncError[];
  /** Git commit result (best-effort, only when git enabled) */
  git?: GitCommitResult;
};

export type SyncOptions = {
  config: { version: 1; files: Record<string, "protect" | "watch">; git?: boolean };
  expectedProtectOwnership: { user: string; group: string; mode: string };
  ops: import("../util/system-ops.js").SystemOperations;
};

/**
 * Build StateTree, detect drift, fix ownership.
 */
export async function sync(options: SyncOptions): Promise<Result<SyncResult, IOError>> {
  const { ops, config } = options;

  // Build the unified state tree
  const treeResult = await StateTree.build({ ops, config });
  if (!treeResult.ok) {
    return err({
      kind: "io_error",
      path: "",
      message: treeResult.error.message,
    });
  }

  const tree = treeResult.value;
  const drifts = tree.driftedEntities();

  // Build before-issues from tree state
  const beforeIssues: SyncIssue[] = [];
  for (const drift of drifts) {
    beforeIssues.push({
      path: drift.entity.path,
      status: "drifted",
      tier: drift.entity.configTier as "protect" | "watch",
      issues: drift.details as DriftIssue[],
    });
  }

  // Check for missing config entries (not on disk, not in staging)
  const entityPaths = new Set(tree.entities.map((e) => e.path));
  for (const [key, tier] of Object.entries(config.files)) {
    const path = key.endsWith("/") ? key.slice(0, -1) : key;
    if (!entityPaths.has(path)) {
      beforeIssues.push({ path, status: "missing", tier: tier as "protect" | "watch" });
    }
  }

  const errors: SyncError[] = [];

  // ── Enforce ownership using tree drift data ──────────────────────────
  for (const drift of drifts) {
    if (drift.entity.configTier !== "protect") continue;

    const expectedOwnership = options.expectedProtectOwnership;
    const path = drift.entity.path;
    const needsChown = drift.details.some(
      (i) => i.kind === "wrong_owner" || i.kind === "wrong_group",
    );
    const needsChmod = drift.details.some((i) => i.kind === "wrong_mode");

    if (needsChown) {
      const { user, group } = expectedOwnership;
      const result = await ops.chown(path, { user, group });
      if (!result.ok) {
        errors.push({ path, operation: "chown", error: result.error });
        continue;
      }
    }
    if (needsChmod) {
      const result = await ops.chmod(path, expectedOwnership.mode);
      if (!result.ok) {
        errors.push({ path, operation: "chmod", error: result.error });
      }
    }
  }

  if (errors.length > 0) {
    return ok({ beforeIssues, errors, git: undefined });
  }

  // Best-effort git commit
  let git: GitCommitResult | undefined;
  if (await isGitEnabled(ops, config)) {
    const allFiles = [...protectPatterns(config), ...watchPatterns(config)];
    if (allFiles.length > 0) {
      const gitResult = await gitCommit(ops, allFiles, "soulguard: sync");
      if (gitResult.ok) {
        git = gitResult.value;
      }
    }
  }

  return ok({ beforeIssues, errors, git });
}
