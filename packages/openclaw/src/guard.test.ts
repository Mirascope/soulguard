import { describe, expect, it } from "bun:test";
import { guardToolCall, type GuardOptions } from "./guard.js";

const defaultOpts: GuardOptions = {
  vaultFiles: ["SOUL.md", "IDENTITY.md"],
};

describe("guardToolCall", () => {
  it("blocks Write to a vault file", () => {
    const result = guardToolCall("Write", { file_path: "SOUL.md" }, defaultOpts);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("vault-protected");
    expect(result.reason).toContain(".soulguard/staging/SOUL.md");
    expect(result.reason).toContain("soulguard propose");
  });

  it("blocks Edit to a vault file", () => {
    const result = guardToolCall("Edit", { path: "IDENTITY.md" }, defaultOpts);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("vault-protected");
  });

  it("allows Write to a non-vault file", () => {
    const result = guardToolCall("Write", { file_path: "README.md" }, defaultOpts);
    expect(result.blocked).toBe(false);
  });

  it("allows Write to staging copy of a vault file", () => {
    const result = guardToolCall("Write", { file_path: ".soulguard/staging/SOUL.md" }, defaultOpts);
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
  // For 0.1, "*.md" in vaultFiles is treated as a literal string, not a glob.
});
