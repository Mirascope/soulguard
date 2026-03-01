/**
 * Built-in self-protection for soulguard apply.
 *
 * These checks are HARDCODED and run on every apply — they cannot be
 * bypassed by passing an empty policies array. This prevents soulguard
 * from being bricked through its own apply flow.
 *
 * Current checks:
 * - soulguard.json cannot be deleted
 * - If soulguard.json is being changed, the new content must be valid config
 */

import type { Result } from "./types.js";
import type { ApplyError } from "./apply.js";
import type { FileDiff } from "./diff.js";
import { soulguardConfigSchema } from "./schema.js";
import { ok, err } from "./result.js";

/**
 * Validate built-in self-protection rules against pending changes.
 * Takes a map of path → content for content files, and a list of deleted files.
 * Returns an ApplyError if any check fails.
 */
export function validateSelfProtection(
  pendingContents: Map<string, string>,
  deletedFiles: FileDiff[] = [],
): Result<void, ApplyError> {
  // Block deletion of soulguard.json — config must always exist
  if (deletedFiles.some((f) => f.path === "soulguard.json")) {
    return err({
      kind: "self_protection",
      message: "Cannot delete soulguard.json — it is required for soulguard to function",
    });
  }

  const sgContent = pendingContents.get("soulguard.json");
  if (sgContent === undefined) {
    return ok(undefined);
  }

  // Parse as JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(sgContent);
  } catch {
    return err({
      kind: "self_protection",
      message: "soulguard.json would not be valid JSON after this change",
    });
  }

  // Validate against config schema
  const result = soulguardConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return err({
      kind: "self_protection",
      message: `soulguard.json would be invalid after this change: ${issues}`,
    });
  }

  return ok(undefined);
}
