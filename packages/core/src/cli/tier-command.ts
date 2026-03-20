/**
 * CLI command: soulguard protect|watch|release <files...>
 *
 * Unified command for all tier operations. Modifies soulguard.json
 * and performs targeted enforcement (no full sync).
 */

import type { ConsoleOutput } from "../util/console.js";
import type { SystemOperations } from "../util/system-ops.js";
import type { FileOwnership, Tier } from "../util/types.js";
import { readConfig, writeConfig } from "../sdk/config.js";
import { getProtectOwnership } from "../util/constants.js";
import { setTier, release } from "../sdk/tier.js";
import { stagingPath } from "../sdk/staging.js";
import { createStagingCopy } from "../sdk/staging-ops.js";
import { isGitEnabled, gitCommit } from "../util/git.js";

export type TierAction = { kind: "set"; tier: Tier } | { kind: "release" };

export type TierCommandOptions = {
  ops: SystemOperations;
  files: string[];
  action: TierAction;
};

/** Format a summary like "1 file", "2 directories", "1 file and 2 directories". */
function formatSummary(paths: string[]): string {
  const dirs = paths.filter((p) => p.endsWith("/")).length;
  const files = paths.length - dirs;
  const parts: string[] = [];
  if (files > 0) parts.push(`${files} ${files === 1 ? "file" : "files"}`);
  if (dirs > 0) parts.push(`${dirs} ${dirs === 1 ? "directory" : "directories"}`);
  return parts.join(" and ");
}

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

/** Enforce protected ownership on a path (file or directory). */
async function enforceProtect(
  ops: SystemOperations,
  path: string,
  ownership: FileOwnership,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const isDir = await isDirectory(ops, path);
  if (isDir) {
    const chown = await ops.chownRecursive(path, { user: ownership.user, group: ownership.group });
    if (!chown.ok) return { ok: false, error: `chown ${path}: ${chown.error.kind}` };
    // Directories need execute bit for traversal (555), files get read-only (444)
    const chmod = await ops.chmodDirectoryTree(path, { fileMode: ownership.mode, dirMode: "555" });
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
    const { ops, files, action } = this.opts;

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

    // Auto-create missing paths (files and directories)
    const createdPaths = new Set<string>();
    if (action.kind === "set") {
      for (const file of files) {
        const exists = await ops.exists(file);
        if (exists.ok && exists.value) continue;

        if (file.endsWith("/")) {
          const mk = await ops.exec("mkdir", ["-p", file]);
          if (!mk.ok) {
            this.out.error(`Failed to create directory ${file}: ${mk.error.message}`);
            return 1;
          }
        } else {
          // Ensure parent directory exists for nested paths
          const parent = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : null;
          if (parent) {
            await ops.exec("mkdir", ["-p", parent]);
          }
          const wr = await ops.writeFile(file, "");
          if (!wr.ok) {
            this.out.error(`Failed to create file ${file}: ${wr.error.kind}`);
            return 1;
          }
        }
        // For watch tier, restore default ownership so the agent can write.
        // (For protect tier, the enforcement step below handles ownership.)
        if (action.tier === "watch") {
          const defaultOwnership = configResult.value.defaultOwnership;
          if (defaultOwnership) {
            const owner = { user: defaultOwnership.user, group: defaultOwnership.group };
            if (file.endsWith("/")) {
              await ops.chownRecursive(file, owner);
              // Directories need execute bit for traversal (755), not file mode (644)
              await ops.chmodRecursive(file, "755");
            } else {
              await ops.chown(file, owner);
              await ops.chmod(file, defaultOwnership.mode);
            }
          }
        }
        createdPaths.add(file);
      }
    }

    if (action.kind === "set") {
      const result = setTier(configResult.value, files, action.tier);
      config = result.config;
      changedPaths = [...result.added, ...result.moved];

      // Report
      for (const f of result.added) {
        const fmt = formatChange(action);
        const created = createdPaths.has(f) ? " (created)" : "";
        this.out.success(`  ${fmt.prefix} ${f} ${fmt.suffix}${created}`);
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

    // Keep soulguard.json staging copy in sync with canonical after config write
    const sgCopyResult = await createStagingCopy(
      ops,
      "soulguard.json",
      configResult.value.defaultOwnership ?? undefined,
    );
    if (!sgCopyResult.ok) {
      this.out.warn(`  Warning: staging copy failed for soulguard.json: ${sgCopyResult.error}`);
    }

    // ── Surgical enforcement (no full sync) ────────────────────────────

    if (action.kind === "set" && action.tier === "protect") {
      const expectedProtectOwnership = getProtectOwnership(configResult.value.guardian);
      for (const file of changedPaths) {
        const result = await enforceProtect(ops, file, expectedProtectOwnership);
        if (!result.ok) {
          this.out.error(`Failed to enforce: ${result.error}`);
          return 1;
        }
      }
      // ── Auto-create staging copies for newly protected files ──────
      const defaultOwnership = configResult.value.defaultOwnership;
      // Ensure .soulguard-staging/ exists and is agent-writable
      await ops.mkdir(".soulguard-staging");
      if (defaultOwnership) {
        await ops.chown(".soulguard-staging", {
          user: defaultOwnership.user,
          group: defaultOwnership.group,
        });
        await ops.chmod(".soulguard-staging", "755");
      }
      for (const file of changedPaths) {
        const isDir = await isDirectory(ops, file);
        if (isDir) {
          const listResult = await ops.listDir(file);
          if (listResult.ok) {
            for (const childPath of listResult.value) {
              const copyResult = await createStagingCopy(
                ops,
                childPath,
                defaultOwnership ?? undefined,
              );
              if (!copyResult.ok) {
                this.out.warn(
                  `  Warning: staging copy failed for ${childPath}: ${copyResult.error}`,
                );
              }
            }
          }
        } else {
          const copyResult = await createStagingCopy(ops, file, defaultOwnership ?? undefined);
          if (!copyResult.ok) {
            this.out.warn(`  Warning: staging copy failed for ${file}: ${copyResult.error}`);
          }
        }
      }
    } else if (action.kind === "set" && action.tier === "watch") {
      // Downgrade from protect → watch: restore default ownership
      const defaultOwnership = configResult.value.defaultOwnership;
      for (const file of changedPaths) {
        const wasTier = configResult.value.files[file];
        if (wasTier === "protect" && defaultOwnership) {
          await restoreOwnership(ops, file, defaultOwnership);
        }
      }
    } else if (action.kind === "release") {
      const defaultOwnership = configResult.value.defaultOwnership;
      for (const file of changedPaths) {
        // Restore ownership if we have a default and the file was protected
        const wasTier = configResult.value.files[file];
        if (wasTier === "protect" && defaultOwnership) {
          await restoreOwnership(ops, file, defaultOwnership);
        }
        // Clean up staging siblings
        const sibling = stagingPath(file);
        const siblingExists = await ops.exists(sibling);
        if (siblingExists.ok && siblingExists.value) {
          await ops.deleteFile(sibling);
        }
      }
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
      const label = action.tier === "protect" ? "protected" : "watched";
      this.out.success(`Updated. ${formatSummary(changedPaths)} now ${label}.`);
    } else {
      this.out.success(`Released. ${formatSummary(changedPaths)} untracked.`);
    }
    return 0;
  }
}
