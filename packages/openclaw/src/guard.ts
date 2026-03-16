/**
 * before_tool_call guard — blocks writes to protected files and
 * returns a helpful message guiding the agent to the staging workflow.
 */

import path from "node:path";
import { isProtectedFile, isStagingPath, stagingPath } from "@soulguard/core";

// ── Types ──────────────────────────────────────────────────────────────

export type GuardOptions = {
  /** Protected file paths/patterns from soulguard.json */
  protectFiles: string[];
  /** Absolute path to the OpenClaw state dir (e.g. ~/.openclaw/) for resolving absolute tool paths. */
  stateDir: string;
};

export type GuardResult = {
  blocked: boolean;
  reason?: string;
};

// ── Constants ──────────────────────────────────────────────────────────

/** OpenClaw tool names that write files (lowercase — OpenClaw normalizes names). */
const WRITE_TOOLS = new Set(["write", "edit"]);

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
  // Only intercept file-writing tools (compare lowercase for robustness)
  if (!WRITE_TOOLS.has(toolName.toLowerCase())) {
    return { blocked: false };
  }

  // Extract target path from params
  let targetPath: string | undefined;
  for (const key of PATH_KEYS) {
    const v = params[key];
    if (typeof v === "string" && v.length > 0) {
      targetPath = v;
      break;
    }
  }

  // OpenClaw passes absolute paths (e.g. /Users/x/.openclaw/workspace/SOUL.md)
  // but protectFiles uses relative paths (e.g. workspace/SOUL.md). Make relative.
  if (targetPath && path.isAbsolute(targetPath)) {
    targetPath = path.relative(options.stateDir, targetPath);
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
