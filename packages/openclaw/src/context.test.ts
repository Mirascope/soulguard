import { describe, expect, it } from "bun:test";
import { MockSystemOps } from "@soulguard/core";
import type { SoulguardConfig } from "@soulguard/core";
import { getPendingChanges, buildPendingChangesContext } from "./context.js";

const WORKSPACE = "/test-workspace";

const baseConfig: SoulguardConfig = {
  version: 1,
  guardian: "soulguardian_agent",
  files: {
    "SOUL.md": "protect",
    "AGENTS.md": "protect",
  },
};

function setupOps(staged?: Record<string, string>) {
  const ops = new MockSystemOps(WORKSPACE);
  ops.addFile("SOUL.md", "soul content", {
    owner: "soulguardian",
    group: "soulguard",
    mode: "444",
  });
  ops.addFile("AGENTS.md", "agents content", {
    owner: "soulguardian",
    group: "soulguard",
    mode: "444",
  });
  if (staged) {
    for (const [path, content] of Object.entries(staged)) {
      ops.addFile(`.soulguard-staging/${path}`, content, {
        owner: "agent",
        group: "staff",
        mode: "644",
      });
    }
  }
  return ops;
}

describe("getPendingChanges", () => {
  it("returns empty when no staged changes exist", async () => {
    const ops = setupOps();
    const result = await getPendingChanges({ ops, config: baseConfig });
    expect(result.files).toEqual([]);
  });

  it("detects a modified staged file", async () => {
    const ops = setupOps({ "SOUL.md": "modified soul" });
    const result = await getPendingChanges({ ops, config: baseConfig });
    expect(result.files).toEqual(["SOUL.md"]);
  });

  it("detects multiple staged files", async () => {
    const ops = setupOps({ "SOUL.md": "mod1", "AGENTS.md": "mod2" });
    const result = await getPendingChanges({ ops, config: baseConfig });
    expect(result.files.sort()).toEqual(["AGENTS.md", "SOUL.md"]);
  });

  it("ignores unchanged staged files (same content)", async () => {
    const ops = setupOps({ "SOUL.md": "soul content" });
    const result = await getPendingChanges({ ops, config: baseConfig });
    expect(result.files).toEqual([]);
  });
});

describe("buildPendingChangesContext", () => {
  it("returns undefined when no pending changes", async () => {
    const ops = setupOps();
    const result = await buildPendingChangesContext({ ops, config: baseConfig });
    expect(result).toBeUndefined();
  });

  it("returns context string when there are pending changes", async () => {
    const ops = setupOps({ "SOUL.md": "modified" });
    const result = await buildPendingChangesContext({ ops, config: baseConfig });
    expect(result).toBeDefined();
    expect(result).toContain("[Soulguard]");
    expect(result).toContain("1 protected file(s)");
    expect(result).toContain("SOUL.md");
    expect(result).toContain("soulguard diff");
    expect(result).toContain("soulguard reset");
  });

  it("lists multiple files", async () => {
    const ops = setupOps({ "SOUL.md": "mod1", "AGENTS.md": "mod2" });
    const result = await buildPendingChangesContext({ ops, config: baseConfig });
    expect(result).toContain("2 protected file(s)");
    expect(result).toContain("SOUL.md");
    expect(result).toContain("AGENTS.md");
  });
});
