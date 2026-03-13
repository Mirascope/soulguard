import { describe, expect, test } from "bun:test";
import { ApplyCommand } from "./apply-command.js";
import { StateTree } from "../sdk/state.js";
import { MockSystemOps } from "../util/system-ops-mock.js";
import { MockConsoleOutput } from "../util/console-mock.js";
import type { SoulguardConfig, Tier } from "../util/types.js";

const WORKSPACE = "/test/workspace";
const GUARDIAN = "soulguardian_agent";

function makeMock() {
  return new MockSystemOps(WORKSPACE);
}

function makeConfig(protect: string[] = ["SOUL.md"]): SoulguardConfig {
  const files: Record<string, Tier> = {};
  for (const p of protect) files[p] = "protect";
  return { version: 1, guardian: GUARDIAN, files };
}

describe("ApplyCommand", () => {
  test("--yes and --hash are mutually exclusive", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul");
    ops.addFile(".soulguard-staging/SOUL.md", "# Modified");

    const config = makeConfig();
    const tree = await StateTree.buildOrThrow({ ops, config });
    const out = new MockConsoleOutput();
    const cmd = new ApplyCommand(
      {
        ops,
        config,
        tree,
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

    const config = makeConfig();
    const tree = await StateTree.buildOrThrow({ ops, config });
    const out = new MockConsoleOutput();
    const cmd = new ApplyCommand(
      {
        ops,
        config,
        tree,
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
