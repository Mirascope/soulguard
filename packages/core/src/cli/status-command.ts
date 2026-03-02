/**
 * StatusCommand — pretty-prints the result of `status()`.
 * Like `git status` — only shows problems, not clean files.
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

    const { issues } = result.value;

    this.out.heading(`Soulguard Status — ${this.opts.ops.workspace}`);
    this.out.write("");

    // Filter to user-visible issues (not registry-internal)
    const fileIssues = issues.filter((f) => !["unregistered", "tier_changed"].includes(f.status));

    if (fileIssues.length === 0) {
      this.out.success("All files ok.");
      return 0;
    }

    for (const f of fileIssues) {
      this.printFile(f);
    }
    this.out.write("");

    const drifted = fileIssues.filter((f) => f.status === "drifted").length;
    const missing = fileIssues.filter((f) => f.status === "missing").length;
    this.out.info(`${drifted} drifted, ${missing} missing`);

    return 1;
  }

  private printFile(f: FileStatus): void {
    switch (f.status) {
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
      case "unregistered":
        this.out.info(`  📋 ${f.path} (not yet registered)`);
        break;
      case "tier_changed":
        this.out.info(`  🔄 ${f.path} (tier changed: ${f.registryTier} → ${f.tier})`);
        break;
      case "orphaned":
        this.out.warn(`  🔓 ${f.path} (orphaned, was ${f.registryTier})`);
        break;
    }
  }
}
