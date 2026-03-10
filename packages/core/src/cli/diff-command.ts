/**
 * DiffCommand — pretty-prints the result of `diff()`.
 */

import type { ConsoleOutput } from "../util/console.js";
import type { DiffOptions } from "../sdk/diff.js";
import { diff } from "../sdk/diff.js";

export class DiffCommand {
  constructor(
    private options: DiffOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const result = await diff(this.options);

    if (!result.ok) {
      this.out.error(`Failed: ${result.error.message}`);
      return 1;
    }

    const { files, hasChanges } = result.value;

    this.out.heading(`Soulguard Diff — ${this.options.ops.workspace}`);
    this.out.write("");

    for (const entry of files) {
      switch (entry.file.status) {
        case "modified":
          this.out.warn(`  📝 ${entry.file.path}`);
          break;
        case "created":
          this.out.warn(`  ⚠️ ${entry.file.path} (new file)`);
          break;
        case "deleted":
          this.out.warn(`  🗑️ ${entry.file.path} (staged for deletion)`);
          break;
      }
      for (const line of entry.diff.split("\n")) {
        this.out.write(`      ${line}`);
      }
    }

    this.out.write("");
    if (hasChanges) {
      this.out.info(`${files.length} file(s) changed`);
      if (result.value.approvalHash) {
        this.out.info(`Apply hash: ${result.value.approvalHash}`);
      }
    } else {
      this.out.info("No changes");
    }

    // Exit 1 = differences found (matching `git diff` convention), not an error.
    return hasChanges ? 1 : 0;
  }
}
