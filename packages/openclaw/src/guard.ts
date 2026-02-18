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

/** Normalize a path by stripping leading "./" or "/" */
function normalizePath(p: string): string {
  let s = p;
  if (s.startsWith("./")) s = s.slice(2);
  if (s.startsWith("/")) s = s.slice(1);
  return s;
}

/** Check if `filePath` matches a vault entry (exact or directory-glob). */
function matchesVault(filePath: string, vaultFiles: string[]): string | null {
  const norm = normalizePath(filePath);

  for (const pattern of vaultFiles) {
    const p = normalizePath(pattern);

    // Exact match
    if (norm === p) return pattern;

    // Directory glob: "extensions/**" matches "extensions/foo/bar.ts"
    if (p.endsWith("/**")) {
      const prefix = p.slice(0, -2); // "extensions/"
      if (norm.startsWith(prefix)) return pattern;
    }

    // Simple wildcard suffix: "*.md" — match basename
    if (p.startsWith("*.")) {
      const ext = p.slice(1); // ".md"
      if (norm.endsWith(ext) || basename(norm).endsWith(ext)) {
        // Only if not a deeper pattern — treat as root-level glob
        // For simplicity, match any file with that extension
        return pattern;
      }
    }
  }

  return null;
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
  const match = matchesVault(targetPath, options.vaultFiles);
  if (!match) return { blocked: false };

  const fileName = basename(targetPath);
  return {
    blocked: true,
    reason:
      `${fileName} is vault-protected by soulguard. ` +
      `To modify it, edit .soulguard/staging/${norm} instead, ` +
      `then run \`soulguard propose\` to submit the change for approval.`,
  };
}
