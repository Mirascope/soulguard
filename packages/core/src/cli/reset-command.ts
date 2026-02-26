/**
 * ResetCommand — reset staging to match vault (discard changes).
 */

import type { ConsoleOutput } from "../console.js";
import type { ResetOptions } from "../reset.js";
import { reset } from "../reset.js";

export class ResetCommand {
  constructor(
    private opts: ResetOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const result = await reset(this.opts);

    if (!result.ok) {
      switch (result.error.kind) {
        case "no_changes":
          this.out.info("No changes to reset — staging already matches vault.");
          return 0;
        case "reset_failed":
          this.out.error(`Reset failed: ${result.error.message}`);
          return 1;
      }
    }

    this.out.heading(`Soulguard Reset — ${this.opts.ops.workspace}`);
    this.out.write("");
    this.out.success(`Reset ${result.value.resetFiles.length} staging file(s):`);
    for (const file of result.value.resetFiles) {
      this.out.info(`  ↩️  ${file}`);
    }
    return 0;
  }
}
