/**
 * Shared constants for soulguard.
 */

import type { FileOwnership, SoulguardConfig } from "./types.js";

/** System user/group identity for soulguard */
export const IDENTITY = { user: "soulguardian", group: "soulguard" } as const;

/** Default vault file ownership */
export const VAULT_OWNERSHIP: FileOwnership = {
  user: IDENTITY.user,
  group: IDENTITY.group,
  mode: "444",
} as const;

/** Sensible default config — vaults soulguard's own config */
export const DEFAULT_CONFIG: SoulguardConfig = {
  vault: ["soulguard.json"],
  ledger: [],
} as const;
