/**
 * CLI command: soulguard protect|watch|release <files...>
 *
 * Unified command for all tier operations. Modifies soulguard.json
 * and performs targeted enforcement (no full sync).
 */

import type { ConsoleOutput } from "../console.js";
import type { SystemOperations } from "../system-ops.js";
import type { FileOwnership, Tier } from "../types.js";
import { readConfig, writeConfig } from "../config.js";
import { setTier, release } from "../tier.js";
import { stagingPath } from "../staging.js";
import { Registry } from "../registry.js";
import { isGitEnabled, gitCommit } from "../git.js";

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
      const e = configResult.error;
      if (e.kind === "not_found") {
        this.out.error("Failed to read config: soulguard.json not found");
      } else {
        this.out.error(`Failed to read config: ${e.message}`);
      }
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

    // ── Surgical enforcement (no full sync) ────────────────────────────

    // Load registry
    const registryResult = await Registry.load(ops);
    if (!registryResult.ok) {
      this.out.error(`Failed to load registry: ${registryResult.error.message}`);
      return 1;
    }
    const registry = registryResult.value;

    if (action.kind === "set" && action.tier === "protect") {
      // Protect: snapshot ownership, register, then enforce
      for (const file of changedFiles) {
        // Check if it's a directory
        const statResult = await ops.stat(file);
        const isDir = statResult.ok && statResult.value.isDirectory;

        // Register (snapshots original ownership)
        await registry.register(file, "protect", isDir ? "directory" : "file");

        // Enforce ownership
        if (isDir) {
          const chownResult = await ops.chownRecursive(file, {
            user: expectedProtectOwnership.user,
            group: expectedProtectOwnership.group,
          });
          if (!chownResult.ok) {
            this.out.error(`Failed to chown ${file}: ${chownResult.error.kind}`);
            return 1;
          }
          const chmodResult = await ops.chmodRecursive(file, expectedProtectOwnership.mode);
          if (!chmodResult.ok) {
            this.out.error(`Failed to chmod ${file}: ${chmodResult.error.kind}`);
            return 1;
          }
        } else {
          const chownResult = await ops.chown(file, {
            user: expectedProtectOwnership.user,
            group: expectedProtectOwnership.group,
          });
          if (!chownResult.ok) {
            this.out.error(`Failed to chown ${file}: ${chownResult.error.kind}`);
            return 1;
          }
          const chmodResult = await ops.chmod(file, expectedProtectOwnership.mode);
          if (!chmodResult.ok) {
            this.out.error(`Failed to chmod ${file}: ${chmodResult.error.kind}`);
            return 1;
          }
        }
      }
    } else if (action.kind === "set" && action.tier === "watch") {
      // Watch: just register (no ownership enforcement)
      for (const file of changedFiles) {
        await registry.register(file, "watch");
      }
    } else if (action.kind === "release") {
      // Release: restore original ownership for protect files, unregister
      for (const file of changedFiles) {
        const entry = registry.unregister(file);
        if (entry?.tier === "protect") {
          const { user, group, mode } = entry.originalOwnership;
          const isDir = entry.kind === "directory";
          if (isDir) {
            await ops.chownRecursive(file, { user, group });
            await ops.chmodRecursive(file, mode);
          } else {
            await ops.chown(file, { user, group });
            await ops.chmod(file, mode);
          }
        }
        // Clean up staging siblings
        const sibling = stagingPath(file);
        const siblingExists = await ops.exists(sibling);
        if (siblingExists.ok && siblingExists.value) {
          await ops.deleteFile(sibling);
        }
      }
    }

    // Persist registry
    const regWriteResult = await registry.write();
    if (!regWriteResult.ok) {
      this.out.error(`Failed to write registry: ${regWriteResult.error.message}`);
      return 1;
    }

    // Best-effort git commit
    if (await isGitEnabled(ops, config)) {
      const gitFiles = ["soulguard.json", ...changedFiles];
      const verb = action.kind === "set" ? action.tier : "release";
      await gitCommit(ops, gitFiles, `soulguard: ${verb} ${changedFiles.join(", ")}`);
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
