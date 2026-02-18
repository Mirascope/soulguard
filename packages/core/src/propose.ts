/**
 * soulguard propose — create a vault change proposal from staging.
 *
 * Compares each vault file's staging copy against the protected original.
 * If any differ, writes .soulguard/proposal.json with hashes for stale detection.
 * At most one active proposal at a time.
 */

import type { SystemOperations } from "./system-ops.js";
import type { SoulguardConfig, Result } from "./types.js";
import type { Proposal, ProposalFile, ProposeError } from "./proposal.js";
import { ok, err } from "./result.js";

export type ProposeOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  /** Optional message describing the changes */
  message?: string;
  /** Force: delete existing proposal before creating a new one */
  force?: boolean;
};

export type ProposeResult = {
  proposal: Proposal;
  /** Number of files with changes */
  changedCount: number;
};

/**
 * Create a proposal from staging changes.
 */
export async function propose(
  options: ProposeOptions,
): Promise<Result<ProposeResult, ProposeError>> {
  const { ops, config, message = "", force = false } = options;

  // Check staging directory exists
  const stagingExists = await ops.exists(".soulguard/staging");
  if (!stagingExists.ok || !stagingExists.value) {
    return err({
      kind: "no_staging",
      message: "No staging directory. Run `soulguard init` first.",
    });
  }

  // Check no active proposal (or force-delete it)
  const proposalExists = await ops.exists(".soulguard/proposal.json");
  if (proposalExists.ok && proposalExists.value) {
    if (force) {
      await ops.deleteFile(".soulguard/proposal.json");
    } else {
      return err({ kind: "proposal_exists" });
    }
  }

  // Compare staging vs vault for each vault file
  const files: ProposalFile[] = [];

  for (const vaultFile of config.vault) {
    if (vaultFile.includes("*")) continue; // skip globs

    const stagingPath = `.soulguard/staging/${vaultFile}`;

    // Both must exist
    const vaultExists = await ops.exists(vaultFile);
    const stagedExists = await ops.exists(stagingPath);

    if (!vaultExists.ok || !vaultExists.value) continue;
    if (!stagedExists.ok || !stagedExists.value) continue;

    // Hash both
    const protectedHash = await ops.hashFile(vaultFile);
    const stagedHash = await ops.hashFile(stagingPath);

    if (!protectedHash.ok || !stagedHash.ok) continue;

    // Only include if different
    if (protectedHash.value !== stagedHash.value) {
      files.push({
        path: vaultFile,
        protectedHash: protectedHash.value,
        stagedHash: stagedHash.value,
      });
    }
  }

  if (files.length === 0) {
    return err({ kind: "no_changes" });
  }

  const proposal: Proposal = {
    version: "1",
    message,
    createdAt: new Date().toISOString(),
    files,
  };

  // Write proposal
  const writeResult = await ops.writeFile(
    ".soulguard/proposal.json",
    JSON.stringify(proposal, null, 2) + "\n",
  );
  if (!writeResult.ok) {
    return err({
      kind: "write_failed",
      message: `Failed to write proposal: ${writeResult.error.kind}`,
    });
  }

  return ok({ proposal, changedCount: files.length });
}
