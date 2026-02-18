/**
 * soulguard approve — apply a proposal to vault files.
 *
 * Validates password (if set), checks proposal isn't stale (vault hashes
 * match what proposal recorded), copies staging → vault, re-protects
 * ownership/permissions, clears the proposal.
 */

import type { SystemOperations } from "./system-ops.js";
import type { FileOwnership, Result } from "./types.js";
import type { Proposal, ApprovalError } from "./proposal.js";
import { ok, err } from "./result.js";

export type ApproveOptions = {
  ops: SystemOperations;
  /** Expected vault ownership to restore after writing */
  vaultOwnership: FileOwnership;
  /** Password provided by owner (undefined if no password set) */
  password?: string;
  /** Verify password callback — returns true if valid */
  verifyPassword?: (password: string) => Promise<boolean>;
};

export type ApproveResult = {
  /** Files that were updated */
  appliedFiles: string[];
};

/**
 * Approve and apply the active proposal.
 */
export async function approve(
  options: ApproveOptions,
): Promise<Result<ApproveResult, ApprovalError>> {
  const { ops, vaultOwnership, password, verifyPassword } = options;

  // Read proposal
  const proposalJson = await ops.readFile(".soulguard/proposal.json");
  if (!proposalJson.ok) {
    return err({ kind: "no_proposal" });
  }

  const proposal: Proposal = JSON.parse(proposalJson.value);

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

  // Check for staleness — vault files must still match the hashes recorded at propose time
  for (const file of proposal.files) {
    const currentHash = await ops.hashFile(file.path);
    if (!currentHash.ok) {
      return err({
        kind: "stale_proposal",
        message: `Cannot read ${file.path}: ${currentHash.error.kind}`,
      });
    }
    if (currentHash.value !== file.protectedHash) {
      return err({
        kind: "stale_proposal",
        message: `${file.path} has changed since the proposal was created. Re-propose.`,
      });
    }
  }

  // Apply: copy staging → vault for each file
  const appliedFiles: string[] = [];

  for (const file of proposal.files) {
    const stagingPath = `.soulguard/staging/${file.path}`;

    // Verify staged file still matches proposal
    const stagedHash = await ops.hashFile(stagingPath);
    if (!stagedHash.ok) {
      return err({ kind: "apply_failed", message: `Cannot read staging/${file.path}` });
    }
    if (stagedHash.value !== file.stagedHash) {
      return err({
        kind: "stale_proposal",
        message: `Staging copy of ${file.path} changed after propose. Re-propose.`,
      });
    }

    // Read staged content and write to vault location
    const content = await ops.readFile(stagingPath);
    if (!content.ok) {
      return err({ kind: "apply_failed", message: `Cannot read staging/${file.path}` });
    }

    const writeResult = await ops.writeFile(file.path, content.value);
    if (!writeResult.ok) {
      return err({
        kind: "apply_failed",
        message: `Cannot write ${file.path}: ${writeResult.error.kind}`,
      });
    }

    // Re-protect: chown + chmod
    const chownResult = await ops.chown(file.path, {
      user: vaultOwnership.user,
      group: vaultOwnership.group,
    });
    if (!chownResult.ok) {
      return err({
        kind: "apply_failed",
        message: `Cannot chown ${file.path}: ${chownResult.error.kind}`,
      });
    }

    const chmodResult = await ops.chmod(file.path, vaultOwnership.mode);
    if (!chmodResult.ok) {
      return err({
        kind: "apply_failed",
        message: `Cannot chmod ${file.path}: ${chmodResult.error.kind}`,
      });
    }

    // Update staging copy to match new vault state
    const copyStagingResult = await ops.copyFile(file.path, stagingPath);
    if (!copyStagingResult.ok) {
      // Non-fatal — staging will be out of sync but vault is correct
    }

    appliedFiles.push(file.path);
  }

  // Clear proposal
  await ops.deleteFile(".soulguard/proposal.json");

  return ok({ appliedFiles });
}
