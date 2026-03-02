import { describe, expect, it } from "bun:test";
import { MockSystemOps } from "../system-ops-mock.js";
import { MockConsoleOutput } from "../console-mock.js";
import { StatusCommand } from "./status-command.js";
import type { StatusOptions } from "../status.js";
import { Registry } from "../registry.js";

const VAULT_OWNERSHIP = { user: "soulguardian", group: "soulguard", mode: "444" };
const VAULT_MOCK = { owner: "soulguardian", group: "soulguard", mode: "444" };
const LEDGER_MOCK = { owner: "agent", group: "soulguard", mode: "644" };

async function setup(configureMock: (ops: MockSystemOps) => void): Promise<{
  cmd: StatusCommand;
  out: MockConsoleOutput;
}> {
  const ops = new MockSystemOps("/workspace");
  configureMock(ops);
  const out = new MockConsoleOutput();
  const registryResult = await Registry.load(ops);
  if (!registryResult.ok) throw new Error("Failed to load registry");
  const opts: StatusOptions = {
    config: {
      version: 1,
      files: {
        "SOUL.md": "protect",
        "memory/today.md": "watch",
      },
    },
    expectedProtectOwnership: VAULT_OWNERSHIP,
    ops,
    registry: registryResult.value,
  };
  return { cmd: new StatusCommand(opts, out), out };
}

describe("StatusCommand", () => {
  it("returns 0 and shows all-ok when files are correct", async () => {
    const { cmd, out } = await setup((ops) => {
      ops.addFile("SOUL.md", "soul content", VAULT_MOCK);
      ops.addFile("memory/today.md", "memory content", LEDGER_MOCK);
    });

    const code = await cmd.execute();

    expect(code).toBe(0);
    expect(out.hasText("All files ok")).toBe(true);
  });

  it("returns 1 and shows ⚠️ when files are drifted", async () => {
    const { cmd, out } = await setup((ops) => {
      ops.addFile("SOUL.md", "soul content", { owner: "wrong", group: "soulguard", mode: "444" });
      ops.addFile("memory/today.md", "memory content", LEDGER_MOCK);
    });

    const code = await cmd.execute();

    expect(code).toBe(1);
    expect(out.hasText("⚠️")).toBe(true);
    expect(out.hasText("1 drifted")).toBe(true);
  });

  it("returns 1 and shows ❌ when files are missing", async () => {
    const { cmd, out } = await setup((ops) => {
      ops.addFile("memory/today.md", "memory content", LEDGER_MOCK);
    });

    const code = await cmd.execute();

    expect(code).toBe(1);
    expect(out.hasText("❌")).toBe(true);
    expect(out.hasText("1 missing")).toBe(true);
  });
});
