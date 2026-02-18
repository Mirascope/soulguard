import { describe, expect, it } from "bun:test";
import { guardToolCall, type GuardOptions } from "./guard.js";

const defaultOpts: GuardOptions = {
  vaultFiles: ["SOUL.md", "IDENTITY.md", "extensions/**"],
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

  it("blocks writes matching directory glob pattern", () => {
    const result = guardToolCall("Write", { file_path: "extensions/foo/bar.ts" }, defaultOpts);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("vault-protected");
  });

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

  describe("*.md glob pattern", () => {
    const mdOpts: GuardOptions = { vaultFiles: ["*.md"] };

    it("blocks root-level .md files", () => {
      const result = guardToolCall("Write", { file_path: "README.md" }, mdOpts);
      expect(result.blocked).toBe(true);
    });

    it("blocks nested .md files (recursive match is intentional)", () => {
      const result = guardToolCall("Write", { file_path: "docs/guide/setup.md" }, mdOpts);
      expect(result.blocked).toBe(true);
    });

    it("does not block non-.md files", () => {
      const result = guardToolCall("Write", { file_path: "index.ts" }, mdOpts);
      expect(result.blocked).toBe(false);
    });
  });
});
