/**
 * StageCommand — stage protect-tier files for editing or deletion.
 */

import type { ConsoleOutput } from "../util/console.js";
import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig } from "../util/types.js";
import { stagingPath, DELETE_SENTINEL } from "../sdk/staging.js";
import { protectPatterns } from "../sdk/config.js";

export type StageCommandOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  paths: string[];
  /** Stage for deletion instead of editing */
  delete?: boolean;
};

export class StageCommand {
  constructor(
    private opts: StageCommandOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const { ops, config, paths, delete: isDelete } = this.opts;
    const protectFiles = new Set(protectPatterns(config));

    if (paths.length === 0) {
      this.out.error("No paths specified.");
      return 1;
    }

    let staged = 0;

    for (const path of paths) {
      if (!protectFiles.has(path)) {
        this.out.error(`${path} is not in the protect tier.`);
        return 1;
      }

      const target = stagingPath(path);

      if (isDelete) {
        // Stage for deletion: write sentinel
        await ops.mkdir(target.substring(0, target.lastIndexOf("/")));
        const writeResult = await ops.writeFile(target, JSON.stringify(DELETE_SENTINEL, null, 2));
        if (!writeResult.ok) {
          this.out.error(`Failed to write sentinel for ${path}: ${writeResult.error.kind}`);
          return 1;
        }
        this.out.success(`  🗑️  ${path} (staged for deletion)`);
        staged++;
      } else {
        // Stage for editing: copy protected content to staging
        const existsResult = await ops.exists(target);
        if (existsResult.ok && existsResult.value) {
          this.out.info(`  · ${path} (already staged)`);
          continue;
        }

        // Create parent dirs
        const lastSlash = target.lastIndexOf("/");
        if (lastSlash > 0) {
          await ops.mkdir(target.substring(0, lastSlash));
        }

        const copyResult = await ops.copyFile(path, target);
        if (!copyResult.ok) {
          this.out.error(`Failed to stage ${path}: ${copyResult.error.kind}`);
          return 1;
        }
        this.out.success(`  📝 ${path} (staged for editing)`);
        staged++;
      }
    }

    if (staged === 0) {
      this.out.info("Nothing to stage.");
    } else {
      this.out.write("");
      this.out.success(`Staged ${staged} file(s).`);
    }
    return 0;
  }
}
