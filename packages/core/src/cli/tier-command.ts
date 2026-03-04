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

/** Check if a path is a directory on disk. */
async function isDirectory(ops: SystemOperations, path: string): Promise<boolean> {
  const stat = await ops.stat(path);
  return stat.ok && stat.value.isDirectory;
}

/** Enforce protect-tier ownership on a path (file or directory). */
async function enforceProtect(
  ops: SystemOperations,
  path: string,
  ownership: FileOwnership,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const isDir = await isDirectory(ops, path);
  if (isDir) {
    const chown = await ops.chownRecursive(path, { user: ownership.user, group: ownership.group });
    if (!chown.ok) return { ok: false, error: `chown ${path}: ${chown.error.kind}` };
    const chmod = await ops.chmodRecursive(path, ownership.mode);
    if (!chmod.ok) return { ok: false, error: `chmod ${path}: ${chmod.error.kind}` };
  } else {
    const chown = await ops.chown(path, { user: ownership.user, group: ownership.group });
    if (!chown.ok) return { ok: false, error: `chown ${path}: ${chown.error.kind}` };
    const chmod = await ops.chmod(path, ownership.mode);
    if (!chmod.ok) return { ok: false, error: `chmod ${path}: ${chmod.error.kind}` };
  }
  return { ok: true };
}

/** Restore original ownership on a path (file or directory). */
async function restoreOwnership(
  ops: SystemOperations,
  path: string,
  ownership: FileOwnership,
): Promise<void> {
  const isDir = await isDirectory(ops, path);
  if (isDir) {
    await ops.chownRecursive(path, { user: ownership.user, group: ownership.group });
    await ops.chmodRecursive(path, ownership.mode);
  } else {
    await ops.chown(path, { user: ownership.user, group: ownership.group });
    await ops.chmod(path, ownership.mode);
  }
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
    let changedPaths: string[];

    if (action.kind === "set") {
      const result = setTier(configResult.value, files, action.tier);
      config = result.config;
      changedPaths = [...result.added, ...result.moved];

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
      changedPaths = result.released;

      for (const f of result.released) {
        this.out.success(`  - ${f} (released)`);
      }
      for (const f of result.notTracked) {
        this.out.info(`  · ${f} (not tracked)`);
      }
    }

    if (changedPaths.length === 0) {
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
      for (const file of changedPaths) {
        // Register (snapshots original ownership before we change it)
        await registry.register(file, "protect");
        // Enforce ownership
        const result = await enforceProtect(ops, file, expectedProtectOwnership);
        if (!result.ok) {
          this.out.error(`Failed to enforce: ${result.error}`);
          return 1;
        }
      }
    } else if (action.kind === "set" && action.tier === "watch") {
      for (const file of changedPaths) {
        await registry.register(file, "watch");
      }
    } else if (action.kind === "release") {
      for (const file of changedPaths) {
        const entry = registry.unregister(file);
        if (entry?.tier === "protect") {
          await restoreOwnership(ops, file, entry.originalOwnership);
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
      const gitFiles = ["soulguard.json", ...changedPaths];
      const verb = action.kind === "set" ? action.tier : "release";
      await gitCommit(ops, gitFiles, `soulguard: ${verb} ${changedPaths.join(", ")}`);
    }

    // Summary
    this.out.write("");
    if (action.kind === "set") {
      this.out.success(`Updated. ${changedPaths.length} file(s) now ${action.tier}-tier.`);
    } else {
      this.out.success(`Released. ${changedPaths.length} file(s) untracked.`);
    }
    return 0;
  }
}
