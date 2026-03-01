import { describe, expect, it } from "bun:test";
import { guardToolCall, type GuardOptions } from "./guard.js";

const defaultOpts: GuardOptions = {
  protectFiles: ["SOUL.md", "IDENTITY.md"],
};

describe("guardToolCall", () => {
  it("blocks Write to a protect-tier file", () => {
    const result = guardToolCall("Write", { file_path: "SOUL.md" }, defaultOpts);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("protect-tier protected");
    expect(result.reason).toContain(".soulguard.SOUL.md");
    expect(result.reason).toContain("reviewed and approved by the owner");
  });

  it("blocks Edit to a protect-tier file", () => {
    const result = guardToolCall("Edit", { path: "IDENTITY.md" }, defaultOpts);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("protect-tier protected");
  });

  it("allows Write to a non-protect-tier file", () => {
    const result = guardToolCall("Write", { file_path: "README.md" }, defaultOpts);
    expect(result.blocked).toBe(false);
  });

  it("allows Write to staging copy of a protect-tier file", () => {
    const result = guardToolCall("Write", { file_path: ".soulguard.SOUL.md" }, defaultOpts);
    expect(result.blocked).toBe(false);
  });

  it("allows non-write tools (e.g. Read)", () => {
    const result = guardToolCall("Read", { file_path: "SOUL.md" }, defaultOpts);
    expect(result.blocked).toBe(false);
  });

  // TODO: re-enable when glob matching is delegated to @soulguard/core isVaulted() API
  // For 0.1, only exact matches are supported — globs are not evaluated.

  it("handles ./prefix in file paths", () => {
    const result = guardToolCall("Write", { path: "./SOUL.md" }, defaultOpts);
    expect(result.blocked).toBe(true);
  });

  it("allows when no path param is present", () => {
    const result = guardToolCall("Write", { content: "hello" }, defaultOpts);
    expect(result.blocked).toBe(false);
  });

  it("checks file param key as well", () => {
    const result = guardToolCall("Edit", { file: "SOUL.md" }, defaultOpts);
    expect(result.blocked).toBe(true);
  });

  // TODO: glob pattern tests — re-enable when delegated to @soulguard/core isVaulted() API
  // For 0.1, "*.md" in protectFiles is treated as a literal string, not a glob.
});
