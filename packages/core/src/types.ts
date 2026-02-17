/**
 * Soulguard Core Types
 *
 * These types define the contract for vault, ledger, proposals, and the
 * socket API. Everything else builds against these.
 */

// ── Config ─────────────────────────────────────────────────────────────

export type SoulguardConfig = {
  /** Files protected as vault items (require owner approval to modify) */
  vault: string[];
  /** File patterns tracked as ledger items (agent writes freely, changes recorded) */
  ledger: string[];
};

// ── Tiers ──────────────────────────────────────────────────────────────

/** Vault: locked files requiring owner approval to modify */
export type VaultItem = {
  /** Relative path from workspace root */
  path: string;
  /** SHA-256 hash of current contents */
  hash: string;
  /** When the file was last approved/locked */
  lockedAt: string; // ISO-8601
};

/** Ledger: tracked files the agent writes freely, changes recorded */
export type LedgerItem = {
  /** Relative path from workspace root (supports globs) */
  pattern: string;
};

// ── Proposals ──────────────────────────────────────────────────────────

export type ProposalStatus = "pending" | "approved" | "rejected" | "expired";

export type Proposal = {
  id: string;
  /** Path of the vault file being modified */
  path: string;
  /** Unified diff of the proposed change */
  diff: string;
  /** Full content of the proposed new version */
  proposedContent: string;
  /** Who/what initiated the proposal (agent session, CLI, etc.) */
  source: string;
  /** Optional human-readable reason for the change */
  reason?: string;
  status: ProposalStatus;
  createdAt: string; // ISO-8601
  resolvedAt?: string; // ISO-8601
  resolvedBy?: string;
};

// ── Changelog ──────────────────────────────────────────────────────────

export type ChangelogEntry = {
  timestamp: string; // ISO-8601
  action:
    | "vault.lock"
    | "vault.unlock"
    | "vault.propose"
    | "vault.approve"
    | "vault.reject"
    | "ledger.write"
    | "ledger.delete"
    | "config.change"
    | "init";
  path: string;
  /** SHA-256 hash after the change */
  hash?: string;
  /** SHA-256 hash before the change */
  previousHash?: string;
  /** Source of the action */
  source: string;
  /** Additional context */
  metadata?: Record<string, unknown>;
};

// ── Socket API ─────────────────────────────────────────────────────────

/** Queries: no auth required */
export type SocketQuery =
  | { kind: "status" }
  | { kind: "proposals"; filter?: ProposalStatus }
  | { kind: "log"; limit?: number; since?: string }
  | { kind: "vault.list" }
  | { kind: "ledger.list" }
  | { kind: "config" };

/**
 * Mutations: password required (except propose).
 * Propose is unauthenticated because agents need to submit proposals —
 * only approval/rejection requires the owner's password.
 */
export type SocketMutation =
  | { kind: "propose"; path: string; content: string; reason?: string; source?: string }
  | { kind: "approve"; proposalId: string; password: string }
  | { kind: "reject"; proposalId: string; password: string; reason?: string }
  | { kind: "vault.add"; path: string; password: string }
  | { kind: "vault.remove"; path: string; password: string }
  | { kind: "config.update"; config: Partial<SoulguardConfig>; password: string };

/** Events: subscription-based */
export type SocketEvent =
  | { kind: "proposal.created"; proposal: Proposal }
  | { kind: "proposal.resolved"; proposal: Proposal }
  | { kind: "ledger.change"; entry: ChangelogEntry }
  | { kind: "vault.violation"; path: string; source: string };

/** Socket request envelope */
export type SocketRequest = {
  id: string;
  type: "query" | "mutation" | "subscribe";
  payload: SocketQuery | SocketMutation;
};

/** Socket response envelope */
export type SocketResponse = {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
};

// ── Daemon ─────────────────────────────────────────────────────────────

export type DaemonStatus = {
  running: boolean;
  pid?: number;
  version: string;
  workspaces: string[];
  uptime?: number; // seconds
};

// ── Init ───────────────────────────────────────────────────────────────

export type InitOptions = {
  /** Workspace directory to protect */
  workspace: string;
  /** Skip interactive prompts */
  nonInteractive?: boolean;
  /** Platform override (auto-detected if omitted) */
  platform?: "macos" | "linux";
};

export type InitResult = {
  systemUser: string;
  group: string;
  socketPath: string;
  vaultFiles: string[];
  ledgerPatterns: string[];
};
