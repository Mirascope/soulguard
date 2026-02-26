/**
 * soulguard reject — reset staging copies to match vault originals.
 *
 * With implicit proposals, reject simply resets staging to match vault.
 * No proposal.json to delete — staging IS the proposal.
 */

import type { SystemOperations } from "./system-ops.js";
import type { FileOwnership, SoulguardConfig, Result } from "./types.js";
import { diff } from "./diff.js";
import { ok, err } from "./result.js";

export type RejectOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  /** Ownership to apply to reset staging files (agent-writable) */
  stagingOwnership?: FileOwnership;
  /** Password provided by owner (undefined if no password set) */
  password?: string;
  /** Verify password callback — returns true if valid */
  verifyPassword?: (password: string) => Promise<boolean>;
};

export type RejectResult = {
  /** Files whose staging copies were reset */
  resetFiles: string[];
};

export type RejectError =
  | { kind: "no_changes" }
  | { kind: "wrong_password" }
  | { kind: "reset_failed"; message: string };

/**
 * Reject staging changes and reset to match vault.
 */
export async function reject(options: RejectOptions): Promise<Result<RejectResult, RejectError>> {
  const { ops, config, stagingOwnership, password, verifyPassword } = options;

  // Verify password if configured
  if (verifyPassword) {
    if (!password) {
      return err({ kind: "wrong_password" });
    }
    const valid = await verifyPassword(password);
    if (!valid) {
      return err({ kind: "wrong_password" });
    }
  }

  // Compute current diff to find what needs resetting
  const diffResult = await diff({ ops, config });
  if (!diffResult.ok) {
    return err({ kind: "reset_failed", message: `Diff failed: ${diffResult.error.kind}` });
  }

  if (!diffResult.value.hasChanges) {
    return err({ kind: "no_changes" });
  }

  // Reset modified staging copies to match vault originals
  const resetFiles: string[] = [];
  const modifiedFiles = diffResult.value.files.filter((f) => f.status === "modified");

  for (const file of modifiedFiles) {
    const stagingPath = `.soulguard/staging/${file.path}`;
    const copyResult = await ops.copyFile(file.path, stagingPath);
    if (copyResult.ok) {
      if (stagingOwnership) {
        await ops.chown(stagingPath, {
          user: stagingOwnership.user,
          group: stagingOwnership.group,
        });
        await ops.chmod(stagingPath, stagingOwnership.mode);
      }
      resetFiles.push(file.path);
    }
  }

  return ok({ resetFiles });
}
