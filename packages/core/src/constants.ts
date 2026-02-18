/**
 * Shared constants for soulguard.
 */

import type { FileOwnership } from "./types.js";

/** System user/group identity for soulguard */
export const IDENTITY = { user: "soulguardian", group: "soulguard" } as const;

/** Default vault file ownership */
export const VAULT_OWNERSHIP: FileOwnership = {
  user: IDENTITY.user,
  group: IDENTITY.group,
  mode: "444",
} as const;
