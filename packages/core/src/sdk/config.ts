/**
 * Config helpers — extract file paths by tier from the files map,
 * plus config I/O (read/write soulguard.json).
 */

import type { SoulguardConfig, Tier } from "../util/types.js";

/** Get all paths at a given tier. */
export function patternsForTier(config: SoulguardConfig, tier: Tier): string[] {
  return Object.entries(config.files)
    .filter(([, t]) => t === tier)
    .map(([pattern]) => pattern);
}

/** Shorthand: get all protected paths. */
export function protectPatterns(config: SoulguardConfig): string[] {
  return patternsForTier(config, "protect");
}

/** Shorthand: get all watched paths. */
export function watchPatterns(config: SoulguardConfig): string[] {
  return patternsForTier(config, "watch");
}

// ── Config I/O ─────────────────────────────────────────────────────────

import type { SystemOperations } from "../util/system-ops.js";
import type { Result } from "../util/types.js";
import { ok, err } from "../util/result.js";
import { parseConfig } from "./schema.js";
import { makeDefaultConfig } from "../util/constants.js";

export type ConfigError =
  | { kind: "not_found" }
  | { kind: "parse_failed"; message: string }
  | { kind: "io_error"; message: string };

export type ConfigWriteError = { kind: "config_write_failed"; message: string };

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
 * Write soulguard.json to disk.
 */
export async function writeConfig(
  ops: SystemOperations,
  config: SoulguardConfig,
): Promise<Result<void, ConfigWriteError>> {
  const content = JSON.stringify(config, null, 2) + "\n";
  const result = await ops.writeFile("soulguard.json", content);
  if (!result.ok) {
    return err({ kind: "config_write_failed", message: result.error.kind });
  }
  return ok(undefined);
}

/**
 * Ensure soulguard.json exists — reads if present, writes default if missing.
 * Returns the config and whether it was newly created.
 */
export async function ensureConfig(
  ops: SystemOperations,
  guardian: string,
): Promise<Result<{ config: SoulguardConfig; created: boolean }, ConfigError>> {
  const result = await readConfig(ops);

  if (result.ok) {
    return ok({ config: result.value, created: false });
  }

  if (result.error.kind !== "not_found") {
    return err(result.error);
  }

  // Write default config with the per-agent guardian name
  const config = makeDefaultConfig(guardian);
  const content = JSON.stringify(config, null, 2) + "\n";
  const writeResult = await ops.writeFile("soulguard.json", content);
  if (!writeResult.ok) {
    return err({ kind: "io_error", message: `write failed: ${writeResult.error.kind}` });
  }

  return ok({ config, created: true });
}
