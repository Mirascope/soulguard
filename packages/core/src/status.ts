/**
 * soulguard status — report the current protection state of a workspace.
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
import { protectPatterns, watchPatterns } from "./config.js";

// ── File status ────────────────────────────────────────────────────────

export type FileStatus =
  | { tier: Tier; status: "ok"; file: FileInfo }
  | { tier: Tier; status: "drifted"; file: FileInfo; issues: DriftIssue[] }
  | { tier: Tier; status: "missing"; path: string }
  | { tier: Tier; status: "error"; path: string; error: FileSystemError };

export type StatusResult = {
  protect: FileStatus[];
  watch: FileStatus[];
  /** All non-ok statuses from both tiers, for convenience */
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
 */
export async function status(options: StatusOptions): Promise<Result<StatusResult, IOError>> {
  const { config, expectedProtectOwnership, ops } = options;

  // Resolve glob patterns to concrete file paths
  const [protectResult, watchResult] = await Promise.all([
    resolvePatterns(ops, protectPatterns(config)),
    resolvePatterns(ops, watchPatterns(config)),
  ]);
  if (!protectResult.ok) return protectResult;
  if (!watchResult.ok) return watchResult;
  const protectPaths = protectResult.value;
  const watchPaths = watchResult.value;

  const [protect, watch] = await Promise.all([
    Promise.all(
      protectPaths.map((path) => checkPath(path, "protect", expectedProtectOwnership, ops)),
    ),
    Promise.all(watchPaths.map((path) => checkWatchPath(path, ops))),
  ]);

  const issues = [...protect, ...watch].filter((f) => f.status !== "ok");

  return ok({ protect, watch, issues });
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
