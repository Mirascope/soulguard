/**
 * ApproveCommand — approve and apply staging changes to vault.
 *
 * Two modes:
 * - `--hash <hash>`: Non-interactive, verifies hash and applies.
 * - No args: Interactive — shows diff, prompts for confirmation, then applies.
 */

import type { ConsoleOutput } from "../console.js";
import type { ApproveOptions } from "../approve.js";
import { approve } from "../approve.js";
import { diff } from "../diff.js";

export type ApproveCommandOptions = Omit<ApproveOptions, "hash"> & {
  /** Pre-computed hash for non-interactive mode */
  hash?: string;
  /** Prompt function for interactive mode (returns true if user confirms) */
  prompt?: () => Promise<boolean>;
};

export class ApproveCommand {
  constructor(
    private opts: ApproveCommandOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    let hash = this.opts.hash;

    // Interactive mode: show diff, compute hash, prompt
    if (!hash) {
      const diffResult = await diff({ ops: this.opts.ops, config: this.opts.config });
      if (!diffResult.ok) {
        this.out.error(`Diff failed: ${diffResult.error.kind}`);
        return 1;
      }
      if (!diffResult.value.hasChanges) {
        this.out.info("No changes to approve — staging matches vault.");
        return 0;
      }

      // Show diff
      this.out.heading(`Soulguard Approve — ${this.opts.ops.workspace}`);
      this.out.write("");
      for (const file of diffResult.value.files) {
        if (file.status === "modified" && file.diff) {
          this.out.write(file.diff);
        }
      }
      this.out.write("");
      this.out.info(`Approval hash: ${diffResult.value.approvalHash}`);
      this.out.write("");

      // Prompt
      if (this.opts.prompt) {
        const confirmed = await this.opts.prompt();
        if (!confirmed) {
          this.out.info("Cancelled.");
          return 0;
        }
      }

      hash = diffResult.value.approvalHash!;
    }

    const result = await approve({ ...this.opts, hash });

    if (!result.ok) {
      switch (result.error.kind) {
        case "no_changes":
          this.out.info("No changes to approve — staging matches vault.");
          return 0;
        case "hash_mismatch":
          this.out.error(result.error.message);
          this.out.info("Please run `soulguard diff` again and re-review.");
          return 1;
        case "self_protection":
          this.out.error(`Self-protection: ${result.error.message}`);
          return 1;
        case "policy_violation":
          this.out.error("Blocked by policy:");
          for (const v of result.error.violations) {
            this.out.error(`  ✗ ${v.policy}: ${v.message}`);
          }
          return 1;
        case "policy_name_collision":
          this.out.error(`Duplicate policy names: ${result.error.duplicates.join(", ")}`);
          return 1;
        case "apply_failed":
          this.out.error(`Apply failed: ${result.error.message}`);
          return 1;
        case "diff_failed":
          this.out.error(`Diff failed: ${result.error.message}`);
          return 1;
      }
    }

    this.out.write("");
    this.out.success(`Approved ${result.value.appliedFiles.length} file(s):`);
    for (const file of result.value.appliedFiles) {
      this.out.success(`  ✅ ${file}`);
    }
    this.out.write("");
    this.out.info("Vault updated. Staging synced.");
    return 0;
  }
}
