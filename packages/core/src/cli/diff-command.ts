/**
 * DiffCommand — pretty-prints the result of `diff()`.
 */

import type { ConsoleOutput } from "../console.js";
import type { DiffOptions } from "../diff.js";
import { diff } from "../diff.js";

export class DiffCommand {
  constructor(
    private options: DiffOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const result = await diff(this.options);

    if (!result.ok) {
      switch (result.error.kind) {
        case "no_staging":
          this.out.error("No staging directory found. Run `soulguard init` first.");
          return 1;
        case "no_config":
          this.out.error("No soulguard.json found.");
          return 1;
        case "read_failed":
          this.out.error(`Failed to read ${result.error.path}: ${result.error.message}`);
          return 1;
      }
    }

    const { files, hasChanges } = result.value;

    this.out.heading(`Soulguard Diff — ${this.options.ops.workspace}`);
    this.out.write("");

    let changeCount = 0;

    for (const file of files) {
      switch (file.status) {
        case "unchanged":
          this.out.info(`  ✅ ${file.path} (no changes)`);
          break;
        case "modified":
          changeCount++;
          this.out.warn(`  📝 ${file.path}`);
          if (file.diff) {
            for (const line of file.diff.split("\n")) {
              this.out.write(`      ${line}`);
            }
          }
          break;
        case "staging_missing":
          changeCount++;
          this.out.warn(`  ⚠️ ${file.path} (no staging copy)`);
          break;
        case "vault_missing":
          changeCount++;
          this.out.warn(`  ⚠️ ${file.path} (vault file missing — new file)`);
          break;
        case "deleted":
          changeCount++;
          this.out.warn(`  🗑️ ${file.path} (staged for deletion)`);
          break;
      }
    }

    this.out.write("");
    if (hasChanges) {
      this.out.info(`${changeCount} file(s) changed`);
      if (result.value.approvalHash) {
        this.out.info(`Approval hash: ${result.value.approvalHash}`);
      }
    } else {
      this.out.info("No changes");
    }

    // Exit 1 = differences found (matching `git diff` convention), not an error.
    return hasChanges ? 1 : 0;
  }
}
