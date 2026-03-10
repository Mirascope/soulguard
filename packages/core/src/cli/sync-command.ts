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

    const { beforeIssues, errors, git } = result.value;

    this.out.heading(`Soulguard Sync — ${this.opts.ops.workspace}`);
    this.out.write("");

    if (beforeIssues.length === 0 && errors.length === 0) {
      this.out.success("Nothing to fix — all files ok.");
      this.reportGit(git);
      return 0;
    }

    // Show fixed drift issues
    const drifted = beforeIssues.filter((f) => f.status === "drifted");
    const fixed = drifted;

    if (fixed.length > 0 && errors.length === 0) {
      this.out.heading("Fixed:");
      for (const f of fixed) {
        this.out.success(`  🔧 ${f.path}`);
        if (f.issues) {
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
      return 1;
    }

    // Check for unfixable issues (missing files)
    const remaining = beforeIssues.filter((f) => f.status === "missing");
    if (remaining.length > 0) {
      for (const f of remaining) {
        this.out.error(`  ❌ ${f.path} — missing`);
      }
      this.out.write("");
      this.reportGit(git);
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
