/**
 * Git integration helpers for soulguard.
 *
 * Provides auto-commit functionality for vault and ledger changes.
 * All operations are best-effort — git failures never block core operations.
 */

import type { SystemOperations } from "./system-ops.js";
import type { SoulguardConfig, Result } from "./types.js";
import { ok, err } from "./result.js";
import { resolvePatterns } from "./glob.js";

export type GitCommitResult =
  | { committed: true; message: string; files: string[] }
  | { committed: false; reason: "git_disabled" | "no_files" | "nothing_staged" | "dirty_staging" };

export type GitError = { kind: "git_error"; message: string };

/**
 * Check if git is enabled and a repo exists.
 */
export async function isGitEnabled(
  ops: SystemOperations,
  config: SoulguardConfig,
): Promise<boolean> {
  if (config.git === false) return false;
  const gitExists = await ops.exists(".git");
  return gitExists.ok && gitExists.value;
}

/**
 * Stage specific files and commit.
 *
 * Handles both modified and deleted files (git add stages deletions).
 * Returns ok with committed=false if there's nothing to commit.
 */
export async function gitCommit(
  ops: SystemOperations,
  files: string[],
  message: string,
): Promise<Result<GitCommitResult, GitError>> {
  if (files.length === 0) {
    return ok({ committed: false, reason: "no_files" });
  }

  // Check for pre-existing staged changes — refuse to commit if the user
  // has something staged, so we don't absorb their work into a soulguard commit.
  const preCheck = await ops.exec("git", ["diff", "--cached", "--quiet"]);
  if (!preCheck.ok) {
    // exit code 1 = there are staged changes already
    return ok({ committed: false, reason: "dirty_staging" });
  }

  // Stage each file individually
  for (const file of files) {
    const result = await ops.exec("git", ["add", "--", file]);
    if (!result.ok) {
      return err({ kind: "git_error", message: `git add ${file}: ${result.error.message}` });
    }
  }

  // Check if there's actually anything staged
  // exit code 0 = nothing staged, exit code 1 = changes staged
  const diffResult = await ops.exec("git", ["diff", "--cached", "--quiet"]);
  if (diffResult.ok) {
    // Nothing staged — files were already committed or unchanged
    return ok({ committed: false, reason: "nothing_staged" });
  }

  // Commit with soulguard author
  const commitResult = await ops.exec("git", [
    "commit",
    "--author",
    "SoulGuardian <soulguardian@soulguard.ai>",
    "-m",
    message,
  ]);
  if (!commitResult.ok) {
    return err({ kind: "git_error", message: `git commit: ${commitResult.error.message}` });
  }

  return ok({ committed: true, message, files });
}

/**
 * Build a human-readable commit message for vault changes.
 */
export function vaultCommitMessage(files: string[], approvalMessage?: string): string {
  const fileList = files.join(", ");
  const base = `soulguard: vault update — ${fileList}`;
  if (approvalMessage) {
    return `${base}\n\n${approvalMessage}`;
  }
  return base;
}

/**
 * Build a human-readable commit message for ledger changes.
 * Uses a generic message since we stage all ledger files and let
 * git determine which actually changed.
 */
export function ledgerCommitMessage(): string {
  return "soulguard: ledger sync";
}

/**
 * Commit all ledger files to git (best-effort).
 *
 * Intended to be called by the daemon/cove on its own schedule,
 * NOT by sync (which focuses on permissions/ownership health).
 * Stages all non-glob ledger files and commits if anything changed.
 */
export async function commitLedgerFiles(
  ops: SystemOperations,
  config: SoulguardConfig,
): Promise<Result<GitCommitResult, GitError>> {
  if (!(await isGitEnabled(ops, config))) {
    return ok({ committed: false, reason: "git_disabled" });
  }

  const resolved = await resolvePatterns(ops, config.ledger);
  if (!resolved.ok) {
    return err({ kind: "git_error", message: `glob failed: ${resolved.error.message}` });
  }
  const ledgerFiles = resolved.value;
  if (ledgerFiles.length === 0) {
    return ok({ committed: false, reason: "no_files" });
  }

  return gitCommit(ops, ledgerFiles, ledgerCommitMessage());
}
