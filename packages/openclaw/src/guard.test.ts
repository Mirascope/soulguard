import { describe, expect, it } from "bun:test";
import { guardToolCall, type GuardOptions } from "./guard.js";

const defaultOpts: GuardOptions = {
  protectFiles: ["SOUL.md", "IDENTITY.md"],
};

describe("guardToolCall", () => {
  it("blocks Write to a protected file", () => {
    const result = guardToolCall("Write", { file_path: "SOUL.md" }, defaultOpts);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("protected by soulguard");
    expect(result.reason).toContain("soulguard stage SOUL.md");
    expect(result.reason).toContain(".soulguard-staging/SOUL.md");
    expect(result.reason).toContain("Your owner will review and apply");
  });

  it("blocks Edit to a protected file", () => {
    const result = guardToolCall("Edit", { path: "IDENTITY.md" }, defaultOpts);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("protected by soulguard");
    expect(result.reason).toContain("soulguard stage IDENTITY.md");
  });

  it("allows Write to a non-protected file", () => {
    const result = guardToolCall("Write", { file_path: "README.md" }, defaultOpts);
    expect(result.blocked).toBe(false);
  });

  it("allows Write to staging copy of a protected file", () => {
    const result = guardToolCall("Write", { file_path: ".soulguard-staging/SOUL.md" }, defaultOpts);
    expect(result.blocked).toBe(false);
  });

  it("allows non-write tools (e.g. Read)", () => {
    const result = guardToolCall("Read", { file_path: "SOUL.md" }, defaultOpts);
    expect(result.blocked).toBe(false);
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

  it("includes the original path in the block reason", () => {
    const result = guardToolCall("Write", { file_path: "./SOUL.md" }, defaultOpts);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("./SOUL.md");
  });

  it("blocks writes to files inside a protected directory", () => {
    const opts: GuardOptions = { protectFiles: ["skills"] };
    const result = guardToolCall("Write", { file_path: "skills/my-skill.md" }, opts);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("skills/my-skill.md");
  });

  it("allows writes to files outside a protected directory", () => {
    const opts: GuardOptions = { protectFiles: ["skills"] };
    const result = guardToolCall("Write", { file_path: "memory/notes.md" }, opts);
    expect(result.blocked).toBe(false);
  });
});
