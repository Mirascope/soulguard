/**
 * StatusCommand — pretty-prints the result of `status()`.
 * Shows all files with their protection state + staged change indicators.
 */

import type { ConsoleOutput } from "../util/console.js";
import type { StatusOptions, FileStatus } from "../sdk/status.js";
import { status } from "../sdk/status.js";
import { formatIssue } from "../util/types.js";

export class StatusCommand {
  constructor(
    private opts: StatusOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const result = await status(this.opts);
    if (!result.ok) return 1;

    const { files, issues } = result.value;

    this.out.heading(`Soulguard Status — ${this.opts.ops.workspace}`);
    this.out.write("");

    // Show all files
    for (const f of files) {
      this.printFile(f);
    }

    this.out.write("");

    // Exit code: only file-level issues (drifted/missing/error) cause failure
    const fileIssues = issues.filter((f) => ["drifted", "missing", "error"].includes(f.status));

    if (fileIssues.length === 0) {
      this.out.success("All files ok.");
      return 0;
    }

    const drifted = fileIssues.filter((f) => f.status === "drifted").length;
    const missing = fileIssues.filter((f) => f.status === "missing").length;
    this.out.info(`${drifted} drifted, ${missing} missing`);

    return 1;
  }

  private printFile(f: FileStatus): void {
    switch (f.status) {
      case "ok": {
        const staged = f.stagedChanges
          ? `, ${f.stagedChanges} staged change${f.stagedChanges > 1 ? "s" : ""}`
          : "";
        this.out.success(`  ✓ ${f.path} (${f.tier}, ok${staged})`);
        break;
      }
      case "drifted": {
        const staged = f.stagedChanges
          ? `, ${f.stagedChanges} staged change${f.stagedChanges > 1 ? "s" : ""}`
          : "";
        this.out.warn(`  ⚠️  ${f.path} (${f.tier}${staged})`);
        for (const issue of f.issues) {
          this.out.warn(`      ${formatIssue(issue)}`);
        }
        break;
      }
      case "missing":
        this.out.error(`  ❌ ${f.path} (${f.tier}, missing)`);
        break;
      case "error":
        this.out.error(`  ❌ ${f.path} (${f.error.kind})`);
        break;
    }
  }
}
