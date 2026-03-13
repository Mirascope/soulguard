/**
 * soulguard reset — manage staging tree contents.
 *
 * Thin layer over StateTree: uses a pre-built snapshot, derives changed files,
 * then deletes staging copies as requested.
 */

import type { SystemOperations } from "../util/system-ops.js";
import type { Result } from "../util/types.js";
import type { StateTree } from "./state.js";
import { stagingPath } from "./staging.js";
import { ok } from "../util/result.js";

export type ResetOptions = {
  tree: StateTree;
  ops: SystemOperations;
  paths?: string[];
  all?: boolean;
};

export type ResetResult = {
  /** Files found/removed in staging */
  stagedFiles: string[];
  /** Whether anything was actually deleted */
  deleted: boolean;
};

export type ResetError = { kind: "reset_failed"; message: string };

export async function reset(options: ResetOptions): Promise<Result<ResetResult, ResetError>> {
  const { tree, ops, paths, all } = options;

  const stagedFiles = tree.stagedFiles().map((f) => f.path);

  if (stagedFiles.length === 0) {
    return ok({ stagedFiles: [], deleted: false });
  }

  // Dry run: no paths and no --all
  if (!paths?.length && !all) {
    return ok({ stagedFiles, deleted: false });
  }

  // --all: delete everything
  if (all) {
    for (const f of stagedFiles) {
      await ops.deleteFile(stagingPath(f));
    }
    return ok({ stagedFiles, deleted: true });
  }

  // Selective: delete specific paths
  const affected: string[] = [];
  for (const p of paths!) {
    const matching = stagedFiles.filter((f) => f === p || f.startsWith(p + "/"));
    for (const f of matching) {
      await ops.deleteFile(stagingPath(f));
      affected.push(f);
    }
  }

  return ok({ stagedFiles: affected, deleted: true });
}
