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

// ── Config loading ─────────────────────────────────────────────────────

import type { SystemOperations } from "./system-ops.js";
import type { Result } from "./types.js";
import { ok, err } from "./result.js";
import { parseConfig } from "./schema.js";
import { DEFAULT_CONFIG } from "./constants.js";

export type ConfigError =
  | { kind: "not_found" }
  | { kind: "parse_failed"; message: string }
  | { kind: "io_error"; message: string };

/**
 * Read and parse soulguard.json from a workspace.
 * Returns not_found if the file doesn't exist.
 */
export async function readConfig(
  ops: SystemOperations,
): Promise<Result<SoulguardConfig, ConfigError>> {
  const exists = await ops.exists("soulguard.json");
  if (!exists.ok) {
    return err({ kind: "io_error", message: exists.error.message });
  }
  if (!exists.value) {
    return err({ kind: "not_found" });
  }

  const raw = await ops.readFile("soulguard.json");
  if (!raw.ok) {
    return err({ kind: "io_error", message: raw.error.kind });
  }

  try {
    return ok(parseConfig(JSON.parse(raw.value)));
  } catch (e) {
    return err({
      kind: "parse_failed",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Ensure soulguard.json exists — reads if present, writes default if missing.
 * Returns the config and whether it was newly created.
 */
export async function ensureConfig(
  ops: SystemOperations,
): Promise<Result<{ config: SoulguardConfig; created: boolean }, ConfigError>> {
  const result = await readConfig(ops);

  if (result.ok) {
    return ok({ config: result.value, created: false });
  }

  if (result.error.kind !== "not_found") {
    return err(result.error);
  }

  // Write default config
  const content = JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n";
  const writeResult = await ops.writeFile("soulguard.json", content);
  if (!writeResult.ok) {
    return err({ kind: "io_error", message: `write failed: ${writeResult.error.kind}` });
  }

  return ok({ config: DEFAULT_CONFIG, created: true });
}
