/**
 * soulguard reset — reset staging copies to match protect-tier originals.
 *
 * With implicit proposals, reset simply resets staging to match protect-tier.
 * Staging IS the proposal — resetting it discards all pending changes.
 */

import type { SystemOperations } from "./system-ops.js";
import type { FileOwnership, SoulguardConfig, Result } from "./types.js";
import { diff } from "./diff.js";
import { stagingPath } from "./staging.js";
import { ok, err } from "./result.js";

export type ResetOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  /** Ownership to apply to reset staging files (agent-writable) */
  stagingOwnership?: FileOwnership;
};

export type ResetResult = {
  /** Files whose staging copies were reset */
  resetFiles: string[];
};

export type ResetError = { kind: "reset_failed"; message: string };

/**
 * Reset staging changes to match protect-tier.
 */
export async function reset(options: ResetOptions): Promise<Result<ResetResult, ResetError>> {
  const { ops, config, stagingOwnership } = options;

  // Compute current diff to find what needs resetting
  const diffResult = await diff({ ops, config });
  if (!diffResult.ok) {
    return err({ kind: "reset_failed", message: `Diff failed: ${diffResult.error.kind}` });
  }

  if (!diffResult.value.hasChanges) {
    return ok({ resetFiles: [] });
  }

  // Reset staging copies to match protect-tier originals
  // Handles modified (overwrite) and deleted (recreate staging copy)
  const resetFiles: string[] = [];
  const resettableFiles = diffResult.value.files.filter(
    (f) => f.status === "modified" || f.status === "deleted",
  );

  for (const file of resettableFiles) {
    const stagePath = stagingPath(file.path);
    const copyResult = await ops.copyFile(file.path, stagePath);
    if (copyResult.ok) {
      if (stagingOwnership) {
        await ops.chown(stagePath, stagingOwnership);
        await ops.chmod(stagePath, stagingOwnership.mode);
      }
      resetFiles.push(file.path);
    }
  }

  return ok({ resetFiles });
}
