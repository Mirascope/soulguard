/**
 * soulguard delete — stage protected files or directories for deletion.
 *
 * Writes DELETE_SENTINEL to the staging path to signal that the file or
 * directory should be removed when applied.
 */

import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig, Result } from "../util/types.js";
import { ok, err } from "../util/result.js";
import { stagingPath, DELETE_SENTINEL, isDeleteSentinel } from "./staging.js";
import { protectPatterns } from "./config.js";
import { isInProtectTier, ensureStagingParentDir } from "./staging-ops.js";

// ── Types ──────────────────────────────────────────────────────────────

export type DeleteOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  /** Single path to stage for deletion */
  path: string;
};

export type DeleteResult = {
  path: string;
};

export type DeleteError =
  | { kind: "not_in_protect_tier"; path: string }
  | { kind: "not_found"; path: string }
  | { kind: "already_deleted"; path: string }
  | { kind: "delete_failed"; path: string; message: string };

// ── Main Function ──────────────────────────────────────────────────────

/**
 * Stage a protected file or directory for deletion.
 *
 * The path must exist on disk or have an existing staging copy.
 * Writes DELETE_SENTINEL to the staging path.
 */
export async function deleteStagingEntry(
  options: DeleteOptions,
): Promise<Result<DeleteResult, DeleteError>> {
  const { ops, config, path } = options;

  // 1. Validate path is in protect tier
  if (!isInProtectTier(path, protectPatterns(config))) {
    return err({ kind: "not_in_protect_tier", path });
  }

  // 2. Path must exist on disk OR have an existing staging copy
  const diskExists = await ops.exists(path);
  const stagePath = stagingPath(path);
  const stagingExists = await ops.exists(stagePath);

  if ((!diskExists.ok || !diskExists.value) && (!stagingExists.ok || !stagingExists.value)) {
    return err({ kind: "not_found", path });
  }

  // 3. Check if already staged for deletion
  if (stagingExists.ok && stagingExists.value) {
    const readResult = await ops.readFile(stagePath);
    if (readResult.ok && isDeleteSentinel(readResult.value)) {
      return err({ kind: "already_deleted", path });
    }
  }

  // 4. Write DELETE_SENTINEL
  // For directories, the staging path may already be a directory with child
  // staging copies. We need to remove it and replace with a sentinel file.
  const stageExists = await ops.stat(stagePath);
  if (stageExists.ok && stageExists.value.isDirectory) {
    await ops.exec("rm", ["-rf", stagePath]);
  }

  const parentResult = await ensureStagingParentDir(ops, path);
  if (!parentResult.ok) {
    return err({ kind: "delete_failed", path, message: parentResult.error });
  }

  const writeResult = await ops.writeFile(stagePath, JSON.stringify(DELETE_SENTINEL, null, 2));
  if (!writeResult.ok) {
    return err({
      kind: "delete_failed",
      path,
      message: `Cannot write delete sentinel: ${writeResult.error.kind}`,
    });
  }

  return ok({ path });
}
