/**
 * CLI command: soulguard init
 */

import type { ConsoleOutput } from "../console.js";
import type { InitOptions, InitResult, InitError } from "../init.js";
import type { Result } from "../types.js";
import { init } from "../init.js";

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
        case "group_creation_failed":
          this.out.error(`Failed to create group: ${e.message}`);
          break;
        case "user_creation_failed":
          this.out.error(`Failed to create user: ${e.message}`);
          break;
        case "config_write_failed":
          this.out.error(`Failed to write config: ${e.message}`);
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
        case "staging_failed":
          this.out.error(`Failed to create staging: ${e.message}`);
          break;
        case "git_failed":
          this.out.error(`Failed to initialize git: ${e.message}`);
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
    if (r.registryCreated) steps.push("Initialized registry");
    if (r.gitInitialized) steps.push("Initialized git");

    if (steps.length > 0) {
      for (const step of steps) {
        this.out.success(`  ${step}`);
      }
    }

    if (steps.length === 0) {
      this.out.info("Already initialized — nothing to do.");
    } else {
      this.out.success("\n✓ Soulguard initialized.");
    }

    if (r.issueCount > 0) {
      this.out.warn(
        `\n${r.issueCount} file(s) need protection. Run \`sudo soulguard sync\` to enforce.`,
      );
    }

    return 0;
  }
}
