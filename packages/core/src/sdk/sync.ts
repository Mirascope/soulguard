/**
 * soulguard sync — fix all ownership drift in the workspace.
 *
 * Built on top of StateTree: one walk, one snapshot, pure derivations.
 *
 * 1. Build StateTree
 * 2. Detect drifted entities
 * 3. Fix ownership (derived from drift details, not caller params)
 * 4. Best-effort git commit
 */

import type { FileSystemError, IOError } from "../util/types.js";
import { ok, err } from "../util/result.js";
import type { Result } from "../util/result.js";
import { StateTree } from "./state.js";
import type { Drift } from "./state.js";
import { isGitEnabled, gitCommit } from "../util/git.js";
import type { GitCommitResult } from "../util/git.js";
import { protectPatterns, watchPatterns } from "./config.js";

export type SyncError = {
  path: string;
  operation: string;
  error: FileSystemError;
};

export type SyncResult = {
  /** Drift issues detected before fixing */
  drifts: Drift[];
  errors: SyncError[];
  /** Git commit result (best-effort, only when git enabled) */
  git?: GitCommitResult;
};

export type SyncOptions = {
  config: {
    version: 1;
    guardian: string;
    files: Record<string, "protect" | "watch">;
    git?: boolean;
  };
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

  const errors: SyncError[] = [];

  // ── Enforce ownership using drift details directly ─────────────────
  for (const drift of drifts) {
    if (drift.entity.configTier !== "protect") continue;

    const path = drift.entity.path;
    const needsChown = drift.details.some(
      (i) => i.kind === "wrong_owner" || i.kind === "wrong_group",
    );
    const needsChmod = drift.details.some((i) => i.kind === "wrong_mode");

    if (needsChown) {
      // Extract expected user/group from drift details
      const ownerIssue = drift.details.find((i) => i.kind === "wrong_owner");
      const groupIssue = drift.details.find((i) => i.kind === "wrong_group");
      const user = ownerIssue ? ownerIssue.expected : drift.entity.ownership!.user;
      const group = groupIssue ? groupIssue.expected : drift.entity.ownership!.group;
      const result = await ops.chown(path, { user, group });
      if (!result.ok) {
        errors.push({ path, operation: "chown", error: result.error });
        continue;
      }
    }
    if (needsChmod) {
      const modeIssue = drift.details.find((i) => i.kind === "wrong_mode")!;
      const result = await ops.chmod(path, modeIssue.expected);
      if (!result.ok) {
        errors.push({ path, operation: "chmod", error: result.error });
      }
    }
  }

  if (errors.length > 0) {
    return ok({ drifts, errors, git: undefined });
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

  return ok({ drifts, errors, git });
}
