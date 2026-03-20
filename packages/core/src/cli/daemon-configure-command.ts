/**
 * CLI command: soulguard daemon configure
 *
 * Updates daemon-related fields in soulguard.json.
 * Requires sudo (file is mode 444, owned by guardian).
 */

import type { ConsoleOutput } from "../util/console.js";
import type { SystemOperations } from "../util/system-ops.js";
import { readConfig, writeConfig } from "../sdk/config.js";

export type DaemonConfigureOptions = {
  ops: SystemOperations;
  syncInterval?: number;
  channel?: string;
};

export class DaemonConfigureCommand {
  constructor(
    private options: DaemonConfigureOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const { ops, syncInterval, channel } = this.options;

    const configResult = await readConfig(ops);
    if (!configResult.ok) {
      this.out.error(
        configResult.error.kind === "not_found"
          ? "No soulguard.json found. Run `soulguard init` first."
          : `Failed to read config: ${configResult.error.message}`,
      );
      return 1;
    }

    const config = configResult.value;
    if (!config.daemon) config.daemon = {};

    if (syncInterval != null) config.daemon.syncIntervalSecs = syncInterval;
    if (channel != null) config.daemon.channel = channel;

    const writeResult = await writeConfig(ops, config);
    if (!writeResult.ok) {
      this.out.error(`Failed to write config: ${writeResult.error.message}`);
      return 1;
    }

    this.out.success("Daemon configuration updated.");
    return 0;
  }
}
