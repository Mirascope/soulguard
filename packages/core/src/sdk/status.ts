/**
 * soulguard status — thin wrapper around StateTree.
 *
 * Returns changed files (modified/created/deleted) and ownership drifts.
 * Unchanged files and config entries with no file on disk are omitted.
 */

import { ok } from "../util/result.js";
import type { Result } from "../util/result.js";
import type { StateTree, StateFile, Drift } from "./state.js";

// ── Types ──────────────────────────────────────────────────────────────

export type StatusResult = {
  /** Files with pending staged changes (modified/created/deleted). */
  changed: StateFile[];
  /** Entities whose ownership doesn't match tier expectations. */
  drifts: Drift[];
};

export type StatusOptions = {
  tree: StateTree;
};

// ── Main ───────────────────────────────────────────────────────────────

/**
 * Check the protection status of all configured files.
 *
 * Takes a pre-built StateTree and projects changed files + ownership drifts.
 */
export async function status(opts: StatusOptions): Promise<Result<StatusResult, never>> {
  const { tree } = opts;
  return ok({
    changed: tree.changedFiles(),
    drifts: tree.driftedEntities(),
  });
}
