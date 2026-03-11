/**
 * soulguard reset — manage staging tree contents.
 *
 * Thin layer over StateTree: builds a snapshot, derives changed files,
 * then deletes staging copies as requested.
 *
 * No args: dry run, list staged files.
 * Paths: delete specific staging copies.
 * --all: delete all staging contents.
 */

import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig, Result } from "../util/types.js";
import { StateTree } from "./state.js";
import { stagingPath } from "./staging.js";
import { ok } from "../util/result.js";

export type ResetOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
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
  const { ops, config, paths, all } = options;

  const treeResult = await StateTree.build({ ops, config });
  if (!treeResult.ok) {
    return { ok: false, error: { kind: "reset_failed", message: treeResult.error.message } };
  }

  const stagedFiles = treeResult.value.stagedFiles().map((f) => f.path);

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
