/**
 * StageCommand — stage protected files for editing or deletion.
 */

import type { ConsoleOutput } from "../util/console.js";
import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig } from "../util/types.js";
import { stage } from "../sdk/stage.js";

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

    if (paths.length === 0) {
      this.out.error("No paths specified.");
      return 1;
    }

    // Aggregate results across all paths
    const allStagedFiles: Array<{ path: string; action: "edit" | "delete" }> = [];
    const alreadyStaged: string[] = [];

    // Call SDK function for each path
    for (const path of paths) {
      const result = await stage({ ops, config, path, delete: isDelete });

      // Handle errors (fail fast on first error)
      if (!result.ok) {
        switch (result.error.kind) {
          case "not_in_protect_tier":
            this.out.error(`${result.error.path} is not in the protect tier.`);
            return 1;
          case "stage_failed":
            this.out.error(`Failed to stage ${result.error.path}: ${result.error.message}`);
            return 1;
        }
      }

      // Accumulate results
      if (result.value.stagedFiles.length === 0) {
        // Path was already staged (SDK skipped it)
        alreadyStaged.push(path);
      } else {
        allStagedFiles.push(...result.value.stagedFiles);
      }
    }

    // Format and display results
    for (const file of alreadyStaged) {
      this.out.info(`  · ${file} (already staged)`);
    }

    for (const { path, action } of allStagedFiles) {
      if (action === "delete") {
        this.out.success(`  🗑️  ${path} (staged for deletion)`);
      } else {
        this.out.success(`  📝 ${path} (staged for editing)`);
      }
    }

    if (allStagedFiles.length === 0) {
      this.out.info("Nothing to stage.");
    } else {
      this.out.write("");
      this.out.success(`Staged ${allStagedFiles.length} file(s).`);
    }

    return 0;
  }
}
