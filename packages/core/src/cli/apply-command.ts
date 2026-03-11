/**
 * ApplyCommand — approve and apply staging changes to protected files.
 *
 * Three modes:
 * - No args: Interactive — shows diff, prompts for confirmation, then applies.
 * - `-y` / `--yes`: Non-interactive — applies current staging state without hash verification.
 * - `--hash <hash>`: Cryptographic verification — verifies hash and applies.
 */

import type { ConsoleOutput } from "../util/console.js";
import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig } from "../util/types.js";
import type { Policy } from "../sdk/policy.js";
import { apply } from "../sdk/apply.js";
import { diff } from "../sdk/diff.js";
import { StateTree } from "../sdk/state.js";

export type ApplyCommandOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  policies?: Policy[];
  /** Pre-computed hash for cryptographic verification mode */
  hash?: string;
  /** Skip hash verification (--yes mode) */
  skipHashVerification?: boolean;
  /** Prompt function for interactive mode (returns true if user confirms) */
  prompt?: () => Promise<boolean>;
};

export class ApplyCommand {
  constructor(
    private opts: ApplyCommandOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    let hash = this.opts.hash;

    // --yes mode: skip hash verification entirely
    if (this.opts.skipHashVerification) {
      if (hash) {
        this.out.error("Cannot use both --yes and --hash flags");
        return 1;
      }
      // Apply without hash verification
      hash = undefined;
    } else if (!hash) {
      // Interactive mode: show diff, compute hash, prompt
      const diffResult = await diff({
        ops: this.opts.ops,
        config: this.opts.config,
      });
      if (!diffResult.ok) {
        this.out.error(`Diff failed: ${diffResult.error.message}`);
        return 1;
      }
      if (!diffResult.value.hasChanges) {
        this.out.info("No changes to apply — staging matches protected files.");
        return 0;
      }

      // Show diff
      this.out.heading(`Soulguard Apply — ${this.opts.ops.workspace}`);
      this.out.write("");
      for (const entry of diffResult.value.files) {
        this.out.write(entry.diff);
      }
      this.out.write("");
      this.out.info(`Apply hash: ${diffResult.value.approvalHash}`);
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

    // Build StateTree for apply
    const treeResult = await StateTree.build({
      ops: this.opts.ops,
      config: this.opts.config,
    });
    if (!treeResult.ok) {
      this.out.error(`State tree build failed: ${treeResult.error.message}`);
      return 1;
    }

    const result = await apply({
      ops: this.opts.ops,
      tree: treeResult.value,
      hash,
      policies: this.opts.policies,
    });

    if (!result.ok) {
      switch (result.error.kind) {
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
      }
    }

    this.out.write("");
    this.out.success(`Applied ${result.value.appliedFiles.length} file(s):`);
    for (const file of result.value.appliedFiles) {
      this.out.success(`  ✅ ${file}`);
    }
    this.out.write("");
    this.out.info("Protected files updated. Staging synced.");
    return 0;
  }
}
