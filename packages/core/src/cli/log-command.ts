/**
 * CLI command: soulguard log [file]
 *
 * Shows git log from soulguard's internal git repo.
 * When a file is specified, shows only commits touching that file.
 */

import type { ConsoleOutput } from "../util/console.js";
import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig } from "../util/types.js";
import { gitLog } from "../util/git.js";

export type LogCommandOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  file?: string;
};

export class LogCommand {
  constructor(
    private opts: LogCommandOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const result = await gitLog(this.opts.ops, this.opts.config, this.opts.file);
    if (!result.ok) {
      this.out.error(result.error.message);
      return 1;
    }

    if (result.value === "") {
      this.out.info("No commits yet.");
      return 0;
    }

    this.out.write(result.value);
    return 0;
  }
}
