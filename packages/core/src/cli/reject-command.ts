/**
 * RejectCommand — reset staging to match vault (discard changes).
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
        case "no_changes":
          this.out.info("No changes to reject — staging already matches vault.");
          return 0;
        case "wrong_password":
          this.out.error("Incorrect password.");
          return 1;
        case "reset_failed":
          this.out.error(`Reset failed: ${result.error.message}`);
          return 1;
      }
    }

    this.out.heading(`Soulguard Reject — ${this.opts.ops.workspace}`);
    this.out.write("");
    this.out.success(`Rejected. Reset ${result.value.resetFiles.length} staging file(s):`);
    for (const file of result.value.resetFiles) {
      this.out.info(`  ↩️  ${file}`);
    }
    return 0;
  }
}
