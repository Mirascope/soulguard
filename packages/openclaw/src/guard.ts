/**
 * before_tool_call guard — blocks writes to protected files and
 * returns a helpful message guiding the agent to the staging workflow.
 */

import { isProtectedFile, isStagingPath, stagingPath } from "@soulguard/core";

// ── Types ──────────────────────────────────────────────────────────────

export type GuardOptions = {
  /** Protected file paths/patterns from soulguard.json */
  protectFiles: string[];
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

  // Never block writes to staging files
  if (isStagingPath(targetPath)) return { blocked: false };

  // Check against protect tier using core SDK
  if (!isProtectedFile(options.protectFiles, targetPath)) return { blocked: false };

  return {
    blocked: true,
    reason: [
      `${targetPath} is protected by soulguard.`,
      `To propose changes, run \`soulguard stage ${targetPath}\` to create a working copy,`,
      `then edit the staged file at ${stagingPath(targetPath)}.`,
      `Run \`soulguard diff\` to review your changes.`,
      `Your owner will review and apply the changes.`,
    ].join(" "),
  };
}
