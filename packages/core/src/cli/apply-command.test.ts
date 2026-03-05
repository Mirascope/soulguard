import { describe, expect, test } from "bun:test";
import { ApplyCommand } from "./apply-command.js";
import { MockSystemOps } from "../util/system-ops-mock.js";
import { MockConsoleOutput } from "../util/console-mock.js";
import type { SoulguardConfig, Tier } from "../util/types.js";

const WORKSPACE = "/test/workspace";

function makeMock() {
  return new MockSystemOps(WORKSPACE);
}

function makeConfig(protect: string[] = ["SOUL.md"]): SoulguardConfig {
  const files: Record<string, Tier> = {};
  for (const p of protect) files[p] = "protect";
  return { version: 1, files };
}

describe("ApplyCommand", () => {
  test("--yes and --hash are mutually exclusive", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul");
    ops.addFile(".soulguard-staging/SOUL.md", "# Modified");

    const out = new MockConsoleOutput();
    const cmd = new ApplyCommand(
      {
        ops,
        config: makeConfig(),
        protectOwnership: { user: "soulguardian", group: "soulguard", mode: "444" },
        hash: "somehash",
        skipHashVerification: true,
      },
      out,
    );
    const exitCode = await cmd.execute();

    expect(exitCode).toBe(1);
    expect(out.hasText("Cannot use both --yes and --hash flags")).toBe(true);
  });

  test("--yes mode applies without hash verification", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul");
    ops.addFile(".soulguard-staging/SOUL.md", "# Modified");

    const out = new MockConsoleOutput();
    const cmd = new ApplyCommand(
      {
        ops,
        config: makeConfig(),
        protectOwnership: { user: "soulguardian", group: "soulguard", mode: "444" },
        skipHashVerification: true,
      },
      out,
    );
    const exitCode = await cmd.execute();

    expect(exitCode).toBe(0);
    expect(out.hasText("Applied 1 file(s)")).toBe(true);
    expect(out.hasText("SOUL.md")).toBe(true);
  });
});
