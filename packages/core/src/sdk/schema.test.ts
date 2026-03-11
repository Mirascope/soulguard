import { describe, expect, test } from "bun:test";
import { parseConfig } from "./schema.js";

describe("soulguardConfigSchema", () => {
  test("parses valid config", () => {
    const config = parseConfig({
      version: 1,
      guardian: "soulguardian_agent",
      files: {
        "SOUL.md": "protect",
        "AGENTS.md": "protect",
        "memory/**": "watch",
      },
    });
    expect(config.files).toEqual({
      "SOUL.md": "protect",
      "AGENTS.md": "protect",
      "memory/**": "watch",
    });
  });

  test("rejects missing files", () => {
    expect(() => parseConfig({ version: 1, guardian: "soulguardian_agent" })).toThrow();
  });

  test("rejects invalid tier value", () => {
    expect(() =>
      parseConfig({ version: 1, guardian: "soulguardian_agent", files: { "SOUL.md": "invalid" } }),
    ).toThrow();
  });

  test("rejects missing guardian", () => {
    expect(() => parseConfig({ version: 1, files: {} })).toThrow();
  });

  test("accepts empty files map", () => {
    const config = parseConfig({ version: 1, guardian: "soulguardian_agent", files: {} });
    expect(config.files).toEqual({});
  });
});

// ── Daemon config ──────────────────────────────────────────────────

test("parses config with daemon block", () => {
  const config = parseConfig({
    version: 1,
    guardian: "soulguardian_agent",
    files: { "SOUL.md": "protect" },
    daemon: {
      channel: "discord",
      debounceMs: 5000,
      batchReadyTimeoutMs: 600000,
      discord: {
        botToken: "xoxb-fake",
        channelId: "123456789",
        approverUserIds: ["111"],
      },
    },
  });
  expect(config.daemon).toBeDefined();
  expect(config.daemon!.channel).toBe("discord");
  expect(config.daemon!.debounceMs).toBe(5000);
  expect(config.daemon!.batchReadyTimeoutMs).toBe(600000);
  // Channel-specific config passed through
  expect((config.daemon as Record<string, unknown>).discord).toBeDefined();
});

test("parses config without daemon block (opt-in)", () => {
  const config = parseConfig({
    version: 1,
    guardian: "soulguardian_agent",
    files: { "SOUL.md": "protect" },
  });
  expect(config.daemon).toBeUndefined();
});

test("rejects daemon config without channel", () => {
  expect(() =>
    parseConfig({
      version: 1,
      guardian: "soulguardian_agent",
      files: { "SOUL.md": "protect" },
      daemon: { debounceMs: 3000 },
    }),
  ).toThrow();
});

test("rejects daemon config with negative debounceMs", () => {
  expect(() =>
    parseConfig({
      version: 1,
      guardian: "soulguardian_agent",
      files: { "SOUL.md": "protect" },
      daemon: { channel: "discord", debounceMs: -1 },
    }),
  ).toThrow();
});
