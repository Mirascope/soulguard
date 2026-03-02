/**
 * Tier management — add/remove files from protect/watch tiers.
 *
 * These are the core operations behind `soulguard protect`, `soulguard watch`,
 * and `soulguard release`. Each reads soulguard.json, modifies the files map,
 * writes it back, and syncs.
 */

import type { SystemOperations } from "./system-ops.js";
import type { SoulguardConfig, Tier, Result } from "./types.js";
import { ok, err } from "./result.js";
import { parseConfig } from "./schema.js";

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

export type TierError =
  | { kind: "config_read_failed"; message: string }
  | { kind: "config_write_failed"; message: string }
  | { kind: "config_parse_failed"; message: string };

// ── Config I/O ─────────────────────────────────────────────────────────

export async function readConfig(
  ops: SystemOperations,
): Promise<Result<SoulguardConfig, TierError>> {
  const raw = await ops.readFile("soulguard.json");
  if (!raw.ok) {
    return err({ kind: "config_read_failed", message: raw.error.kind });
  }
  try {
    return ok(parseConfig(JSON.parse(raw.value)));
  } catch (e) {
    return err({
      kind: "config_parse_failed",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function writeConfig(
  ops: SystemOperations,
  config: SoulguardConfig,
): Promise<Result<void, TierError>> {
  const content = JSON.stringify(config, null, 2) + "\n";
  const result = await ops.writeFile("soulguard.json", content);
  if (!result.ok) {
    return err({ kind: "config_write_failed", message: result.error.kind });
  }
  return ok(undefined);
}

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
