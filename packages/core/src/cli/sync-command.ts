/**
 * SyncCommand — runs sync and pretty-prints results.
 */

import type { ConsoleOutput } from "../util/console.js";
import type { SyncOptions } from "../sdk/sync.js";
import { sync } from "../sdk/sync.js";
import { formatIssue } from "../util/types.js";
import type { GitCommitResult } from "../util/git.js";

export class SyncCommand {
  constructor(
    private opts: SyncOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const result = await sync(this.opts);
    if (!result.ok) return 1;

    const { drifts, errors, git } = result.value;

    this.out.heading(`Soulguard Sync — ${this.opts.ops.workspace}`);
    this.out.write("");

    if (drifts.length === 0 && errors.length === 0) {
      this.out.success("Nothing to fix — all files ok.");
      this.reportGit(git);
      return 0;
    }

    // Show fixed drift issues
    if (drifts.length > 0 && errors.length === 0) {
      this.out.heading("Fixed:");
      for (const d of drifts) {
        this.out.success(`  🔧 ${d.entity.path}`);
        for (const issue of d.details) {
          this.out.info(`      ${formatIssue(issue)}`);
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
      return 1;
    }

    this.out.success("All files now ok.");
    this.reportGit(git);
    return 0;
  }

  private reportGit(git?: GitCommitResult): void {
    if (git?.committed) {
      this.out.success(`  📝 Committed ${git.files.length} file(s) to git`);
    }
  }
}
