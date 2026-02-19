/**
 * soulguard approve — apply a proposal to vault files.
 *
 * Validates password (if set), checks proposal isn't stale (vault hashes
 * match what proposal recorded), then applies atomically:
 * 1. Backup all affected vault files to .soulguard/backup/
 * 2. Apply all staging → vault copies
 * 3. Re-protect all files
 * 4. On any failure, rollback from backups
 * 5. Clear proposal + backups on success
 */

import type { SystemOperations } from "./system-ops.js";
import type { FileOwnership, Result } from "./types.js";
import type { Proposal, ApprovalError } from "./proposal.js";
import { parseProposal } from "./proposal.js";
import { ok, err } from "./result.js";

export type ApproveOptions = {
  ops: SystemOperations;
  /** Expected vault ownership to restore after writing */
  vaultOwnership: FileOwnership;
  /** Ownership for staging copies after sync (agent-writable) */
  stagingOwnership?: FileOwnership;
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

  const proposal = parseProposal(proposalJson.value);
  if (!proposal) {
    return err({ kind: "apply_failed", message: "Invalid or corrupted proposal.json" });
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

  // ── Phase 1: Validate all hashes (staleness check) ─────────────────
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

    // Also verify staged file still matches proposal
    const stagedHash = await ops.hashFile(`.soulguard/staging/${file.path}`);
    if (!stagedHash.ok) {
      return err({ kind: "apply_failed", message: `Cannot read staging/${file.path}` });
    }
    if (stagedHash.value !== file.stagedHash) {
      return err({
        kind: "stale_proposal",
        message: `Staging copy of ${file.path} changed after propose. Re-propose.`,
      });
    }
  }

  // ── Phase 2: Backup all affected vault files ───────────────────────
  await ops.mkdir(".soulguard/backup");
  for (const file of proposal.files) {
    const backupResult = await ops.copyFile(file.path, `.soulguard/backup/${file.path}`);
    if (!backupResult.ok) {
      return err({ kind: "apply_failed", message: `Backup of ${file.path} failed` });
    }
  }

  // ── Phase 3: Apply all changes ─────────────────────────────────────
  const appliedFiles: string[] = [];

  for (const file of proposal.files) {
    const content = await ops.readFile(`.soulguard/staging/${file.path}`);
    if (!content.ok) {
      await rollback(ops, proposal, appliedFiles, vaultOwnership);
      return err({ kind: "apply_failed", message: `Cannot read staging/${file.path}` });
    }

    const writeResult = await ops.writeFile(file.path, content.value);
    if (!writeResult.ok) {
      await rollback(ops, proposal, appliedFiles, vaultOwnership);
      return err({
        kind: "apply_failed",
        message: `Cannot write ${file.path}: ${writeResult.error.kind}`,
      });
    }

    // Re-protect
    const chownResult = await ops.chown(file.path, {
      user: vaultOwnership.user,
      group: vaultOwnership.group,
    });
    if (!chownResult.ok) {
      await rollback(ops, proposal, appliedFiles, vaultOwnership);
      return err({
        kind: "apply_failed",
        message: `Cannot chown ${file.path}: ${chownResult.error.kind}`,
      });
    }

    const chmodResult = await ops.chmod(file.path, vaultOwnership.mode);
    if (!chmodResult.ok) {
      await rollback(ops, proposal, appliedFiles, vaultOwnership);
      return err({
        kind: "apply_failed",
        message: `Cannot chmod ${file.path}: ${chmodResult.error.kind}`,
      });
    }

    appliedFiles.push(file.path);
  }

  // ── Phase 4: Sync staging copies + cleanup ─────────────────────────
  for (const file of proposal.files) {
    const stagingPath = `.soulguard/staging/${file.path}`;
    await ops.copyFile(file.path, stagingPath);
    // Re-apply agent-writable ownership to staging copy
    if (options.stagingOwnership) {
      await ops.chown(stagingPath, {
        user: options.stagingOwnership.user,
        group: options.stagingOwnership.group,
      });
      await ops.chmod(stagingPath, options.stagingOwnership.mode);
    }
  }

  // Clean up backup and proposal
  for (const file of proposal.files) {
    await ops.deleteFile(`.soulguard/backup/${file.path}`);
  }
  await ops.deleteFile(".soulguard/proposal.json");

  return ok({ appliedFiles });
}

/**
 * Rollback: restore vault files from backups after a partial apply failure.
 */
async function rollback(
  ops: SystemOperations,
  proposal: Proposal,
  appliedFiles: string[],
  vaultOwnership: FileOwnership,
): Promise<void> {
  for (const filePath of appliedFiles) {
    const backupContent = await ops.readFile(`.soulguard/backup/${filePath}`);
    if (backupContent.ok) {
      await ops.writeFile(filePath, backupContent.value);
      await ops.chown(filePath, {
        user: vaultOwnership.user,
        group: vaultOwnership.group,
      });
      await ops.chmod(filePath, vaultOwnership.mode);
    }
  }
  // Clean up backup files after rollback
  for (const file of proposal.files) {
    await ops.deleteFile(`.soulguard/backup/${file.path}`);
  }
}
