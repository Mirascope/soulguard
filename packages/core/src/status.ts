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

// ── File status ────────────────────────────────────────────────────────

export type FileStatus =
  | { tier: Tier; status: "ok"; file: FileInfo }
  | { tier: Tier; status: "drifted"; file: FileInfo; issues: DriftIssue[] }
  | { tier: Tier; status: "missing"; path: string }
  | { tier: Tier; status: "error"; path: string; error: FileSystemError };

export type StatusResult = {
  vault: FileStatus[];
  ledger: FileStatus[];
  /** All non-ok statuses from both tiers, for convenience */
  issues: FileStatus[];
};

export type StatusOptions = {
  config: SoulguardConfig;
  /** Expected ownership for vault files (e.g. soulguardian:soulguard 444) */
  expectedVaultOwnership: FileOwnership;
  /** Expected ownership for ledger files (e.g. agent:staff 644) */
  expectedLedgerOwnership: FileOwnership;
  ops: SystemOperations;
};

/**
 * Check the protection status of all configured files.
 */
export async function status(options: StatusOptions): Promise<Result<StatusResult, IOError>> {
  const { config, expectedVaultOwnership, expectedLedgerOwnership, ops } = options;

  // Resolve glob patterns to concrete file paths
  const [vaultResult, ledgerResult] = await Promise.all([
    resolvePatterns(ops, config.vault),
    resolvePatterns(ops, config.ledger),
  ]);
  if (!vaultResult.ok) return vaultResult;
  if (!ledgerResult.ok) return ledgerResult;
  const vaultPaths = vaultResult.value;
  const ledgerPaths = ledgerResult.value;

  const [vault, ledger] = await Promise.all([
    Promise.all(vaultPaths.map((path) => checkPath(path, "vault", expectedVaultOwnership, ops))),
    Promise.all(ledgerPaths.map((path) => checkPath(path, "ledger", expectedLedgerOwnership, ops))),
  ]);

  const issues = [...vault, ...ledger].filter((f) => f.status !== "ok");

  return ok({ vault, ledger, issues });
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
