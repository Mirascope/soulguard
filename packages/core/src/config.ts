/**
 * Config helpers — extract patterns by tier from the files map.
 *
 * These replace direct access to the old `config.protect` and `config.watch` arrays.
 */

import type { SoulguardConfig, Tier } from "./types.js";

/** Get all patterns at a given tier. */
export function patternsForTier(config: SoulguardConfig, tier: Tier): string[] {
  return Object.entries(config.files)
    .filter(([, t]) => t === tier)
    .map(([pattern]) => pattern);
}

/** Shorthand: get all protect-tier patterns. */
export function protectPatterns(config: SoulguardConfig): string[] {
  return patternsForTier(config, "protect");
}

/** Shorthand: get all watch-tier patterns. */
export function watchPatterns(config: SoulguardConfig): string[] {
  return patternsForTier(config, "watch");
}
