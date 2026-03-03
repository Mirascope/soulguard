/**
 * CLI command: soulguard stage <files...>
 *
 * Creates on-demand staging copies for protect-tier files so the agent
 * can edit them to propose changes. No sudo required.
 */

import type { ConsoleOutput } from "../console.js";
import type { SystemOperations } from "../system-ops.js";
import type { SoulguardConfig } from "../types.js";
import { stagingPath } from "../staging.js";

export type StageCommandOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  files: string[];
};

export class StageCommand {
  constructor(
    private opts: StageCommandOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const { ops, config, files } = this.opts;

    if (files.length === 0) {
      this.out.error("No files specified.");
      return 1;
    }

    let staged = 0;
    let skipped = 0;

    for (const file of files) {
      // Only allow staging of protect-tier files
      const tier = config.files[file];
      if (tier !== "protect") {
        this.out.info(`  · ${file} (not protect-tier, skipping)`);
        skipped++;
        continue;
      }

      // Check if protect-tier file exists
      const protectExists = await ops.exists(file);
      if (!protectExists.ok || !protectExists.value) {
        this.out.warn(`  ⚠️ ${file} (protect-tier file missing, skipping)`);
        skipped++;
        continue;
      }

      const sibling = stagingPath(file);

      // Check if staging already exists
      const stagingExists = await ops.exists(sibling);
      if (stagingExists.ok && stagingExists.value) {
        this.out.info(`  · ${file} (staging already exists)`);
        skipped++;
        continue;
      }

      // Copy protect-tier file to staging
      const copyResult = await ops.copyFile(file, sibling);
      if (!copyResult.ok) {
        this.out.error(`  ✗ ${file} (failed to create staging copy)`);
        continue;
      }

      this.out.success(`  + ${file} → ${sibling}`);
      staged++;
    }

    this.out.write("");
    if (staged > 0) {
      this.out.success(
        `Staged ${staged} file(s). Edit the .soulguard.* copies to propose changes.`,
      );
    } else {
      this.out.info("Nothing to stage.");
    }
    return 0;
  }
}
