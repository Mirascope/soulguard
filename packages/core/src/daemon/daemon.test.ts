/**
 * SoulguardDaemon integration tests.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { SoulguardDaemon } from "./daemon.js";
import type { SoulguardConfig } from "../util/types.js";
import type { ApprovalChannel } from "./types.js";
import { DEFAULT_DEBOUNCE_MS, DEFAULT_BATCH_READY_TIMEOUT_MS } from "../sdk/schema.js";

function createMockChannel(): ApprovalChannel {
  return {
    name: "mock",
    postProposal: mock(() => Promise.resolve({ channel: "mock", proposalId: "p1" })),
    waitForApproval: mock(() =>
      Promise.resolve({ approved: true, channel: "mock", approver: "u1" }),
    ),
    postResult: mock(() => Promise.resolve({ ok: true })),
    dispose: mock(() => Promise.resolve()),
  };
}

function createMockOps(): any {
  return {
    readFile: mock(() => Promise.resolve({ ok: true, value: "" } as const)),
    writeFile: mock(() => Promise.resolve({ ok: true, value: undefined } as const)),
    exists: mock(() => Promise.resolve({ ok: true, value: false } as const)),
    listDir: mock(() => Promise.resolve({ ok: true, value: [] as string[] } as const)),
    hashFile: mock(() => Promise.resolve({ ok: true, value: "abc123" } as const)),
    mkdir: mock(() => Promise.resolve({ ok: true, value: undefined } as const)),
    remove: mock(() => Promise.resolve({ ok: true, value: undefined } as const)),
    rename: mock(() => Promise.resolve({ ok: true, value: undefined } as const)),
    stat: mock(() =>
      Promise.resolve({
        ok: true,
        value: { uid: 1000, gid: 1000, mode: 0o644, isDirectory: false },
      } as const),
    ),
    chown: mock(() => Promise.resolve({ ok: true, value: undefined } as const)),
    chmod: mock(() => Promise.resolve({ ok: true, value: undefined } as const)),
    exec: mock(() => Promise.resolve({ ok: true, value: { stdout: "", stderr: "" } } as const)),
  };
}

function baseConfig(overrides?: Partial<SoulguardConfig>): SoulguardConfig {
  return {
    version: 1,
    guardian: "soulguardian_test",
    files: { "SOUL.md": "protect" },
    daemon: { channel: "mock" },
    ...overrides,
  };
}

let mockChannel: ApprovalChannel;

describe("SoulguardDaemon", () => {
  beforeEach(() => {
    mockChannel = createMockChannel();
    mock.module("@soulguard/mock", () => ({
      createChannel: () => mockChannel,
    }));
  });

  test("start loads channel plugin and starts proposal manager", async () => {
    const daemon = new SoulguardDaemon({
      ops: createMockOps(),
      config: baseConfig(),
      workspaceRoot: "/workspace",
    });
    await daemon.start();
    expect(daemon.running).toBe(true);
    const pm = (daemon as any)._proposalManager;
    expect(pm).toBeTruthy();
    expect(pm.running).toBe(true);
    await daemon.stop();
  });

  test("start fails with clear error when daemon config is missing", async () => {
    const config = baseConfig();
    delete (config as Record<string, unknown>).daemon;
    const daemon = new SoulguardDaemon({
      ops: createMockOps(),
      config,
      workspaceRoot: "/workspace",
    });
    expect(daemon.start()).rejects.toThrow("Daemon configuration missing");
  });

  test("start fails with helpful message when channel package not found", async () => {
    const daemon = new SoulguardDaemon({
      ops: createMockOps(),
      config: baseConfig({ daemon: { channel: "nonexistent" } }),
      workspaceRoot: "/workspace",
    });
    expect(daemon.start()).rejects.toThrow(
      "Install @soulguard/nonexistent to use the nonexistent channel",
    );
  });

  test("stop disposes channel and proposal manager", async () => {
    const daemon = new SoulguardDaemon({
      ops: createMockOps(),
      config: baseConfig(),
      workspaceRoot: "/workspace",
    });
    await daemon.start();
    expect(daemon.running).toBe(true);
    await daemon.stop();
    expect(daemon.running).toBe(false);
    expect(mockChannel.dispose).toHaveBeenCalled();
  });

  test("stop is safe to call when not running", async () => {
    const daemon = new SoulguardDaemon({
      ops: createMockOps(),
      config: baseConfig(),
      workspaceRoot: "/workspace",
    });
    await daemon.stop();
    expect(daemon.running).toBe(false);
  });

  test("uses DEFAULT_DEBOUNCE_MS when debounceMs not in config", async () => {
    const daemon = new SoulguardDaemon({
      ops: createMockOps(),
      config: baseConfig(),
      workspaceRoot: "/workspace",
    });
    await daemon.start();
    const pm = (daemon as any)._proposalManager;
    expect(pm._debounceMs).toBe(DEFAULT_DEBOUNCE_MS);
    await daemon.stop();
  });

  test("uses DEFAULT_BATCH_READY_TIMEOUT_MS when batchReadyTimeoutMs not in config", async () => {
    const daemon = new SoulguardDaemon({
      ops: createMockOps(),
      config: baseConfig(),
      workspaceRoot: "/workspace",
    });
    await daemon.start();
    const pm = (daemon as any)._proposalManager;
    expect(pm._batchReadyTimeoutMs).toBe(DEFAULT_BATCH_READY_TIMEOUT_MS);
    await daemon.stop();
  });
});
