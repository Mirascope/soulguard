/**
 * Shared constants for soulguard.
 */

import type { FileOwnership, SoulguardConfig } from "./types.js";

/** Shared system group for all soulguard guardians */
export const SOULGUARD_GROUP = "soulguard";

/** Derive the protect-tier ownership from a guardian username. */
export function getProtectOwnership(guardian: string): FileOwnership {
  return { user: guardian, group: SOULGUARD_GROUP, mode: "444" };
}

/** Derive the guardian username from the agent's OS username. */
export function guardianName(agentUser: string): string {
  return `soulguardian_${agentUser}`;
}

/** Build the default config for a new workspace. */
export function makeDefaultConfig(guardian: string): SoulguardConfig {
  return {
    version: 1 as const,
    guardian,
    files: {
      "soulguard.json": "protect",
    },
  };
}
