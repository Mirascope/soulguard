/**
 * ResetCommand — manage staging tree (dry run, selective, or full reset).
 */

import type { ConsoleOutput } from "../console.js";
import type { ResetOptions } from "../reset.js";
import { reset } from "../reset.js";
import { STAGING_DIR } from "../staging.js";

export class ResetCommand {
  constructor(
    private opts: ResetOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const result = await reset(this.opts);

    if (!result.ok) {
      this.out.error(`Reset failed: ${result.error.message}`);
      return 1;
    }

    const { stagedFiles, deleted } = result.value;

    if (stagedFiles.length === 0) {
      this.out.info("Nothing staged — staging tree is clean.");
      return 0;
    }

    if (!deleted) {
      // Dry run
      this.out.write("Staged changes:");
      for (const f of stagedFiles) {
        this.out.write(`  ${STAGING_DIR}/${f}`);
      }
      this.out.write("");
      this.out.write("Use --all to reset everything, or specify paths to reset.");
      return 0;
    }

    // Actual deletion happened
    this.out.success(`Reset ${stagedFiles.length} staged file(s):`);
    for (const f of stagedFiles) {
      this.out.write(`  ${STAGING_DIR}/${f}`);
    }
    return 0;
  }
}
