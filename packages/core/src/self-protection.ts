/**
 * Built-in self-protection for soulguard approve.
 *
 * These checks are HARDCODED and run on every approval — they cannot be
 * bypassed by passing an empty policies array. This prevents soulguard
 * from being bricked through its own approval flow.
 *
 * Current checks:
 * - If soulguard.json is being changed, the new content must be valid config
 */

import type { Result } from "./types.js";
import type { ApprovalError } from "./approve.js";
import { soulguardConfigSchema } from "./schema.js";
import { ok, err } from "./result.js";

/**
 * Validate built-in self-protection rules against pending changes.
 * Takes a map of path → content for the files being approved.
 * Returns an ApprovalError if any check fails.
 */
export function validateSelfProtection(
  pendingContents: Map<string, string>,
): Result<void, ApprovalError> {
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
