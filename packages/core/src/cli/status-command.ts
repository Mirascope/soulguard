/**
 * StatusCommand — pretty-prints the result of `status()`.
 * Shows drifted entities and staged changes. Unchanged files are hidden.
 */

import type { ConsoleOutput } from "../util/console.js";
import type { StatusOptions } from "../sdk/status.js";
import { status } from "../sdk/status.js";
import type { Drift } from "../sdk/state.js";
import type { FileStatus } from "../sdk/state.js";
import { formatIssue } from "../util/types.js";
import type { SystemOperations } from "../util/system-ops.js";

const STAGED_LABELS: Record<FileStatus, string> = {
  modified: "staged",
  created: "staged (new)",
  deleted: "staged (delete)",
  unchanged: "unchanged",
};

export type StatusCommandOptions = StatusOptions & {
  ops: SystemOperations;
};

export class StatusCommand {
  constructor(
    private opts: StatusCommandOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const result = await status({ tree: this.opts.tree });
    if (!result.ok) return 1;

    const { changed, drifts } = result.value;

    this.out.heading(`Soulguard Status — ${this.opts.ops.workspace}`);
    this.out.write("");

    // Show drifts
    for (const drift of drifts) {
      this.out.warn(`  ⚠️  ${drift.entity.path} (${drift.entity.configTier})`);
      for (const issue of drift.details) {
        this.out.warn(`      ${formatIssue(issue)}`);
      }
    }

    // Show staged changes
    for (const file of changed) {
      this.out.info(`  ${STAGED_LABELS[file.status]} ${file.path}`);
    }

    if (drifts.length === 0 && changed.length === 0) {
      this.out.success("All files ok.");
    }

    this.out.write("");

    if (drifts.length > 0) {
      this.out.info(`${drifts.length} drifted`);
      return 1;
    }

    return 0;
  }
}
