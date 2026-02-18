/**
 * SyncCommand — runs sync and pretty-prints results.
 */

import type { ConsoleOutput } from "../console.js";
import type { SyncOptions } from "../sync.js";
import { sync } from "../sync.js";
import { formatIssue } from "../types.js";
import type { FileStatus } from "../status.js";

export class SyncCommand {
  constructor(
    private opts: SyncOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const result = await sync(this.opts);
    if (!result.ok) return 1;

    const { before, after, errors } = result.value;

    this.out.heading(`Soulguard Sync — ${this.opts.ops.workspace}`);
    this.out.write("");

    // Show what was drifted before
    const driftedBefore = before.issues.filter((f) => f.status === "drifted");
    if (before.issues.length === 0 && errors.length === 0) {
      this.out.success("Nothing to fix — all files ok.");
      return 0;
    }

    if (driftedBefore.length > 0) {
      this.out.heading("Fixes applied:");
      for (const f of driftedBefore) {
        if (f.status === "drifted") {
          this.out.write(`  🔧 ${f.file.path}`);
          for (const issue of f.issues) {
            this.out.info(`      ${formatIssue(issue)}`);
          }
        }
      }
      this.out.write("");
    }

    // Show errors
    if (errors.length > 0) {
      this.out.heading("Errors:");
      for (const e of errors) {
        this.out.error(`  ❌ ${e.path}: ${e.operation} failed (${e.error.kind})`);
      }
      this.out.write("");
    }

    // Show after state summary
    const afterIssues = after.issues;
    if (afterIssues.length === 0) {
      this.out.success("All files now ok.");
      return 0;
    }

    this.out.warn(`${afterIssues.length} issue(s) remaining after sync.`);
    for (const f of afterIssues) {
      this.printFile(f);
    }

    return 1;
  }

  private printFile(f: FileStatus): void {
    switch (f.status) {
      case "drifted":
        this.out.warn(`  ⚠️  ${f.file.path}`);
        break;
      case "missing":
        this.out.error(`  ❌ ${f.path}`);
        break;
      case "error":
        this.out.error(`  ❌ ${f.path} (${f.error.kind})`);
        break;
    }
  }
}
