/**
 * ApproveCommand — approve and apply the active proposal.
 */

import type { ConsoleOutput } from "../console.js";
import type { ApproveOptions } from "../approve.js";
import { approve } from "../approve.js";

export class ApproveCommand {
  constructor(
    private opts: ApproveOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const result = await approve(this.opts);

    if (!result.ok) {
      switch (result.error.kind) {
        case "no_proposal":
          this.out.error("No active proposal to approve.");
          return 1;
        case "wrong_password":
          this.out.error("Incorrect password.");
          return 1;
        case "stale_proposal":
          this.out.error(`Stale proposal: ${result.error.message}`);
          return 1;
        case "apply_failed":
          this.out.error(`Apply failed: ${result.error.message}`);
          return 1;
      }
    }

    this.out.heading(`Soulguard Approve — ${this.opts.ops.workspace}`);
    this.out.write("");
    this.out.success(`Approved ${result.value.appliedFiles.length} file(s):`);
    for (const file of result.value.appliedFiles) {
      this.out.success(`  ✅ ${file}`);
    }
    this.out.write("");
    this.out.info("Vault updated. Staging synced.");
    return 0;
  }
}
