/**
 * RejectCommand — reject the active proposal and reset staging.
 */

import type { ConsoleOutput } from "../console.js";
import type { RejectOptions } from "../reject.js";
import { reject } from "../reject.js";

export class RejectCommand {
  constructor(
    private opts: RejectOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const result = await reject(this.opts);

    if (!result.ok) {
      switch (result.error.kind) {
        case "no_proposal":
          this.out.error("No active proposal to reject.");
          return 1;
        case "wrong_password":
          this.out.error("Incorrect password.");
          return 1;
        case "stale_proposal":
          this.out.error(`Error: ${result.error.message}`);
          return 1;
        case "apply_failed":
          this.out.error(`Error: ${result.error.message}`);
          return 1;
      }
    }

    this.out.heading(`Soulguard Reject — ${this.opts.ops.workspace}`);
    this.out.write("");
    this.out.success(`Rejected proposal. Reset ${result.value.resetFiles.length} staging file(s):`);
    for (const file of result.value.resetFiles) {
      this.out.info(`  ↩️  ${file}`);
    }
    return 0;
  }
}
