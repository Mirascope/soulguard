import { describe, test, expect, beforeEach } from "bun:test";
import { registerChannel, getChannel } from "./channel-registry.js";
import type { CreateChannelFn } from "./types.js";

const REGISTRY_KEY = "__soulguard_channel_registry__";

function makeDummyFactory(name: string): CreateChannelFn {
  return () => ({
    name,
    postProposal: async () => ({ channel: name, proposalId: "p1" }),
    waitForApproval: async () => ({ approved: true, channel: name, approver: "u1" }),
    postResult: async () => ({ ok: true }),
    dispose: async () => {},
  });
}

describe("channel-registry", () => {
  beforeEach(() => {
    // Clear the registry between tests
    const g = globalThis as Record<string, unknown>;
    delete g[REGISTRY_KEY];
  });

  test("getChannel returns undefined for unregistered channel", () => {
    expect(getChannel("nonexistent")).toBeUndefined();
  });

  test("registerChannel stores and getChannel retrieves a factory", () => {
    const factory = makeDummyFactory("test");
    registerChannel("test", factory);
    expect(getChannel("test")).toBe(factory);
  });

  test("registerChannel overwrites previous registration", () => {
    const factory1 = makeDummyFactory("v1");
    const factory2 = makeDummyFactory("v2");

    registerChannel("ch", factory1);
    registerChannel("ch", factory2);
    expect(getChannel("ch")).toBe(factory2);
  });

  test("registry is stored on globalThis", () => {
    const factory = makeDummyFactory("global-test");
    registerChannel("global-test", factory);

    const registry = (globalThis as Record<string, unknown>)[REGISTRY_KEY] as Map<
      string,
      CreateChannelFn
    >;
    expect(registry).toBeInstanceOf(Map);
    expect(registry.get("global-test")).toBe(factory);
  });
});
