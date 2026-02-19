/**
 * soulguard reject — reject the active proposal.
 *
 * Resets staging copies to match vault originals and deletes the proposal.
 */

import type { SystemOperations } from "./system-ops.js";
import type { FileOwnership, Result } from "./types.js";
import type { RejectError } from "./proposal.js";
import { parseProposal } from "./proposal.js";
import { ok, err } from "./result.js";

export type RejectOptions = {
  ops: SystemOperations;
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

/**
 * Reject the active proposal and reset staging.
 */
export async function reject(options: RejectOptions): Promise<Result<RejectResult, RejectError>> {
  const { ops, stagingOwnership, password, verifyPassword } = options;

  // Read proposal
  const proposalJson = await ops.readFile(".soulguard/proposal.json");
  if (!proposalJson.ok) {
    return err({ kind: "no_proposal" });
  }

  const proposal = parseProposal(proposalJson.value);
  if (!proposal) {
    return err({ kind: "reset_failed", message: "Invalid or corrupted proposal.json" });
  }

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

  // Reset staging copies to match vault originals
  const resetFiles: string[] = [];

  for (const file of proposal.files) {
    const stagingPath = `.soulguard/staging/${file.path}`;
    const copyResult = await ops.copyFile(file.path, stagingPath);
    if (copyResult.ok) {
      // Re-apply agent-writable ownership to staging copy
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

  // Delete proposal
  await ops.deleteFile(".soulguard/proposal.json");

  return ok({ resetFiles });
}
