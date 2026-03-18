/**
 * CreateCommand — create empty staging copies for new files in protected paths.
 */

import type { ConsoleOutput } from "../util/console.js";
import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig } from "../util/types.js";
import { create } from "../sdk/create.js";
import { stagingPath } from "../sdk/staging.js";

export type CreateCommandOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  paths: string[];
};

export class CreateCommand {
  constructor(
    private opts: CreateCommandOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const { ops, config, paths } = this.opts;

    if (paths.length === 0) {
      this.out.error("No paths specified.");
      return 1;
    }

    let created = 0;

    for (const path of paths) {
      const result = await create({ ops, config, path });

      if (!result.ok) {
        switch (result.error.kind) {
          case "not_in_protect_tier":
            this.out.error(`${result.error.path} is not in the protect tier.`);
            return 1;
          case "create_failed":
            this.out.error(`Failed to create ${result.error.path}: ${result.error.message}`);
            return 1;
        }
      }

      if (result.value.alreadyExisted) {
        this.out.warn(`  · ${path} (already exists — staging copy was created automatically)`);
        continue;
      }

      this.out.success(`  + ${path} → ${stagingPath(path)}`);
      created++;
    }

    if (created === 0) {
      this.out.info("Nothing to create.");
    } else {
      this.out.write("");
      this.out.success(`Created ${created} staging ${created === 1 ? "entry" : "entries"}.`);
    }
    return 0;
  }
}
