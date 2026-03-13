import { describe, expect, it } from "bun:test";
import { MockSystemOps } from "../util/system-ops-mock.js";
import { MockConsoleOutput } from "../util/console-mock.js";
import { StatusCommand } from "./status-command.js";
import { StateTree } from "../sdk/state.js";

const GUARDIAN = "soulguardian_agent";
const VAULT_MOCK = { owner: GUARDIAN, group: "soulguard", mode: "444" };
const LEDGER_MOCK = { owner: "agent", group: "soulguard", mode: "644" };

async function setup(
  configureMock: (ops: MockSystemOps) => void,
  files: Record<string, "protect" | "watch"> = {
    "SOUL.md": "protect",
    "memory/today.md": "watch",
  },
): Promise<{
  cmd: StatusCommand;
  out: MockConsoleOutput;
}> {
  const ops = new MockSystemOps("/workspace");
  configureMock(ops);
  const out = new MockConsoleOutput();
  const config = { version: 1 as const, guardian: GUARDIAN, files };
  const tree = await StateTree.buildOrThrow({ ops, config });
  return { cmd: new StatusCommand({ tree, ops }, out), out };
}

describe("StatusCommand", () => {
  it("returns 0 and shows all-ok when no drifts or changes", async () => {
    const { cmd, out } = await setup((ops) => {
      ops.addFile("SOUL.md", "soul content", VAULT_MOCK);
      ops.addFile("memory/today.md", "memory content", LEDGER_MOCK);
    });

    const code = await cmd.execute();

    expect(code).toBe(0);
    expect(out.hasText("All files ok")).toBe(true);
  });

  it("returns 1 and shows drift when file has wrong owner", async () => {
    const { cmd, out } = await setup((ops) => {
      ops.addFile("SOUL.md", "soul content", { owner: "wrong", group: "soulguard", mode: "444" });
      ops.addFile("memory/today.md", "memory content", LEDGER_MOCK);
    });

    const code = await cmd.execute();

    expect(code).toBe(1);
    expect(out.hasText("⚠️")).toBe(true);
    expect(out.hasText("1 drifted")).toBe(true);
  });

  it("returns 0 when config entry has no file on disk", async () => {
    const { cmd, out } = await setup((ops) => {
      ops.addFile("memory/today.md", "memory content", LEDGER_MOCK);
    });

    const code = await cmd.execute();

    expect(code).toBe(0);
    expect(out.hasText("All files ok")).toBe(true);
  });

  it("shows staged changes as info", async () => {
    const { cmd, out } = await setup((ops) => {
      ops.addFile("SOUL.md", "soul content", VAULT_MOCK);
      ops.addFile(".soulguard-staging/SOUL.md", "updated", LEDGER_MOCK);
      ops.addFile("memory/today.md", "memory content", LEDGER_MOCK);
    });

    const code = await cmd.execute();

    expect(code).toBe(0);
    expect(out.hasText("staged SOUL.md")).toBe(true);
  });

  it("shows staged directory changes per file", async () => {
    const { cmd, out } = await setup(
      (ops) => {
        ops.addDirectory("skills", { owner: GUARDIAN, group: "soulguard", mode: "555" });
        ops.addFile("skills/a.md", "a", VAULT_MOCK);
        ops.addDirectory(".soulguard-staging/skills", {
          owner: "agent",
          group: "staff",
          mode: "755",
        });
        ops.addFile(".soulguard-staging/skills/a.md", "updated a", LEDGER_MOCK);
        ops.addFile(".soulguard-staging/skills/b.md", "new b", LEDGER_MOCK);
      },
      { "skills/": "protect" },
    );

    const code = await cmd.execute();

    expect(code).toBe(0);
    expect(out.hasText("staged skills/a.md")).toBe(true);
    expect(out.hasText("staged (new) skills/b.md")).toBe(true);
  });

  it("returns 0 when only staged changes exist (no drift)", async () => {
    const { cmd, out } = await setup((ops) => {
      ops.addFile("SOUL.md", "soul content", VAULT_MOCK);
      ops.addFile(".soulguard-staging/SOUL.md", "updated", LEDGER_MOCK);
      ops.addFile("memory/today.md", "memory content", LEDGER_MOCK);
    });

    const code = await cmd.execute();

    expect(code).toBe(0);
  });
});
