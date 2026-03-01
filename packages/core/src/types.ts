/**
 * Soulguard Core Types
 */

// ── Config ─────────────────────────────────────────────────────────────

/** User-level configuration (soulguard.json) */
export type SoulguardConfig = {
  /** Schema version for forward compatibility */
  version: 1;
  /** Files in the protect tier (require owner approval to modify) */
  protect: string[];
  /** File patterns in the watch tier (agent writes freely, changes recorded) */
  watch: string[];
  /** Whether to initialize and track git (default: true) */
  git?: boolean;
};

// ── Tiers ──────────────────────────────────────────────────────────────

export type Tier = "protect" | "watch";

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
