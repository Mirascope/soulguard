/**
 * SyncCommand — runs sync and pretty-prints results.
 */

import type { ConsoleOutput } from "../console.js";
import type { SyncOptions } from "../sync.js";
import { sync } from "../sync.js";
import { formatIssue } from "../types.js";
import type { FileStatus } from "../status.js";
import type { GitCommitResult } from "../git.js";

export class SyncCommand {
  constructor(
    private opts: SyncOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const result = await sync(this.opts);
    if (!result.ok) return 1;

    const { before, errors, released, git } = result.value;

    // Filter to user-visible issues (not registry-internal)
    const fileIssues = before.issues.filter(
      (f): f is FileStatus & { status: "drifted" | "missing" | "error" | "orphaned" } =>
        ["drifted", "missing", "error", "orphaned"].includes(f.status),
    );

    this.out.heading(`Soulguard Sync — ${this.opts.ops.workspace}`);
    this.out.write("");

    // Show released files
    if (released.length > 0) {
      this.out.heading("Released:");
      for (const f of released) {
        this.out.info(`  🔓 ${f} (released)`);
      }
      this.out.write("");
    }

    if (fileIssues.length === 0 && errors.length === 0 && released.length === 0) {
      this.out.success("Nothing to fix — all files ok.");
      this.reportGit(git);
      return 0;
    }

    // Show fixed drift issues (had errors before, no errors after means fixed)
    const drifted = fileIssues.filter((f) => f.status === "drifted");
    const releasedSet = new Set(released);
    const fixed = drifted.filter((f) => !releasedSet.has(f.file.path));

    if (fixed.length > 0 && errors.length === 0) {
      this.out.heading("Fixed:");
      for (const f of fixed) {
        this.out.success(`  🔧 ${f.file.path}`);
        for (const issue of f.issues) {
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

    // Check for unfixable issues (missing files, errors)
    const remaining = fileIssues.filter((f) => f.status === "missing" || f.status === "error");
    if (remaining.length > 0) {
      for (const f of remaining) {
        if (f.status === "missing") this.out.error(`  ❌ ${f.path} — missing`);
        else if (f.status === "error") this.out.error(`  ❌ ${f.path} — ${f.error.kind}`);
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
