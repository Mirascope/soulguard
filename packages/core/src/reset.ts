/**
 * soulguard reset — manage staging tree contents.
 *
 * No args: dry run, list staged files.
 * Paths: delete specific staging copies.
 * --all: delete all staging contents.
 */

import type { SystemOperations } from "./system-ops.js";
import type { SoulguardConfig, Result } from "./types.js";
import { STAGING_DIR } from "./staging.js";
import { ok } from "./result.js";

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

/**
 * List all staged files (paths relative to STAGING_DIR).
 */
async function listStagedFiles(ops: SystemOperations): Promise<string[]> {
  const result = await ops.listDir(STAGING_DIR);
  if (!result.ok) return [];

  const prefix = STAGING_DIR + "/";
  return result.value.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length));
}

export async function reset(options: ResetOptions): Promise<Result<ResetResult, ResetError>> {
  const { ops, paths, all } = options;

  const stagedFiles = await listStagedFiles(ops);

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
      await ops.deleteFile(STAGING_DIR + "/" + f);
    }
    return ok({ stagedFiles, deleted: true });
  }

  // Selective: delete specific paths
  const affected: string[] = [];
  for (const p of paths!) {
    // Find matching staged files (exact match or directory prefix)
    const matching = stagedFiles.filter((f) => f === p || f.startsWith(p + "/"));
    for (const f of matching) {
      await ops.deleteFile(STAGING_DIR + "/" + f);
      affected.push(f);
    }
  }

  return ok({ stagedFiles: affected, deleted: true });
}
