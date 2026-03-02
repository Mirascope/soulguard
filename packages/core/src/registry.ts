/**
 * Registry — tracks what files soulguard is currently managing.
 *
 * For protect+ tier files, snapshots original ownership so it can be restored
 * on release. For watch-tier files, just tracks the tier (no ownership change).
 *
 * Lives at .soulguard/registry.json.
 */

import { z } from "zod";
import { tierSchema } from "./schema.js";
import type { SystemOperations } from "./system-ops.js";
import type { FileOwnership, Tier, Result } from "./types.js";
import { ok, err } from "./result.js";

// ── Types ──────────────────────────────────────────────────────────────

export type RegistryEntry = {
  /** The tier soulguard applied to this file */
  tier: Tier;
  /** Original ownership before soulguard took over (only for protect+ tiers) */
  originalOwnership?: FileOwnership;
};

export type RegistryData = {
  /** Schema version for forward compatibility */
  version: 1;
  /** Map from relative file path to its registry entry */
  files: Record<string, RegistryEntry>;
};

export type RegistryError =
  | { kind: "read_failed"; message: string }
  | { kind: "write_failed"; message: string }
  | { kind: "parse_failed"; message: string };

const ownershipSchema = z.object({
  user: z.string(),
  group: z.string(),
  mode: z.string(),
});

const registryEntrySchema = z.object({
  tier: tierSchema,
  originalOwnership: ownershipSchema.optional(),
});

const registryDataSchema = z.object({
  version: z.literal(1),
  files: z.record(z.string(), registryEntrySchema),
});

// TODO(SOUL-23): Set ownership on registry.json when seal tier lands
const REGISTRY_PATH = ".soulguard/registry.json";

// ── Registry class ─────────────────────────────────────────────────────

export class Registry {
  private data: RegistryData;
  private ops: SystemOperations;

  private constructor(ops: SystemOperations, data: RegistryData) {
    this.ops = ops;
    this.data = data;
  }

  /** Load registry from disk. Returns empty registry if file doesn't exist. */
  static async load(ops: SystemOperations): Promise<Result<Registry, RegistryError>> {
    const exists = await ops.exists(REGISTRY_PATH);
    if (!exists.ok || !exists.value) {
      return ok(new Registry(ops, { version: 1, files: {} }));
    }

    const raw = await ops.readFile(REGISTRY_PATH);
    if (!raw.ok) {
      return err({ kind: "read_failed", message: raw.error.kind });
    }

    try {
      const parsed = registryDataSchema.parse(JSON.parse(raw.value));
      return ok(new Registry(ops, parsed));
    } catch (e) {
      return err({ kind: "parse_failed", message: e instanceof Error ? e.message : String(e) });
    }
  }

  /** Write registry to disk. */
  async write(): Promise<Result<void, RegistryError>> {
    const content = JSON.stringify(this.data, null, 2) + "\n";
    const result = await this.ops.writeFile(REGISTRY_PATH, content);
    if (!result.ok) {
      return err({ kind: "write_failed", message: result.error.kind });
    }
    return ok(undefined);
  }

  /** Get the underlying data (for passing to status, serialization, etc.) */
  toData(): RegistryData {
    return this.data;
  }

  /** Get entry for a file path. */
  get(path: string): RegistryEntry | undefined {
    return this.data.files[path];
  }

  /** All registered file paths. */
  paths(): string[] {
    return Object.keys(this.data.files);
  }

  /**
   * Register a file at a given tier. For protect+ tiers, snapshots current ownership.
   * No-op if already registered at the same tier.
   */
  async register(path: string, tier: Tier): Promise<void> {
    const existing = this.data.files[path];
    if (existing && existing.tier === tier) return;

    const needsOwnership = tier === "protect"; // SOUL-23: will add "seal" here

    let originalOwnership: FileOwnership | undefined;
    if (needsOwnership) {
      const stat = await this.ops.stat(path);
      if (stat.ok) {
        originalOwnership = {
          user: stat.value.ownership.user,
          group: stat.value.ownership.group,
          mode: stat.value.ownership.mode,
        };
      }
    }

    this.data.files[path] = { tier, ...(originalOwnership ? { originalOwnership } : {}) };
  }

  /**
   * Update a file's tier, preserving original ownership across tier changes.
   */
  async updateTier(path: string, newTier: Tier): Promise<void> {
    const existing = this.data.files[path];
    const preservedOwnership = existing?.originalOwnership;

    // Re-register at new tier (may snapshot new ownership if upgrading to protect)
    delete this.data.files[path];
    await this.register(path, newTier);

    // Preserve original ownership if we had it
    if (preservedOwnership && this.data.files[path]) {
      this.data.files[path].originalOwnership = preservedOwnership;
    }
  }

  /**
   * Unregister a file. Returns the entry so the caller can restore ownership.
   */
  unregister(path: string): RegistryEntry | undefined {
    const entry = this.data.files[path];
    if (!entry) return undefined;
    delete this.data.files[path];
    return entry;
  }

  /**
   * Find files in the registry that are no longer matched by any config pattern.
   */
  findOrphaned(managedFiles: string[]): string[] {
    const managedSet = new Set(managedFiles);
    return Object.keys(this.data.files).filter((path) => !managedSet.has(path));
  }
}
