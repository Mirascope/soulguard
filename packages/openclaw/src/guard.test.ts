import { describe, expect, it } from "bun:test";
import { guardToolCall, type GuardOptions } from "./guard.js";

const defaultOpts: GuardOptions = {
  protectFiles: ["SOUL.md", "IDENTITY.md"],
  stateDir: "/home/test/.openclaw",
};

describe("guardToolCall", () => {
  // ── Redirect (protected file writes) ──────────────────────────────

  it("redirects Write to a protected file", () => {
    const result = guardToolCall("Write", { file_path: "SOUL.md" }, defaultOpts);
    expect(result.action).toBe("redirect");
    if (result.action !== "redirect") return;
    expect(result.pathKey).toBe("file_path");
    expect(result.originalPath).toBe("SOUL.md");
    expect(result.redirectedPath).toBe(".soulguard-staging/SOUL.md");
  });

  it("redirects Edit to a protected file", () => {
    const result = guardToolCall("Edit", { path: "IDENTITY.md" }, defaultOpts);
    expect(result.action).toBe("redirect");
    if (result.action !== "redirect") return;
    expect(result.pathKey).toBe("path");
    expect(result.originalPath).toBe("IDENTITY.md");
    expect(result.redirectedPath).toBe(".soulguard-staging/IDENTITY.md");
  });

  it("redirects with the 'file' param key", () => {
    const result = guardToolCall("Edit", { file: "SOUL.md" }, defaultOpts);
    expect(result.action).toBe("redirect");
    if (result.action !== "redirect") return;
    expect(result.pathKey).toBe("file");
  });

  it("redirects writes to files inside a protected directory", () => {
    const opts: GuardOptions = { protectFiles: ["skills"], stateDir: "/home/test/.openclaw" };
    const result = guardToolCall("Write", { file_path: "skills/my-skill.md" }, opts);
    expect(result.action).toBe("redirect");
    if (result.action !== "redirect") return;
    expect(result.originalPath).toBe("skills/my-skill.md");
    expect(result.redirectedPath).toBe(".soulguard-staging/skills/my-skill.md");
  });

  it("handles ./prefix in file paths", () => {
    const result = guardToolCall("Write", { path: "./SOUL.md" }, defaultOpts);
    expect(result.action).toBe("redirect");
    if (result.action !== "redirect") return;
    expect(result.pathKey).toBe("path");
  });

  // ── Absolute path handling ────────────────────────────────────────

  it("redirects absolute path to absolute staging path", () => {
    const result = guardToolCall(
      "Write",
      { file_path: "/home/test/.openclaw/SOUL.md" },
      defaultOpts,
    );
    expect(result.action).toBe("redirect");
    if (result.action !== "redirect") return;
    expect(result.originalPath).toBe("SOUL.md");
    expect(result.redirectedPath).toBe("/home/test/.openclaw/.soulguard-staging/SOUL.md");
  });

  it("redirects absolute path inside protected directory", () => {
    const opts: GuardOptions = { protectFiles: ["skills"], stateDir: "/home/test/.openclaw" };
    const result = guardToolCall(
      "Edit",
      { file_path: "/home/test/.openclaw/skills/my-skill.md" },
      opts,
    );
    expect(result.action).toBe("redirect");
    if (result.action !== "redirect") return;
    expect(result.originalPath).toBe("skills/my-skill.md");
    expect(result.redirectedPath).toBe(
      "/home/test/.openclaw/.soulguard-staging/skills/my-skill.md",
    );
  });

  // ── Allow (non-protected / non-write / staging) ───────────────────

  it("allows Write to a non-protected file", () => {
    const result = guardToolCall("Write", { file_path: "README.md" }, defaultOpts);
    expect(result.action).toBe("allow");
  });

  it("allows Write to staging copy of a protected file", () => {
    const result = guardToolCall("Write", { file_path: ".soulguard-staging/SOUL.md" }, defaultOpts);
    expect(result.action).toBe("allow");
  });

  it("allows non-write tools (e.g. Read)", () => {
    const result = guardToolCall("Read", { file_path: "SOUL.md" }, defaultOpts);
    expect(result.action).toBe("allow");
  });

  it("allows when no path param is present", () => {
    const result = guardToolCall("Write", { content: "hello" }, defaultOpts);
    expect(result.action).toBe("allow");
  });

  it("allows writes to files outside a protected directory", () => {
    const opts: GuardOptions = { protectFiles: ["skills"], stateDir: "/home/test/.openclaw" };
    const result = guardToolCall("Write", { file_path: "memory/notes.md" }, opts);
    expect(result.action).toBe("allow");
  });
});
