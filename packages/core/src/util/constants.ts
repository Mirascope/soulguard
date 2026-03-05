/**
 * Shared constants for soulguard.
 */

import type { FileOwnership, SoulguardConfig } from "./types.js";

/** System user/group identity for soulguard */
export const SOULGUARDIAN_IDENTITY = { user: "soulguardian", group: "soulguard" } as const;

/** Default protect-tier file ownership */
export const PROTECT_OWNERSHIP: FileOwnership = {
  user: SOULGUARDIAN_IDENTITY.user,
  group: SOULGUARDIAN_IDENTITY.group,
  mode: "444",
} as const;

/** Sensible default config — protects soulguard's own config */
export const DEFAULT_CONFIG: SoulguardConfig = {
  version: 1 as const,
  files: {
    "soulguard.json": "protect",
  },
} as const;
