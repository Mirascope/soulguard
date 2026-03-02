/**
 * Soulguard Core Types
 */

// ── Config ─────────────────────────────────────────────────────────────

/** User-level configuration (soulguard.json) */
export type SoulguardConfig = {
  /** Schema version for forward compatibility */
  version: 1;
  /**
   * Map from file path or glob pattern to its protection tier.
   * When multiple patterns match a file, the highest tier wins (seal > protect > watch).
   */
  files: Record<string, Tier>;
  /** Whether to initialize and track git (default: true) */
  git?: boolean;
};

// ── Tiers ──────────────────────────────────────────────────────────────

export type Tier = "protect" | "watch";

/** Tier rank for highest-tier-wins resolution. Higher number = more protected. */
export const TIER_RANK: Record<Tier, number> = {
  watch: 1,
  protect: 2,
};

/** Compare two tiers — returns positive if a > b, negative if a < b, 0 if equal. */
export function compareTiers(a: Tier, b: Tier): number {
  return TIER_RANK[a] - TIER_RANK[b];
}

// ── File primitives ────────────────────────────────────────────────────

/** OS-level ownership and permissions for a file */
export type FileOwnership = {
  user: string;
  group: string;
  /** e.g. "444", "644" */
  mode: string;
};

/** Snapshot of a file's state on disk */
export type FileInfo = {
  /** Relative path from workspace root */
  path: string;
  ownership: FileOwnership;
  /** SHA-256 hash of current contents */
  hash: string;
};

// ── Errors ─────────────────────────────────────────────────────────────

export type NotFoundError = { kind: "not_found"; path: string };
export type PermissionDeniedError = { kind: "permission_denied"; path: string; operation: string };
export type IOError = { kind: "io_error"; path: string; message: string };
export type UserNotFoundError = { kind: "user_not_found"; user: string };
export type GroupNotFoundError = { kind: "group_not_found"; group: string };

/** Union of all filesystem errors */
export type FileSystemError =
  | NotFoundError
  | PermissionDeniedError
  | IOError
  | UserNotFoundError
  | GroupNotFoundError;

// ── Drift issues (semantic, not strings) ───────────────────────────────

export type WrongOwnerIssue = { kind: "wrong_owner"; expected: string; actual: string };
export type WrongGroupIssue = { kind: "wrong_group"; expected: string; actual: string };
export type WrongModeIssue = { kind: "wrong_mode"; expected: string; actual: string };
export type HashFailedIssue = { kind: "hash_failed"; error: FileSystemError };

export type DriftIssue = WrongOwnerIssue | WrongGroupIssue | WrongModeIssue | HashFailedIssue;

/** Format a drift issue for display */
export function formatIssue(issue: DriftIssue): string {
  switch (issue.kind) {
    case "wrong_owner":
      return `owner is ${issue.actual}, expected ${issue.expected}`;
    case "wrong_group":
      return `group is ${issue.actual}, expected ${issue.expected}`;
    case "wrong_mode":
      return `mode is ${issue.actual}, expected ${issue.expected}`;
    case "hash_failed":
      return `hash failed: ${issue.error.kind}`;
  }
}

// ── System identity ────────────────────────────────────────────────────

/** Expected soulguard system user/group names per platform */
export type SystemIdentity = {
  /** System user that owns protected files (e.g. "soulguardian") */
  user: string;
  /** System group for protected files (e.g. "soulguard") */
  group: string;
};

// Re-export Result from result.ts for convenience
export type { Result } from "./result.js";
export { ok, err } from "./result.js";
