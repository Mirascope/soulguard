/**
 * DeleteCommand — stage protected files or directories for deletion.
 */

import type { ConsoleOutput } from "../util/console.js";
import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig } from "../util/types.js";
import { deleteStagingEntry } from "../sdk/delete.js";

export type DeleteCommandOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  paths: string[];
};

export class DeleteCommand {
  constructor(
    private opts: DeleteCommandOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const { ops, config, paths } = this.opts;

    if (paths.length === 0) {
      this.out.error("No paths specified.");
      return 1;
    }

    let deleted = 0;

    for (const path of paths) {
      const result = await deleteStagingEntry({ ops, config, path });

      if (!result.ok) {
        switch (result.error.kind) {
          case "not_in_protect_tier":
            this.out.error(`${result.error.path} is not in the protect tier.`);
            return 1;
          case "not_found":
            this.out.error(`${result.error.path} does not exist.`);
            return 1;
          case "already_deleted":
            this.out.info(`  · ${result.error.path} (already staged for deletion)`);
            continue;
          case "delete_failed":
            this.out.error(`Failed to delete ${result.error.path}: ${result.error.message}`);
            return 1;
        }
      }

      this.out.success(`  🗑️  ${path} (staged for deletion)`);
      deleted++;
    }

    if (deleted === 0) {
      this.out.info("Nothing to do.");
    } else {
      this.out.write("");
      this.out.success(`Staged ${deleted} ${deleted === 1 ? "path" : "paths"} for deletion.`);
    }
    return 0;
  }
}
