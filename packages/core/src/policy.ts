/**
 * Policy hooks for soulguard approve.
 *
 * Policies are named check functions that run before vault changes are applied.
 * Each receives an ApprovalContext (map of file path → { final, diff, previous })
 * and returns ok() to allow or err() to block.
 *
 * Multiple policies can be registered. All are evaluated — if any fail,
 * the approval is blocked and all violations are reported.
 */

import type { Result } from "./result.js";
import { ok, err } from "./result.js";

// ── Types ──────────────────────────────────────────────────────────────

/** Context passed to policy check functions. */
export type ApprovalContext = Map<
  string,
  {
    /** Content that would be applied (staging content) */
    final: string;
    /** Unified diff string (vault → staging) */
    diff: string;
    /** Current vault content (empty string for new files) */
    previous: string;
  }
>;

/** A single policy violation. */
export type PolicyViolation = {
  policy: string;
  message: string;
};

/** Error returned when one or more policies block approval. */
export type PolicyError = {
  kind: "policy_violation";
  violations: PolicyViolation[];
};

/** A named policy check function. */
export type Policy = {
  /** Unique name for this policy (e.g. "chelae-plugin-required") */
  name: string;
  /** Check function — return ok() to allow, err(message) to block. */
  check: (ctx: ApprovalContext) => Result<void, string> | Promise<Result<void, string>>;
};

// ── Validation ─────────────────────────────────────────────────────────

/** Error when policies have duplicate names. */
export type PolicyCollisionError = {
  kind: "policy_name_collision";
  duplicates: string[];
};

/**
 * Validate that all policy names are unique.
 * Returns the duplicate names if any collisions exist.
 */
export function validatePolicies(policies: Policy[]): Result<void, PolicyCollisionError> {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const p of policies) {
    if (seen.has(p.name)) {
      duplicates.push(p.name);
    }
    seen.add(p.name);
  }
  if (duplicates.length > 0) {
    return err({ kind: "policy_name_collision", duplicates });
  }
  return ok(undefined);
}

// ── Evaluation ─────────────────────────────────────────────────────────

/**
 * Run all policies against an approval context.
 * All policies are evaluated (not short-circuited) so all violations are reported.
 */
export async function evaluatePolicies(
  policies: Policy[],
  ctx: ApprovalContext,
): Promise<Result<void, PolicyError>> {
  const violations: PolicyViolation[] = [];

  for (const policy of policies) {
    const result = await policy.check(ctx);
    if (!result.ok) {
      violations.push({ policy: policy.name, message: result.error });
    }
  }

  if (violations.length > 0) {
    return err({ kind: "policy_violation", violations });
  }
  return ok(undefined);
}
