/**
 * soulguard status — thin wrapper around StateTree.
 *
 * Returns changed files (modified/created/deleted) and ownership drifts.
 * Unchanged files and config entries with no file on disk are omitted.
 */

import type { SoulguardConfig, IOError, Result } from "../util/types.js";
import { ok, err } from "../util/result.js";
import type { SystemOperations } from "../util/system-ops.js";
import { StateTree } from "./state.js";
import type { StateFile, Drift } from "./state.js";

// ── Types ──────────────────────────────────────────────────────────────

export type StatusResult = {
  /** Files with pending staged changes (modified/created/deleted). */
  changed: StateFile[];
  /** Entities whose ownership doesn't match tier expectations. */
  drifts: Drift[];
};

export type StatusOptions = {
  config: SoulguardConfig;
  ops: SystemOperations;
};

// ── Main ───────────────────────────────────────────────────────────────

/**
 * Check the protection status of all configured files.
 *
 * Builds a StateTree and projects changed files + ownership drifts.
 */
export async function status(opts: StatusOptions): Promise<Result<StatusResult, IOError>> {
  const treeResult = await StateTree.build(opts);
  if (!treeResult.ok) {
    return err({
      kind: "io_error",
      path: "",
      message: treeResult.error.message,
    });
  }

  const tree = treeResult.value;
  return ok({
    changed: tree.changedFiles(),
    drifts: tree.driftedEntities(),
  });
}
