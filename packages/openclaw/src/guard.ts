/**
 * before_tool_call guard — redirects writes to protected files into the
 * staging tree so agents can propose changes without direct access.
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

export type GuardResult =
  | { action: "allow" }
  | { action: "block"; reason: string }
  | { action: "redirect"; pathKey: string; originalPath: string; redirectedPath: string };

// ── Constants ──────────────────────────────────────────────────────────

/** OpenClaw tool names that write files (lowercase — OpenClaw normalizes names). */
const WRITE_TOOLS = new Set(["write", "edit"]);

/** Param keys that carry the target file path. */
const PATH_KEYS = ["file_path", "path", "file"] as const;

// ── Main guard ─────────────────────────────────────────────────────────

/**
 * Evaluate whether a tool call should be redirected, blocked, or allowed.
 *
 * For writes to protected files the guard returns a `redirect` result that
 * tells the caller which param key to rewrite and the staging-tree path to
 * redirect to.
 */
export function guardToolCall(
  toolName: string,
  params: Record<string, unknown>,
  options: GuardOptions,
): GuardResult {
  // Only intercept file-writing tools (compare lowercase for robustness)
  if (!WRITE_TOOLS.has(toolName.toLowerCase())) {
    return { action: "allow" };
  }

  // Find which param key carries the path
  let pathKey: string | undefined;
  let rawPath: string | undefined;
  for (const key of PATH_KEYS) {
    const v = params[key];
    if (typeof v === "string" && v.length > 0) {
      pathKey = key;
      rawPath = v;
      break;
    }
  }

  if (!pathKey || !rawPath) return { action: "allow" };

  // Resolve to relative for protect-check. OpenClaw passes absolute paths
  // (e.g. /Users/x/.openclaw/workspace/SOUL.md) but protectFiles uses
  // relative paths (e.g. workspace/SOUL.md).
  const isAbsolute = path.isAbsolute(rawPath);
  const relativePath = isAbsolute ? path.relative(options.stateDir, rawPath) : rawPath;

  // Never intercept writes to staging files
  if (isStagingPath(relativePath)) return { action: "allow" };

  // Check against protect tier using core SDK
  if (!isProtectedFile(options.protectFiles, relativePath)) return { action: "allow" };

  // Compute the staging redirect path, preserving absolute/relative format
  const relativeStaging = stagingPath(relativePath);
  const redirectedPath = isAbsolute
    ? path.join(options.stateDir, relativeStaging)
    : relativeStaging;

  return {
    action: "redirect",
    pathKey,
    originalPath: relativePath,
    redirectedPath,
  };
}
