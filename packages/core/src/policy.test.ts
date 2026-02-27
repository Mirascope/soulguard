import { describe, expect, test } from "bun:test";
import { validatePolicies, evaluatePolicies } from "./policy.js";
import type { Policy, ApprovalContext } from "./policy.js";
import { ok, err } from "./result.js";

function makeCtx(files: Record<string, string>): ApprovalContext {
  const ctx: ApprovalContext = new Map();
  for (const [path, content] of Object.entries(files)) {
    ctx.set(path, { final: content, diff: "", previous: "" });
  }
  return ctx;
}

describe("validatePolicies", () => {
  test("accepts unique names", () => {
    const result = validatePolicies([
      { name: "policy-a", check: () => ok(undefined) },
      { name: "policy-b", check: () => ok(undefined) },
    ]);
    expect(result.ok).toBe(true);
  });

  test("rejects duplicate names", () => {
    const result = validatePolicies([
      { name: "policy-a", check: () => ok(undefined) },
      { name: "policy-a", check: () => ok(undefined) },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("policy_name_collision");
    expect(result.error.duplicates).toEqual(["policy-a"]);
  });

  test("reports all duplicates", () => {
    const result = validatePolicies([
      { name: "a", check: () => ok(undefined) },
      { name: "b", check: () => ok(undefined) },
      { name: "a", check: () => ok(undefined) },
      { name: "b", check: () => ok(undefined) },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.duplicates).toEqual(["a", "b"]);
  });

  test("accepts empty array", () => {
    const result = validatePolicies([]);
    expect(result.ok).toBe(true);
  });
});

describe("evaluatePolicies", () => {
  test("passes when all policies pass", async () => {
    const policies: Policy[] = [
      { name: "always-ok", check: () => ok(undefined) },
      { name: "also-ok", check: () => ok(undefined) },
    ];
    const result = await evaluatePolicies(policies, makeCtx({ "SOUL.md": "content" }));
    expect(result.ok).toBe(true);
  });

  test("fails with violation when policy rejects", async () => {
    const policies: Policy[] = [{ name: "strict", check: () => err("not allowed") }];
    const result = await evaluatePolicies(policies, makeCtx({ "SOUL.md": "content" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.violations).toHaveLength(1);
    expect(result.error.violations[0]!.policy).toBe("strict");
    expect(result.error.violations[0]!.message).toBe("not allowed");
  });

  test("evaluates ALL policies (no short-circuit)", async () => {
    const policies: Policy[] = [
      { name: "first", check: () => err("fail 1") },
      { name: "second", check: () => err("fail 2") },
      { name: "third", check: () => ok(undefined) },
    ];
    const result = await evaluatePolicies(policies, makeCtx({ "SOUL.md": "content" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.violations).toHaveLength(2);
    expect(result.error.violations[0]!.policy).toBe("first");
    expect(result.error.violations[1]!.policy).toBe("second");
  });

  test("supports async policy checks", async () => {
    const policies: Policy[] = [
      {
        name: "async-check",
        check: async (ctx) => {
          const soul = ctx.get("SOUL.md");
          if (soul?.final.includes("evil")) return err("evil content");
          return ok(undefined);
        },
      },
    ];
    const passResult = await evaluatePolicies(policies, makeCtx({ "SOUL.md": "good content" }));
    expect(passResult.ok).toBe(true);

    const failResult = await evaluatePolicies(policies, makeCtx({ "SOUL.md": "evil content" }));
    expect(failResult.ok).toBe(false);
  });

  test("receives correct context", async () => {
    let captured: ApprovalContext | undefined;
    const policies: Policy[] = [
      {
        name: "capture",
        check: (ctx) => {
          captured = ctx;
          return ok(undefined);
        },
      },
    ];
    const ctx = new Map([
      ["SOUL.md", { final: "new soul", diff: "some diff", previous: "old soul" }],
    ]);
    await evaluatePolicies(policies, ctx);
    expect(captured).toBeDefined();
    expect(captured!.get("SOUL.md")!.final).toBe("new soul");
    expect(captured!.get("SOUL.md")!.previous).toBe("old soul");
  });
});
