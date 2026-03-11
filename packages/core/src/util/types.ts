/**
 * Soulguard Core Types
 */

// ── Config ─────────────────────────────────────────────────────────────

/** User-level configuration (soulguard.json) */
export type SoulguardConfig = {
  /** Schema version for forward compatibility */
  version: 1;
  /** Per-agent guardian system user (e.g. "soulguardian_agent_a"). Set by `init`. */
  guardian: string;
  /**
   * Map from file path or directory path to its protection tier.
   * Literal paths only — no globs.
   */
  files: Record<string, Tier>;
  /** Whether to initialize and track git (default: true) */
  git?: boolean;
  /** Default ownership to restore when releasing protected files. Captured at init time. */
  defaultOwnership?: FileOwnership;
  /** Remote approval daemon configuration. Opt-in — omit to disable the daemon. */
  daemon?: DaemonConfig;
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

// ── Daemon config ──────────────────────────────────────────────────────

/** Configuration for the remote approval daemon. */
export type DaemonConfig = {
  /** Which ApprovalChannel implementation to use (e.g. "discord"). */
  channel: string;
  /** Debounce period (ms) after last staging write before creating a proposal. Default: 3000. */
  debounceMs?: number;
  /** Max time (ms) to wait for .wait-for-ready sentinel removal. Default: 300000 (5 min). */
  batchReadyTimeoutMs?: number;
  /** Channel-specific config block. Validated by the channel plugin, not core. */
  [channelName: string]: unknown;
};
