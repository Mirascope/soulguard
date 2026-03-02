/**
 * CLI command: soulguard init
 */

import type { ConsoleOutput } from "../console.js";
import type { InitOptions, InitResult, InitError } from "../init.js";
import type { Result } from "../types.js";
import { init } from "../init.js";

export type InitCommandOptions = {
  initOptions: InitOptions;
  out: ConsoleOutput;
};

export class InitCommand {
  constructor(
    private options: InitOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const result: Result<InitResult, InitError> = await init(this.options);

    if (!result.ok) {
      const e = result.error;
      switch (e.kind) {
        case "not_root":
          this.out.error("soulguard init requires root. Run with sudo.");
          break;
        case "group_creation_failed":
          this.out.error(`Failed to create group: ${e.message}`);
          break;
        case "user_creation_failed":
          this.out.error(`Failed to create user: ${e.message}`);
          break;
        case "config_write_failed":
          this.out.error(`Failed to write config: ${e.message}`);
          break;
        case "sudoers_write_failed":
          this.out.error(`Failed to write sudoers: ${e.message}`);
          break;
        case "staging_failed":
          this.out.error(`Failed to create staging: ${e.message}`);
          break;
      }
      return 1;
    }

    const r = result.value;
    this.out.heading(`Soulguard Init — ${this.options.ops.workspace}`);

    const steps: string[] = [];
    if (r.groupCreated) steps.push("Created group: soulguard");
    if (r.userCreated) steps.push("Created user: soulguardian");
    if (r.configCreated) steps.push("Wrote soulguard.json");
    if (r.sudoersCreated) steps.push("Wrote /etc/sudoers.d/soulguard");
    if (r.stagingCreated) steps.push("Created staging siblings");
    if (steps.length > 0) {
      for (const step of steps) {
        this.out.success(`  ${step}`);
      }
    }

    // Report sync results — count unique files (a file can be both unregistered + drifted)
    const syncedPaths = new Set(
      r.syncResult.before.issues
        .filter((i) => i.status === "drifted" || i.status === "unregistered")
        .map((i) => ("file" in i ? i.file.path : i.path)),
    );
    if (syncedPaths.size > 0) {
      this.out.success(`  Synced ${syncedPaths.size} protect-tier file(s)`);
    }

    if (r.syncResult.errors.length > 0) {
      this.out.warn(`  ${r.syncResult.errors.length} error(s) during sync`);
    }

    if (steps.length === 0 && syncedPaths.size === 0) {
      this.out.info("Already initialized — nothing to do.");
    } else {
      this.out.success("\nDone.");
    }

    return r.syncResult.errors.length > 0 ? 1 : 0;
  }
}
