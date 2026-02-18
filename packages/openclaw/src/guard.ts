/**
 * before_tool_call guard — blocks writes to vault-protected files and
 * returns a helpful message pointing the agent to the staging workflow.
 */

import { basename } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────

export type GuardOptions = {
  /** Vault file paths/patterns from soulguard.json */
  vaultFiles: string[];
};

export type GuardResult = {
  blocked: boolean;
  reason?: string;
};

// ── Constants ──────────────────────────────────────────────────────────

/** OpenClaw tool names that write files. */
const WRITE_TOOLS = new Set(["Write", "Edit"]);

/** Param keys that carry the target file path. */
const PATH_KEYS = ["file_path", "path", "file"] as const;

/** Staging directory — writes here are always allowed. */
const STAGING_PREFIX = ".soulguard/staging/";

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Normalize a path by stripping leading "./" or "/".
 * The guard assumes all paths are workspace-relative, so stripping a leading
 * "/" is intentional and safe — absolute paths within the workspace get
 * collapsed to their relative form.
 */
function normalizePath(p: string): string {
  let s = p;
  if (s.startsWith("./")) s = s.slice(2);
  if (s.startsWith("/")) s = s.slice(1);
  return s;
}

// TODO: delegate to @soulguard/core isVaulted() API
/** Check if `filePath` exactly matches a vault entry. */
function matchesVault(filePath: string, vaultFiles: string[]): boolean {
  const norm = normalizePath(filePath);
  return vaultFiles.some((pattern) => norm === normalizePath(pattern));
}

// ── Main guard ─────────────────────────────────────────────────────────

/**
 * Evaluate whether a tool call should be blocked.
 *
 * Returns `{ blocked: false }` to allow, or `{ blocked: true, reason }` to block.
 */
export function guardToolCall(
  toolName: string,
  params: Record<string, unknown>,
  options: GuardOptions,
): GuardResult {
  // Only intercept file-writing tools
  if (!WRITE_TOOLS.has(toolName)) return { blocked: false };

  // Extract target path from params
  let targetPath: string | undefined;
  for (const key of PATH_KEYS) {
    const v = params[key];
    if (typeof v === "string" && v.length > 0) {
      targetPath = v;
      break;
    }
  }

  if (!targetPath) return { blocked: false };

  // Never block writes to staging
  const norm = normalizePath(targetPath);
  if (norm.startsWith(STAGING_PREFIX)) return { blocked: false };

  // Check against vault
  if (!matchesVault(targetPath, options.vaultFiles)) return { blocked: false };

  const fileName = basename(targetPath);
  return {
    blocked: true,
    reason:
      `${fileName} is vault-protected by soulguard. ` +
      `To modify it, edit .soulguard/staging/${norm} instead, ` +
      `then run \`soulguard propose\` to submit the change for approval.`,
  };
}
