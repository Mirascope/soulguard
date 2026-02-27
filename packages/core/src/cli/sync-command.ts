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

    const { before, after, errors, git } = result.value;

    this.out.heading(`Soulguard Sync — ${this.opts.ops.workspace}`);
    this.out.write("");

    if (before.issues.length === 0 && errors.length === 0) {
      this.out.success("Nothing to fix — all files ok.");
      this.reportGit(git);
      return 0;
    }

    // Show what was actually fixed (in before.issues but not in after.issues)
    const afterPaths = new Set(after.issues.map((f) => this.issuePath(f)));
    const fixed = before.issues.filter((f) => !afterPaths.has(this.issuePath(f)));

    if (fixed.length > 0) {
      this.out.heading("Fixed:");
      for (const f of fixed) {
        this.out.success(`  🔧 ${this.issuePath(f)}`);
        if (f.status === "drifted") {
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

    // Show remaining issues
    if (after.issues.length === 0) {
      this.out.success("All files now ok.");
      this.reportGit(git);
      return 0;
    }

    this.out.warn(`${after.issues.length} issue(s) remaining after sync:`);
    for (const f of after.issues) {
      this.printFile(f);
    }

    return 1;
  }

  private reportGit(git?: GitCommitResult): void {
    if (git?.committed) {
      this.out.success(`  📝 Committed ${git.files.length} file(s) to git`);
    }
  }

  private issuePath(f: FileStatus): string {
    switch (f.status) {
      case "ok":
        return f.file.path;
      case "drifted":
        return f.file.path;
      case "missing":
      case "error":
        return f.path;
    }
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
