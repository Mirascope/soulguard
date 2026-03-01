/**
 * before_tool_call guard — blocks writes to protect-tier protected files and
 * returns a helpful message pointing the agent to the staging workflow.
 */

import { basename } from "node:path";
import { isProtectedFile, isStagingPath, stagingPath } from "@soulguard/core";

// ── Types ──────────────────────────────────────────────────────────────

export type GuardOptions = {
  /** Protect-tier file paths/patterns from soulguard.json */
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

  // Never block writes to staging siblings
  if (isStagingPath(targetPath)) return { blocked: false };

  // Check against protect tier using core SDK
  if (!isProtectedFile(options.protectFiles, targetPath)) return { blocked: false };

  const fileName = basename(targetPath);
  return {
    blocked: true,
    reason:
      `${fileName} is protect-tier protected by soulguard. ` +
      `To modify it, edit ${stagingPath(targetPath)} instead. ` +
      `Your changes will be reviewed and approved by the owner.`,
  };
}
