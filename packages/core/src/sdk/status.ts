/**
 * soulguard status — report the current protection state of a workspace.
 *
 * Status is the single source of truth for what needs fixing.
 * It compares config, registry, and actual file state, then reports:
 * - drifted: file ownership doesn't match tier expectations
 * - missing: file in config but doesn't exist on disk
 * - orphaned: file in registry but no longer in config (needs release)
 * - unregistered: file in config but not yet in registry (needs registration)
 * - tier_changed: file tier in config differs from registry (needs re-registration)
 *
 * Directory-aware: directories are checked recursively (owner/group on all
 * children, mode 555 for dirs, 444 for files). Staging tree is checked for
 * staged change counts.
 */

import type {
  SoulguardConfig,
  FileOwnership,
  Tier,
  DriftIssue,
  FileSystemError,
  IOError,
  Result,
} from "../util/types.js";
import { ok } from "../util/result.js";
import type { SystemOperations, FileStat } from "../util/system-ops.js";
import { protectPatterns, watchPatterns } from "./config.js";
import { stagingPath } from "./staging.js";
import type { Registry } from "./registry.js";

// ── File status ────────────────────────────────────────────────────────

export type FileStatus =
  | { tier: Tier; status: "ok"; path: string; stagedChanges?: number }
  | { tier: Tier; status: "drifted"; path: string; issues: DriftIssue[]; stagedChanges?: number }
  | { tier: Tier; status: "missing"; path: string }
  | { tier: Tier; status: "error"; path: string; error: FileSystemError }
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
 */
export async function status(options: StatusOptions): Promise<Result<StatusResult, IOError>> {
  const { config, expectedProtectOwnership, ops, registry } = options;

  const protectPaths = protectPatterns(config);
  const watchPaths = watchPatterns(config);

  const [protectStatuses, watchStatuses] = await Promise.all([
    Promise.all(protectPaths.map((path) => checkProtectPath(path, expectedProtectOwnership, ops))),
    Promise.all(watchPaths.map((path) => checkWatchPath(path, ops))),
  ]);

  const allFiles: FileStatus[] = [...protectStatuses, ...watchStatuses];
  const issues: FileStatus[] = allFiles.filter((f) => f.status !== "ok");

  // ── Registry reconciliation ──────────────────────────────────────────
  {
    const allManagedPaths = new Set([...protectPaths, ...watchPaths]);

    for (const [path, tier] of [
      ...protectPaths.map((p) => [p, "protect" as Tier] as const),
      ...watchPaths.map((p) => [p, "watch" as Tier] as const),
    ]) {
      const entry = registry.get(path);
      if (!entry) {
        issues.push({ tier, status: "unregistered", path });
      } else if (entry.tier !== tier) {
        issues.push({ tier, status: "tier_changed", path, registryTier: entry.tier });
      }
    }

    for (const regPath of registry.paths()) {
      if (!allManagedPaths.has(regPath)) {
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

/**
 * Check a protect-tier path — stat-only ownership check + staging detection.
 * Handles both files and directories.
 */
async function checkProtectPath(
  filePath: string,
  expectedOwnership: FileOwnership,
  ops: SystemOperations,
): Promise<FileStatus> {
  const statResult = await ops.stat(filePath);

  if (!statResult.ok) {
    if (statResult.error.kind === "not_found") {
      return { tier: "protect", status: "missing", path: filePath };
    }
    return { tier: "protect", status: "error", path: filePath, error: statResult.error };
  }

  const fileStat = statResult.value;
  const issues: DriftIssue[] = [];

  if (fileStat.isDirectory) {
    checkOwnership(fileStat, expectedOwnership, "555", issues);
    await checkDirectoryChildren(filePath, expectedOwnership, ops, issues);
  } else {
    checkOwnership(fileStat, expectedOwnership, expectedOwnership.mode, issues);
  }

  const stagedChanges = await countStagedChanges(filePath, fileStat.isDirectory, ops);

  if (issues.length === 0) {
    return {
      tier: "protect",
      status: "ok",
      path: filePath,
      ...(stagedChanges > 0 && { stagedChanges }),
    };
  }
  return {
    tier: "protect",
    status: "drifted",
    path: filePath,
    issues,
    ...(stagedChanges > 0 && { stagedChanges }),
  };
}

function checkOwnership(
  fileStat: FileStat,
  expectedOwnership: FileOwnership,
  expectedMode: string,
  issues: DriftIssue[],
): void {
  if (fileStat.ownership.user !== expectedOwnership.user) {
    issues.push({
      kind: "wrong_owner",
      expected: expectedOwnership.user,
      actual: fileStat.ownership.user,
    });
  }
  if (fileStat.ownership.group !== expectedOwnership.group) {
    issues.push({
      kind: "wrong_group",
      expected: expectedOwnership.group,
      actual: fileStat.ownership.group,
    });
  }
  if (fileStat.ownership.mode !== expectedMode) {
    issues.push({
      kind: "wrong_mode",
      expected: expectedMode,
      actual: fileStat.ownership.mode,
    });
  }
}

async function checkDirectoryChildren(
  dirPath: string,
  expectedOwnership: FileOwnership,
  ops: SystemOperations,
  issues: DriftIssue[],
): Promise<void> {
  const listResult = await ops.listDir(dirPath);
  if (!listResult.ok) return;

  for (const childRelPath of listResult.value) {
    const childPath = childRelPath;
    const childStat = await ops.stat(childPath);
    if (!childStat.ok) continue;

    const expectedMode = childStat.value.isDirectory ? "555" : "444";
    checkOwnership(childStat.value, expectedOwnership, expectedMode, issues);
  }
}

async function countStagedChanges(
  filePath: string,
  isDirectory: boolean,
  ops: SystemOperations,
): Promise<number> {
  const staged = stagingPath(filePath);

  if (!isDirectory) {
    const existsResult = await ops.exists(staged);
    return existsResult.ok && existsResult.value ? 1 : 0;
  }

  const listResult = await ops.listDir(staged);
  if (!listResult.ok) return 0;
  return listResult.value.length;
}

async function checkWatchPath(filePath: string, ops: SystemOperations): Promise<FileStatus> {
  const statResult = await ops.stat(filePath);
  if (!statResult.ok) {
    if (statResult.error.kind === "not_found") {
      return { tier: "watch", status: "missing", path: filePath };
    }
    return { tier: "watch", status: "error", path: filePath, error: statResult.error };
  }
  return { tier: "watch", status: "ok", path: filePath };
}
