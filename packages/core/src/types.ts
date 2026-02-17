/**
 * Soulguard Core Types
 */

// ── Config ─────────────────────────────────────────────────────────────

/** User-level configuration (soulguard.json) */
export type SoulguardConfig = {
  /** Files protected as vault items (require owner approval to modify) */
  vault: string[];
  /** File patterns tracked as ledger items (agent writes freely, changes recorded) */
  ledger: string[];
};

// ── Vault & Ledger ─────────────────────────────────────────────────────

/** A file under vault protection */
export type VaultEntry = {
  /** Relative path from workspace root */
  path: string;
  /** SHA-256 hash of current contents */
  hash: string;
};

/** A file being tracked by the ledger */
export type LedgerEntry = {
  /** Relative path from workspace root */
  path: string;
  /** SHA-256 hash of current contents */
  hash: string;
};
