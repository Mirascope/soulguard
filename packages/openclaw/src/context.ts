/**
 * before_prompt_build context injection — injects a short note when
 * there are pending staged changes so the agent knows about them
 * without polluting context on normal turns.
 */

import { StateTree, type BuildStateOptions } from "@soulguard/core";

// ── Types ──────────────────────────────────────────────────────────────

export type PendingChangesResult = {
  /** File paths that have pending staged changes. */
  files: string[];
};

// ── Core ───────────────────────────────────────────────────────────────

/**
 * Get pending staged changes using the soulguard state tree.
 */
export async function getPendingChanges(options: BuildStateOptions): Promise<PendingChangesResult> {
  const treeResult = await StateTree.build(options);
  if (!treeResult.ok) return { files: [] };
  return { files: treeResult.value.changedFiles().map((f) => f.path) };
}

/**
 * Build the context string to inject via before_prompt_build.
 * Returns undefined if there are no pending changes (no context pollution).
 */
export async function buildPendingChangesContext(
  options: BuildStateOptions,
): Promise<string | undefined> {
  const { files } = await getPendingChanges(options);
  if (files.length === 0) return undefined;

  const fileList = files.join(", ");
  return (
    `[Soulguard] ${files.length} protected file(s) have pending staged changes: ${fileList}. ` +
    `Use \`soulguard diff\` to review. Ask your owner to apply changes, ` +
    `or use \`soulguard reset\` to discard them.`
  );
}
