/**
 * soulguard status — report the current protection state of a workspace.
 *
 * Built on top of StateTree: one walk, one snapshot, pure derivations.
 *
 * Reports:
 * - drifted: file/directory ownership doesn't match tier expectations
 * - missing: file in config but doesn't exist on disk (and no staging)
 * - staged: pending changes in staging tree
 *
 * Registry reconciliation (orphaned, unregistered, tier_changed) is
 * preserved for backward compatibility but will be removed when
 * registry.json is eliminated.
 */

import type {
  SoulguardConfig,
  FileOwnership,
  Tier,
  DriftIssue,
  IOError,
  Result,
} from "../util/types.js";
import { ok, err } from "../util/result.js";
import type { SystemOperations } from "../util/system-ops.js";
import { StateTree } from "./state.js";
import type { StateFile, StateDirectory, StateEntity, Drift } from "./state.js";

// ── File status ────────────────────────────────────────────────────────

export type FileStatus =
  | { tier: Tier; status: "ok"; path: string; stagedChanges?: number }
  | { tier: Tier; status: "drifted"; path: string; issues: DriftIssue[]; stagedChanges?: number }
  | { tier: Tier; status: "missing"; path: string }
  | { tier: Tier; status: "error"; path: string; error: { kind: string; message: string } };

export type StatusResult = {
  /** All file statuses (ok + issues) */
  files: FileStatus[];
  /** Only non-ok statuses (for backward compat) */
  issues: FileStatus[];
};

export type StatusOptions = {
  config: SoulguardConfig;
  /** Expected ownership for protect-tier files (e.g. soulguardian:soulguard 444) */
  expectedProtectOwnership: FileOwnership;
  ops: SystemOperations;
};

/**
 * Check the protection status of all configured files.
 *
 * Builds a StateTree and derives all status information from it.
 */
export async function status(options: StatusOptions): Promise<Result<StatusResult, IOError>> {
  const { config, ops } = options;

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
  const driftsByPath = new Map(drifts.map((d) => [d.entity.path, d]));

  // Map entity paths back to original config keys (preserves trailing slash for dirs)
  const entityToConfigKey = new Map<string, string>();
  for (const key of Object.keys(config.files)) {
    const path = key.endsWith("/") ? key.slice(0, -1) : key;
    entityToConfigKey.set(path, key);
  }

  const allFiles: FileStatus[] = [];

  // Convert state tree entities to FileStatus entries
  for (const entity of tree.entities) {
    allFiles.push(...entityToStatuses(entity, driftsByPath, entityToConfigKey));
  }

  // Check for config entries with nothing on disk or staging (missing).
  // StateTree omits these entirely, so detect from config.
  const entityPaths = new Set(tree.entities.map((e) => e.path));
  for (const [key, tier] of Object.entries(config.files)) {
    const path = key.endsWith("/") ? key.slice(0, -1) : key;
    if (!entityPaths.has(path)) {
      allFiles.push({ tier, status: "missing", path });
    }
  }

  const issues: FileStatus[] = allFiles.filter((f) => f.status !== "ok");

  return ok({ files: allFiles, issues });
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Convert a StateEntity into FileStatus entries.
 * Files → 1 status. Directories → 1 status (with child drift aggregated).
 */
function entityToStatuses(
  entity: StateEntity,
  driftsByPath: Map<string, Drift>,
  entityToConfigKey: Map<string, string>,
): FileStatus[] {
  if (entity.kind === "file") {
    return [fileEntityToStatus(entity, driftsByPath)];
  }
  return [directoryEntityToStatus(entity, driftsByPath, entityToConfigKey)];
}

function fileEntityToStatus(file: StateFile, driftsByPath: Map<string, Drift>): FileStatus {
  // A staging copy exists if there's a staged hash OR it's a delete sentinel
  const hasStaging = file.stagedHash !== null || file.status === "deleted";
  const stagedChanges = hasStaging ? 1 : undefined;
  const drift = driftsByPath.get(file.path);

  // Protect-tier file missing from disk is reported as "missing"
  // regardless of staging state
  if (file.canonicalHash === null && file.status === "created") {
    return { tier: file.configTier, status: "missing", path: file.path };
  }

  if (drift) {
    return {
      tier: file.configTier,
      status: "drifted",
      path: file.path,
      issues: drift.details as DriftIssue[],
      ...(stagedChanges !== undefined && { stagedChanges }),
    };
  }

  return {
    tier: file.configTier,
    status: "ok",
    path: file.path,
    ...(stagedChanges !== undefined && { stagedChanges }),
  };
}

function directoryEntityToStatus(
  dir: StateDirectory,
  driftsByPath: Map<string, Drift>,
  entityToConfigKey: Map<string, string>,
): FileStatus {
  const changedChildren = countStagedChanges(dir);
  const drift = driftsByPath.get(dir.path);
  // Use original config key (with trailing slash) for display path
  const displayPath = entityToConfigKey.get(dir.path) ?? dir.path;

  // Also check child drifts — aggregate all issues
  const allIssues: DriftIssue[] = [];
  if (drift) {
    allIssues.push(...(drift.details as DriftIssue[]));
  }
  // Collect child drifts
  collectChildDrifts(dir, driftsByPath, allIssues);

  if (allIssues.length > 0) {
    return {
      tier: dir.configTier,
      status: "drifted",
      path: displayPath,
      issues: allIssues,
      ...(changedChildren > 0 && { stagedChanges: changedChildren }),
    };
  }

  return {
    tier: dir.configTier,
    status: "ok",
    path: displayPath,
    ...(changedChildren > 0 && { stagedChanges: changedChildren }),
  };
}

function collectChildDrifts(
  dir: StateDirectory,
  driftsByPath: Map<string, Drift>,
  issues: DriftIssue[],
): void {
  for (const child of dir.children) {
    const childDrift = driftsByPath.get(child.path);
    if (childDrift) {
      issues.push(...(childDrift.details as DriftIssue[]));
    }
    if (child.kind === "directory") {
      collectChildDrifts(child, driftsByPath, issues);
    }
  }
}

function countStagedChanges(entity: StateEntity): number {
  if (entity.kind === "file") {
    return entity.stagedHash !== null || entity.status === "deleted" ? 1 : 0;
  }
  // Directory-level deletion counts as 1 staged change (the directory itself)
  if (entity.deleted) return 1;
  let count = 0;
  for (const child of entity.children) {
    count += countStagedChanges(child);
  }
  return count;
}
