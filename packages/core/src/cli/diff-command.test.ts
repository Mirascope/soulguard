import { describe, expect, test } from "bun:test";
import { DiffCommand } from "./diff-command.js";
import { MockSystemOps } from "../system-ops-mock.js";
import { MockConsoleOutput } from "../console-mock.js";
import type { SoulguardConfig, Tier } from "../types.js";

const WORKSPACE = "/test/workspace";

function makeMock() {
  return new MockSystemOps(WORKSPACE);
}

function makeConfig(protect: string[] = ["SOUL.md"]): SoulguardConfig {
  const files: Record<string, Tier> = {};
  for (const p of protect) files[p] = "protect";
  return { version: 1, files };
}

describe("DiffCommand", () => {
  test("no changes → exit 0, output contains 'No changes'", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul");
    ops.addFile(".soulguard.SOUL.md", "# Soul");

    const out = new MockConsoleOutput();
    const cmd = new DiffCommand({ ops, config: makeConfig() }, out);
    const exitCode = await cmd.execute();

    expect(exitCode).toBe(0);
    expect(out.hasText("No changes")).toBe(true);
  });

  test("modified file → exit 1, output contains diff", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul\noriginal");
    ops.addFile(".soulguard.SOUL.md", "# Soul\nmodified");

    const out = new MockConsoleOutput();
    const cmd = new DiffCommand({ ops, config: makeConfig() }, out);
    const exitCode = await cmd.execute();

    expect(exitCode).toBe(1);
    expect(out.hasText("📝 SOUL.md")).toBe(true);
    expect(out.hasText("-original")).toBe(true);
    expect(out.hasText("+modified")).toBe(true);
    expect(out.hasText("1 file(s) changed")).toBe(true);
  });

  test("deleted file → exit 1, output contains deletion marker", async () => {
    const ops = makeMock();
    ops.addFile("SOUL.md", "# Soul");

    const out = new MockConsoleOutput();
    const cmd = new DiffCommand({ ops, config: makeConfig() }, out);
    const exitCode = await cmd.execute();

    expect(exitCode).toBe(1);
    expect(out.hasText("staged for deletion")).toBe(true);
  });
});
