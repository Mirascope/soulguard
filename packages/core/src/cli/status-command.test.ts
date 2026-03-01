import { describe, expect, it } from "bun:test";
import { MockSystemOps } from "../system-ops-mock.js";
import { MockConsoleOutput } from "../console-mock.js";
import { StatusCommand } from "./status-command.js";
import type { StatusOptions } from "../status.js";

const VAULT_OWNERSHIP = { user: "soulguardian", group: "soulguard", mode: "444" };
const LEDGER_OWNERSHIP = { user: "agent", group: "soulguard", mode: "644" };
const VAULT_MOCK = { owner: "soulguardian", group: "soulguard", mode: "444" };
const LEDGER_MOCK = { owner: "agent", group: "soulguard", mode: "644" };

function setup(configureMock: (ops: MockSystemOps) => void): {
  cmd: StatusCommand;
  out: MockConsoleOutput;
} {
  const ops = new MockSystemOps("/workspace");
  configureMock(ops);
  const out = new MockConsoleOutput();
  const opts: StatusOptions = {
    config: { version: 1, protect: ["SOUL.md"], watch: ["memory/today.md"] },
    expectedProtectOwnership: VAULT_OWNERSHIP,
    expectedWatchOwnership: LEDGER_OWNERSHIP,
    ops,
  };
  return { cmd: new StatusCommand(opts, out), out };
}

describe("StatusCommand", () => {
  it("returns 0 and shows ✅ when all files ok", async () => {
    const { cmd, out } = setup((ops) => {
      ops.addFile("SOUL.md", "soul content", VAULT_MOCK);
      ops.addFile("memory/today.md", "memory content", LEDGER_MOCK);
    });

    const code = await cmd.execute();

    expect(code).toBe(0);
    expect(out.hasText("✅")).toBe(true);
    expect(out.hasText("2 files ok, 0 drifted, 0 missing")).toBe(true);
  });

  it("returns 1 and shows ⚠️ when files are drifted", async () => {
    const { cmd, out } = setup((ops) => {
      ops.addFile("SOUL.md", "soul content", { owner: "wrong", group: "soulguard", mode: "444" });
      ops.addFile("memory/today.md", "memory content", LEDGER_MOCK);
    });

    const code = await cmd.execute();

    expect(code).toBe(1);
    expect(out.hasText("⚠️")).toBe(true);
    expect(out.hasText("1 drifted")).toBe(true);
  });

  it("returns 1 and shows ❌ when files are missing", async () => {
    const { cmd, out } = setup((ops) => {
      // SOUL.md not added — missing
      ops.addFile("memory/today.md", "memory content", LEDGER_MOCK);
    });

    const code = await cmd.execute();

    expect(code).toBe(1);
    expect(out.hasText("❌")).toBe(true);
    expect(out.hasText("1 missing")).toBe(true);
  });

  it("resolves glob patterns and shows matched files", async () => {
    const ops = new MockSystemOps("/workspace");
    ops.addFile("SOUL.md", "soul content", VAULT_MOCK);
    ops.addFile("memory/day1.md", "notes", {
      owner: LEDGER_OWNERSHIP.user,
      group: LEDGER_OWNERSHIP.group,
      mode: LEDGER_OWNERSHIP.mode,
    });
    const out = new MockConsoleOutput();
    const opts: StatusOptions = {
      config: { version: 1, protect: ["SOUL.md"], watch: ["memory/*.md"] },
      expectedProtectOwnership: VAULT_OWNERSHIP,
      expectedWatchOwnership: LEDGER_OWNERSHIP,
      ops,
    };
    const cmd = new StatusCommand(opts, out);

    const code = await cmd.execute();

    expect(code).toBe(0);
    expect(out.hasText("memory/day1.md")).toBe(true);
  });
});
