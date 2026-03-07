/**
 * CLI command: soulguard init
 */

import type { ConsoleOutput } from "../util/console.js";
import type { InitOptions, InitResult, InitError } from "../sdk/init.js";
import type { Result } from "../util/types.js";
import { init } from "../sdk/init.js";

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
          this.out.error("soulguard init requires sudo. Run with: sudo soulguard init");
          break;
        case "config_invalid":
          this.out.error(`Invalid soulguard.json: ${e.message}`);
          this.out.error("Fix or remove soulguard.json and re-run `sudo soulguard init`.");
          break;
        case "registry_invalid":
          this.out.error(`Invalid registry: ${e.message}`);
          this.out.error(
            "Fix or remove .soulguard/registry.json and re-run `sudo soulguard init`.",
          );
          break;
        case "system_error":
          this.out.error(`Init failed: ${e.message}`);
          break;
      }
      return 1;
    }

    this.out.success("✓ Soulguard initialized.");

    if (result.value.issueCount > 0) {
      this.out.warn(
        `${result.value.issueCount} file(s) need protection. Run \`sudo soulguard sync\` to enforce.`,
      );
    }

    return 0;
  }
}
