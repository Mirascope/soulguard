/**
 * CLI command: soulguard protect|watch|release <files...>
 *
 * Unified command for all tier operations. Modifies soulguard.json,
 * runs sync, and handles tier-specific cleanup.
 */

import type { ConsoleOutput } from "../console.js";
import type { SystemOperations } from "../system-ops.js";
import type { FileOwnership, Tier } from "../types.js";
import { readConfig, writeConfig, setTier, release } from "../tier.js";
import { stagingPath } from "../staging.js";
import { sync } from "../sync.js";

export type TierAction = { kind: "set"; tier: Tier } | { kind: "release" };

export type TierCommandOptions = {
  ops: SystemOperations;
  files: string[];
  action: TierAction;
  expectedProtectOwnership: FileOwnership;
};

/** Arrow/label for reporting tier transitions. */
function formatChange(action: TierAction, from?: Tier): { prefix: string; suffix: string } {
  if (action.kind === "release") {
    return { prefix: "-", suffix: "(released)" };
  }
  const tier = action.tier;
  if (from === undefined) {
    return { prefix: "+", suffix: `→ ${tier}` };
  }
  const arrow = from === "watch" ? "↑" : "↓";
  return { prefix: arrow, suffix: `→ ${tier} (was ${from})` };
}

export class TierCommand {
  constructor(
    private opts: TierCommandOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const { ops, files, action, expectedProtectOwnership } = this.opts;

    if (files.length === 0) {
      this.out.error("No files specified.");
      return 1;
    }

    // Read current config
    const configResult = await readConfig(ops);
    if (!configResult.ok) {
      this.out.error(`Failed to read config: ${configResult.error.message}`);
      return 1;
    }

    let config;
    let changedFiles: string[];

    if (action.kind === "set") {
      const result = setTier(configResult.value, files, action.tier);
      config = result.config;
      changedFiles = [...result.added, ...result.moved];

      // Report
      for (const f of result.added) {
        const fmt = formatChange(action);
        this.out.success(`  ${fmt.prefix} ${f} ${fmt.suffix}`);
      }
      for (const f of result.moved) {
        const oldTier = configResult.value.files[f];
        const fmt = formatChange(action, oldTier);
        this.out.info(`  ${fmt.prefix} ${f} ${fmt.suffix}`);
      }
      for (const f of result.alreadyInTier) {
        this.out.info(`  · ${f} (already ${action.tier})`);
      }
    } else {
      const result = release(configResult.value, files);
      config = result.config;
      changedFiles = result.released;

      for (const f of result.released) {
        this.out.success(`  - ${f} (released)`);
      }
      for (const f of result.notTracked) {
        this.out.info(`  · ${f} (not tracked)`);
      }
    }

    if (changedFiles.length === 0) {
      this.out.info("Nothing to change.");
      return 0;
    }

    // Write updated config
    const writeResult = await writeConfig(ops, config);
    if (!writeResult.ok) {
      this.out.error(`Failed to write config: ${writeResult.error.message}`);
      return 1;
    }

    // Sync to enforce ownership + update registry
    const syncResult = await sync({ config, expectedProtectOwnership, ops });
    if (!syncResult.ok) {
      this.out.error("Sync failed after config update.");
      return 1;
    }

    // Tier-specific post-sync cleanup
    if (action.kind === "release") {
      // Clean up staging siblings for released files
      for (const file of changedFiles) {
        const sibling = stagingPath(file);
        const siblingExists = await ops.exists(sibling);
        if (siblingExists.ok && siblingExists.value) {
          await ops.deleteFile(sibling);
        }
      }
    }

    // Summary
    this.out.write("");
    if (action.kind === "set") {
      this.out.success(`Updated. ${changedFiles.length} file(s) now ${action.tier}-tier.`);
    } else {
      this.out.success(`Released. ${changedFiles.length} file(s) untracked.`);
    }
    return 0;
  }
}
