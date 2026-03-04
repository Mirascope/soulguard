/**
 * Tier management — add/remove files from protect/watch tiers.
 *
 * These are the core operations behind `soulguard protect`, `soulguard watch`,
 * and `soulguard release`. Each modifies the files map in-memory.
 * Config I/O lives in config.ts.
 */

import type { SoulguardConfig, Tier } from "./types.js";

// ── Types ──────────────────────────────────────────────────────────────

export type TierChangeResult = {
  /** Files that were added to the target tier */
  added: string[];
  /** Files that were moved from another tier */
  moved: string[];
  /** Files that were already in the target tier (no-op) */
  alreadyInTier: string[];
  /** The updated config */
  config: SoulguardConfig;
};

export type ReleaseResult = {
  /** Files that were removed from a tier */
  released: string[];
  /** Files that weren't in any tier (no-op) */
  notTracked: string[];
  /** The updated config */
  config: SoulguardConfig;
};

// ── Tier operations ────────────────────────────────────────────────────

/**
 * Set files to the given tier. Moves them from other tiers if necessary.
 * Works on the `files: Record<string, Tier>` config schema.
 */
export function setTier(config: SoulguardConfig, files: string[], tier: Tier): TierChangeResult {
  const added: string[] = [];
  const moved: string[] = [];
  const alreadyInTier: string[] = [];

  const newFiles = { ...config.files };

  for (const file of files) {
    const currentTier = newFiles[file];
    if (currentTier === tier) {
      alreadyInTier.push(file);
    } else if (currentTier !== undefined) {
      moved.push(file);
      newFiles[file] = tier;
    } else {
      added.push(file);
      newFiles[file] = tier;
    }
  }

  return {
    added,
    moved,
    alreadyInTier,
    config: { ...config, files: newFiles },
  };
}

/**
 * Release files from all tiers (stop tracking entirely).
 */
export function release(config: SoulguardConfig, files: string[]): ReleaseResult {
  const released: string[] = [];
  const notTracked: string[] = [];

  const newFiles = { ...config.files };

  for (const file of files) {
    if (newFiles[file] !== undefined) {
      released.push(file);
      delete newFiles[file];
    } else {
      notTracked.push(file);
    }
  }

  return {
    released,
    notTracked,
    config: { ...config, files: newFiles },
  };
}
