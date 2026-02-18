/**
 * ProposeCommand — create a vault change proposal from staging.
 */

import type { ConsoleOutput } from "../console.js";
import type { ProposeOptions } from "../propose.js";
import { propose } from "../propose.js";

export class ProposeCommand {
  constructor(
    private opts: ProposeOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const result = await propose(this.opts);

    if (!result.ok) {
      switch (result.error.kind) {
        case "no_staging":
          this.out.error(result.error.message);
          return 1;
        case "no_changes":
          this.out.info("No changes to propose — staging matches vault.");
          return 0;
        case "proposal_exists":
          this.out.error("An active proposal already exists. Approve, reject, or delete it first.");
          return 1;
        case "write_failed":
          this.out.error(result.error.message);
          return 1;
      }
    }

    const { proposal, changedCount } = result.value;

    this.out.heading(`Soulguard Propose — ${this.opts.ops.workspace}`);
    this.out.write("");
    this.out.success(`Created proposal with ${changedCount} file(s):`);
    for (const file of proposal.files) {
      this.out.info(`  📝 ${file.path}`);
    }
    if (proposal.message) {
      this.out.write(`\nMessage: ${proposal.message}`);
    }
    this.out.write("");
    this.out.info("Run `soulguard diff` to review, `soulguard approve` to apply.");
    return 0;
  }
}
