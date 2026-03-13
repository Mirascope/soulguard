import { describe, expect, it } from "bun:test";
import { MockSystemOps } from "../util/system-ops-mock.js";
import { MockConsoleOutput } from "../util/console-mock.js";
import { SyncCommand } from "./sync-command.js";
import { StateTree } from "../sdk/state.js";

const GUARDIAN = "soulguardian_agent";
const VAULT_MOCK = { owner: GUARDIAN, group: "soulguard", mode: "444" };
const LEDGER_MOCK = { owner: "agent", group: "soulguard", mode: "644" };

async function setup(configureMock: (ops: MockSystemOps) => void): Promise<{
  cmd: SyncCommand;
  out: MockConsoleOutput;
  ops: MockSystemOps;
}> {
  const ops = new MockSystemOps("/workspace");
  ops.addUser(GUARDIAN);
  ops.addGroup("soulguard");
  configureMock(ops);
  const out = new MockConsoleOutput();
  const config = {
    version: 1 as const,
    guardian: GUARDIAN,
    files: {
      "SOUL.md": "protect" as const,
      "memory/today.md": "watch" as const,
    },
  };
  const tree = await StateTree.buildOrThrow({ ops, config });
  return { cmd: new SyncCommand({ tree: tree, ops, config }, out), out, ops };
}

describe("SyncCommand", () => {
  it("returns 0 and shows fix when drift is corrected", async () => {
    const { cmd, out, ops } = await setup((ops) => {
      ops.addFile("SOUL.md", "soul content", { owner: "wrong", group: "soulguard", mode: "444" });
      ops.addFile("memory/today.md", "memory content", LEDGER_MOCK);
    });

    const code = await cmd.execute();

    expect(code).toBe(0);
    expect(out.hasText("🔧")).toBe(true);
    expect(out.hasText("All files now ok.")).toBe(true);
    expect(ops.ops.length).toBeGreaterThan(0);
  });

  it("returns 0 with nothing-to-fix message when all ok", async () => {
    const { cmd, out } = await setup((ops) => {
      ops.addFile("SOUL.md", "soul content", VAULT_MOCK);
      ops.addFile("memory/today.md", "memory content", LEDGER_MOCK);
    });

    const code = await cmd.execute();

    expect(code).toBe(0);
    expect(out.hasText("Nothing to fix")).toBe(true);
  });

  it("returns 0 when configured files are missing from disk", async () => {
    const { cmd, out } = await setup((ops) => {
      ops.addFile("memory/today.md", "memory content", LEDGER_MOCK);
    });

    const code = await cmd.execute();

    expect(code).toBe(0);
    expect(out.hasText("Nothing to fix")).toBe(true);
  });
});
