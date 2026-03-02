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
 */

import type {
  SoulguardConfig,
  FileInfo,
  FileOwnership,
  Tier,
  DriftIssue,
  FileSystemError,
  IOError,
  Result,
} from "./types.js";
import { ok } from "./result.js";
import type { SystemOperations } from "./system-ops.js";
import { getFileInfo } from "./system-ops.js";
import { resolvePatterns } from "./glob.js";
import { protectPatterns, watchPatterns, patternsForTier } from "./config.js";
import type { Registry } from "./registry.js";

// ── File status ────────────────────────────────────────────────────────

export type FileStatus =
  | { tier: Tier; status: "ok"; file: FileInfo }
  | { tier: Tier; status: "drifted"; file: FileInfo; issues: DriftIssue[] }
  | { tier: Tier; status: "missing"; path: string }
  | { tier: Tier; status: "error"; path: string; error: FileSystemError }
  | { tier: Tier; status: "unregistered"; path: string }
  | { tier: Tier; status: "tier_changed"; path: string; registryTier: Tier }
  | { status: "orphaned"; path: string; registryTier: Tier; originalOwnership?: FileOwnership };

export type StatusResult = {
  /** All issues (non-ok statuses from file checks + registry reconciliation) */
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

  // Resolve glob patterns to concrete file paths
  const [protectResult, watchResult] = await Promise.all([
    resolvePatterns(ops, protectPatterns(config)),
    resolvePatterns(ops, watchPatterns(config)),
  ]);
  if (!protectResult.ok) return protectResult;
  if (!watchResult.ok) return watchResult;
  const protectPaths = protectResult.value;
  const watchPaths = watchResult.value;

  const [protectStatuses, watchStatuses] = await Promise.all([
    Promise.all(
      protectPaths.map((path) => checkPath(path, "protect", expectedProtectOwnership, ops)),
    ),
    Promise.all(watchPaths.map((path) => checkWatchPath(path, ops))),
  ]);

  const issues: FileStatus[] = [...protectStatuses, ...watchStatuses].filter(
    (f) => f.status !== "ok",
  );

  // ── Registry reconciliation ──────────────────────────────────────────
  {
    const allManagedPaths = new Set([...protectPaths, ...watchPaths]);

    // Check for unregistered or tier-changed files
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

    // Check for orphaned files (in registry but not in config)
    for (const regPath of registry.paths()) {
      if (!allManagedPaths.has(regPath)) {
        const entry = registry.get(regPath)!;
        issues.push({
          status: "orphaned",
          path: regPath,
          registryTier: entry.tier,
          originalOwnership: entry.originalOwnership,
        });
      }
    }
  }

  return ok({ issues, registry });
}

/**
 * Check a watch-tier file — just verify it exists (no ownership checks).
 */
async function checkWatchPath(filePath: string, ops: SystemOperations): Promise<FileStatus> {
  const infoResult = await getFileInfo(filePath, ops);
  if (!infoResult.ok) {
    if (infoResult.error.kind === "not_found") {
      return { tier: "watch", status: "missing", path: filePath };
    }
    return { tier: "watch", status: "error", path: filePath, error: infoResult.error };
  }
  return { tier: "watch", status: "ok", file: infoResult.value };
}

async function checkPath(
  filePath: string,
  tier: Tier,
  expectedOwnership: FileOwnership,
  ops: SystemOperations,
): Promise<FileStatus> {
  const infoResult = await getFileInfo(filePath, ops);

  if (!infoResult.ok) {
    if (infoResult.error.kind === "not_found") {
      return { tier, status: "missing", path: filePath };
    }
    return { tier, status: "error", path: filePath, error: infoResult.error };
  }

  const file = infoResult.value;
  const issues: DriftIssue[] = [];

  if (file.ownership.user !== expectedOwnership.user) {
    issues.push({
      kind: "wrong_owner",
      expected: expectedOwnership.user,
      actual: file.ownership.user,
    });
  }
  if (file.ownership.group !== expectedOwnership.group) {
    issues.push({
      kind: "wrong_group",
      expected: expectedOwnership.group,
      actual: file.ownership.group,
    });
  }
  if (file.ownership.mode !== expectedOwnership.mode) {
    issues.push({
      kind: "wrong_mode",
      expected: expectedOwnership.mode,
      actual: file.ownership.mode,
    });
  }

  if (issues.length === 0) {
    return { tier, status: "ok", file };
  }
  return { tier, status: "drifted", file, issues };
}
