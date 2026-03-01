/**
 * StatusCommand — pretty-prints the result of `status()`.
 */

import type { ConsoleOutput } from "../console.js";
import type { StatusOptions, FileStatus } from "../status.js";
import { status } from "../status.js";
import { formatIssue } from "../types.js";

export class StatusCommand {
  constructor(
    private opts: StatusOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const result = await status(this.opts);
    if (!result.ok) return 1;

    const { protect, watch, issues } = result.value;

    this.out.heading(`Soulguard Status — ${this.opts.ops.workspace}`);
    this.out.write("");

    if (protect.length > 0) {
      this.out.heading("Protect");
      for (const f of protect) {
        this.printFile(f);
      }
      this.out.write("");
    }

    if (watch.length > 0) {
      this.out.heading("Watch");
      for (const f of watch) {
        this.printFile(f);
      }
      this.out.write("");
    }

    const counts = this.summarize([...protect, ...watch]);
    this.out.info(`${counts.ok} files ok, ${counts.drifted} drifted, ${counts.missing} missing`);

    return issues.length > 0 ? 1 : 0;
  }

  private printFile(f: FileStatus): void {
    switch (f.status) {
      case "ok":
        this.out.success(`  ✅ ${f.file.path}`);
        break;
      case "drifted":
        this.out.warn(`  ⚠️  ${f.file.path}`);
        for (const issue of f.issues) {
          this.out.warn(`      ${formatIssue(issue)}`);
        }
        break;
      case "missing":
        this.out.error(`  ❌ ${f.path}`);
        break;
      case "error":
        this.out.error(`  ❌ ${f.path} (${f.error.kind})`);
        break;
    }
  }

  private summarize(files: FileStatus[]): { ok: number; drifted: number; missing: number } {
    let okCount = 0;
    let drifted = 0;
    let missing = 0;
    for (const f of files) {
      if (f.status === "ok") okCount++;
      else if (f.status === "drifted") drifted++;
      else if (f.status === "missing") missing++;
    }
    return { ok: okCount, drifted, missing };
  }
}
