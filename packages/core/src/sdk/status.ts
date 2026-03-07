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
import type { Registry } from "./registry.js";

// ── File status ────────────────────────────────────────────────────────

export type FileStatus =
  | { tier: Tier; status: "ok"; path: string; stagedChanges?: number }
  | { tier: Tier; status: "drifted"; path: string; issues: DriftIssue[]; stagedChanges?: number }
  | { tier: Tier; status: "missing"; path: string }
  | { tier: Tier; status: "error"; path: string; error: { kind: string; message: string } }
  | { tier: Tier; status: "unregistered"; path: string }
  | { tier: Tier; status: "tier_changed"; path: string; registryTier: Tier }
  | { status: "orphaned"; path: string; registryTier: Tier; originalOwnership?: FileOwnership };

export type StatusResult = {
  /** All file statuses (ok + issues) */
  files: FileStatus[];
  /** Only non-ok statuses (for backward compat) */
  issues: FileStatus[];
  /** Current registry state */
  registry: Registry;
};

export type StatusOptions = {
  config: SoulguardConfig;
  /** Expected ownership for protect-tier files (e.g. soulguardian:soulguard 444) */
  expectedProtectOwnership: FileOwnership;
  ops: SystemOperations;
  /** Registry for reconciliation */
  registry: Registry;
};

/**
 * Check the protection status of all configured files.
 *
 * Builds a StateTree and derives all status information from it.
 */
export async function status(options: StatusOptions): Promise<Result<StatusResult, IOError>> {
  const { config, ops, registry } = options;

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

  const allFiles: FileStatus[] = [];

  // Convert state tree entities to FileStatus entries
  for (const entity of tree.entities) {
    allFiles.push(...entityToStatuses(entity, driftsByPath));
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

  // ── Registry reconciliation (backward compat, will be removed) ─────
  {
    const configKeys = Object.keys(config.files);
    const managedPaths = new Set(configKeys.map((k) => (k.endsWith("/") ? k.slice(0, -1) : k)));

    for (const key of configKeys) {
      const path = key.endsWith("/") ? key.slice(0, -1) : key;
      const tier = config.files[key]!;
      const entry = registry.get(path);
      if (!entry) {
        issues.push({ tier, status: "unregistered", path });
      } else if (entry.tier !== tier) {
        issues.push({ tier, status: "tier_changed", path, registryTier: entry.tier });
      }
    }

    for (const regPath of registry.paths()) {
      if (!managedPaths.has(regPath)) {
        const entry = registry.get(regPath)!;
        issues.push({
          status: "orphaned",
          path: regPath,
          registryTier: entry.tier,
          originalOwnership: entry.tier === "protect" ? entry.originalOwnership : undefined,
        });
      }
    }
  }

  return ok({ files: allFiles, issues, registry });
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Convert a StateEntity into FileStatus entries.
 * Files → 1 status. Directories → 1 status (with child drift aggregated).
 */
function entityToStatuses(entity: StateEntity, driftsByPath: Map<string, Drift>): FileStatus[] {
  if (entity.kind === "file") {
    return [fileEntityToStatus(entity, driftsByPath)];
  }
  return [directoryEntityToStatus(entity, driftsByPath)];
}

function fileEntityToStatus(file: StateFile, driftsByPath: Map<string, Drift>): FileStatus {
  const stagedChanges = file.status !== "unchanged" ? 1 : undefined;
  const drift = driftsByPath.get(file.path);

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
): FileStatus {
  const changedChildren = countChangedChildren(dir);
  const drift = driftsByPath.get(dir.path);

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
      path: dir.path,
      issues: allIssues,
      ...(changedChildren > 0 && { stagedChanges: changedChildren }),
    };
  }

  return {
    tier: dir.configTier,
    status: "ok",
    path: dir.path,
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

function countChangedChildren(dir: StateDirectory): number {
  let count = 0;
  for (const child of dir.children) {
    if (child.kind === "file" && child.status !== "unchanged") {
      count++;
    } else if (child.kind === "directory") {
      count += countChangedChildren(child);
    }
  }
  return count;
}
