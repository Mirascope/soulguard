/**
 * DiscordChannel tests.
 *
 * Mocks discord.js at the module level so DiscordChannel always
 * constructs its own client (no injection).
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { EventEmitter } from "events";
import { parseDiscordConfig } from "./config.js";

// ── Mock Discord.js primitives ──────────────────────────────────────

class MockMessage {
  id: string;
  embeds: any[] = [];
  editedTimestamp: number | null = null;

  constructor(id: string) {
    this.id = id;
  }

  react = mock(async (_emoji: string) => {});
  edit = mock(async (opts: any) => {
    if (opts.embeds) this.embeds = opts.embeds;
  });
  reply = mock(async (_content: string) => {});
  fetch = mock(async () => this);
}

class MockMessageManager {
  private _messages = new Map<string, MockMessage>();

  add(msg: MockMessage) {
    this._messages.set(msg.id, msg);
  }

  fetch = mock(async (id: string) => {
    const msg = this._messages.get(id);
    if (!msg) throw new Error(`Message ${id} not found`);
    return msg;
  });
}

class MockTextChannel {
  id: string;
  messages: MockMessageManager;
  private _nextMessageId: string;

  constructor(id: string, nextMessageId: string) {
    this.id = id;
    this.messages = new MockMessageManager();
    this._nextMessageId = nextMessageId;
  }

  send = mock(async (opts: any) => {
    const msg = new MockMessage(this._nextMessageId);
    msg.embeds = opts.embeds ?? [];
    this.messages.add(msg);
    return msg;
  });
}

class MockClient extends EventEmitter {
  user = { id: "bot-user-123" };
  private _channels = new Map<string, MockTextChannel>();

  constructor(_opts?: any) {
    super();
  }

  isReady() {
    return true;
  }

  addChannel(ch: MockTextChannel) {
    this._channels.set(ch.id, ch);
  }

  login = mock(async (_token: string) => {
    // Emit ready on next tick to match real client behavior
    setTimeout(() => this.emit("ready"), 0);
  });

  channels = {
    fetch: mock(async (id: string) => {
      const ch = this._channels.get(id);
      if (!ch) throw new Error(`Channel ${id} not found`);
      return ch;
    }),
  };

  destroy = mock(async () => {});
}

// Capture the mock client instance created during construction
let lastMockClient: MockClient;

// Real EmbedBuilder is fine — it's just a data structure
import { EmbedBuilder, GatewayIntentBits } from "discord.js";

mock.module("discord.js", () => ({
  Client: class extends MockClient {
    constructor(opts?: any) {
      super(opts);
      lastMockClient = this as any;
    }
  },
  GatewayIntentBits,
  EmbedBuilder,
}));

// ── Helpers ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  botToken: "test-token",
  channelId: "channel-1",
  approverUserIds: ["user-1", "user-2"],
};

function makeProposal(overrides?: Partial<import("@soulguard/core").ProposalPayload>) {
  return {
    files: [
      {
        path: "src/index.ts",
        status: "modified" as const,
        diff: "- old\n+ new",
      },
    ],
    hash: "abc123hash",
    ...overrides,
  };
}

function makeReaction(messageId: string, emoji: string, editedTimestamp: number | null = null) {
  const replyMock = mock(async () => {});
  return {
    reaction: {
      message: {
        id: messageId,
        fetch: async () => ({ editedTimestamp, reply: replyMock }),
      },
      emoji: { name: emoji },
    },
    replyMock,
  };
}

async function createChannel(configOverrides?: Partial<typeof DEFAULT_CONFIG>) {
  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  const textChannel = new MockTextChannel(config.channelId, "msg-1");

  const { DiscordChannel } = await import("./discord-channel.js");
  const channel = new DiscordChannel(config);

  // Wait for login/ready
  await new Promise((r) => setTimeout(r, 10));

  // Wire up the text channel on the mock client
  lastMockClient.addChannel(textChannel);

  return { channel, client: lastMockClient, textChannel };
}

/** Emit a reaction on the next microtask (after listener is registered). */
function emitReactionSoon(client: MockClient, reaction: any, user: { id: string }) {
  setTimeout(() => client.emit("messageReactionAdd", reaction, user), 5);
}

// ── Tests ───────────────────────────────────────────────────────────

describe("DiscordChannel", () => {
  test("posts embed with per-file diffs and hash", async () => {
    const { channel, textChannel } = await createChannel();
    const proposal = makeProposal();

    const result = await channel.postProposal(proposal);

    expect(result.channel).toBe("discord");
    expect(result.proposalId).toBe("msg-1");
    expect(textChannel.send).toHaveBeenCalledTimes(1);

    const sentOpts = textChannel.send.mock.calls[0]![0];
    const embed = sentOpts.embeds[0];
    const footerText = embed.data?.footer?.text ?? embed.footer?.text;
    expect(footerText).toContain("abc123hash");
  });

  test("includes description in embed when provided", async () => {
    const { channel, textChannel } = await createChannel();
    const proposal = makeProposal({ description: "Fix the bug" });

    await channel.postProposal(proposal);

    const sentOpts = textChannel.send.mock.calls[0]![0];
    const embed = sentOpts.embeds[0];
    const desc = embed.data?.description ?? embed.description;
    expect(desc).toBe("Fix the bug");
  });

  test("handles large diffs (truncation)", async () => {
    const { channel, textChannel } = await createChannel();
    const largeDiff = "x".repeat(2000);
    const proposal = makeProposal({
      files: [{ path: "big.ts", status: "modified", diff: largeDiff }],
    });

    await channel.postProposal(proposal);

    const sentOpts = textChannel.send.mock.calls[0]![0];
    const embed = sentOpts.embeds[0];
    const fields = embed.data?.fields ?? embed.fields ?? [];
    expect(fields[0].value.length).toBeLessThanOrEqual(1024);
    expect(fields[0].value).toContain("truncated");
  });

  test("resolves with approved=true on ✅ from approved user", async () => {
    const { channel, client } = await createChannel();
    const { proposalId } = await channel.postProposal(makeProposal());

    const ac = new AbortController();
    const { reaction } = makeReaction(proposalId, "✅");

    const promise = channel.waitForApproval(proposalId, ac.signal);
    emitReactionSoon(client, reaction, { id: "user-1" });

    const result = await promise;
    expect(result.approved).toBe(true);
    expect(result.channel).toBe("discord");
    expect(result.approver).toBe("user-1");
  });

  test("resolves with approved=false on ❌ from approved user", async () => {
    const { channel, client } = await createChannel();
    const { proposalId } = await channel.postProposal(makeProposal());

    const ac = new AbortController();
    const { reaction } = makeReaction(proposalId, "❌");

    const promise = channel.waitForApproval(proposalId, ac.signal);
    emitReactionSoon(client, reaction, { id: "user-2" });

    const result = await promise;
    expect(result.approved).toBe(false);
    expect(result.approver).toBe("user-2");
  });

  test("ignores reactions from unauthorized users", async () => {
    const { channel, client } = await createChannel();
    const { proposalId } = await channel.postProposal(makeProposal());

    const ac = new AbortController();
    const { reaction: badReaction } = makeReaction(proposalId, "✅");
    const { reaction: goodReaction } = makeReaction(proposalId, "✅");

    const promise = channel.waitForApproval(proposalId, ac.signal);

    setTimeout(() => {
      client.emit("messageReactionAdd", badReaction, { id: "random-user" });
      setTimeout(() => client.emit("messageReactionAdd", goodReaction, { id: "user-1" }), 5);
    }, 5);

    const result = await promise;
    expect(result.approver).toBe("user-1");
  });

  test("ignores bot's own reactions", async () => {
    const { channel, client } = await createChannel();
    const { proposalId } = await channel.postProposal(makeProposal());

    const ac = new AbortController();
    const { reaction: botReaction } = makeReaction(proposalId, "✅");
    const { reaction: userReaction } = makeReaction(proposalId, "✅");

    const promise = channel.waitForApproval(proposalId, ac.signal);

    setTimeout(() => {
      client.emit("messageReactionAdd", botReaction, { id: "bot-user-123" });
      setTimeout(() => client.emit("messageReactionAdd", userReaction, { id: "user-1" }), 5);
    }, 5);

    const result = await promise;
    expect(result.approver).toBe("user-1");
  });

  test("invalidates proposal if message was edited", async () => {
    const { channel, client } = await createChannel();
    const { proposalId } = await channel.postProposal(makeProposal());

    const ac = new AbortController();
    const { reaction, replyMock } = makeReaction(proposalId, "✅", Date.now());

    const promise = channel.waitForApproval(proposalId, ac.signal);
    emitReactionSoon(client, reaction, { id: "user-1" });

    const result = await promise;
    expect(result.approved).toBe(false);
    expect(replyMock).toHaveBeenCalled();
  });

  test("waitForApproval throws on abort signal", async () => {
    const { channel } = await createChannel();
    const { proposalId } = await channel.postProposal(makeProposal());

    const ac = new AbortController();
    const promise = channel.waitForApproval(proposalId, ac.signal);

    ac.abort();

    await expect(promise).rejects.toThrow("Aborted");
  });

  test("edits original message with applied outcome", async () => {
    const { channel, textChannel } = await createChannel();
    const { proposalId } = await channel.postProposal(makeProposal());

    const result = await channel.postResult(proposalId, "applied");
    expect(result.ok).toBe(true);

    const msg = await textChannel.messages.fetch(proposalId);
    expect(msg.edit).toHaveBeenCalled();
  });

  test("edits original message with rejected outcome", async () => {
    const { channel } = await createChannel();
    const { proposalId } = await channel.postProposal(makeProposal());

    const result = await channel.postResult(proposalId, "rejected");
    expect(result.ok).toBe(true);
  });

  test("edits original message with superseded outcome", async () => {
    const { channel } = await createChannel();
    const { proposalId } = await channel.postProposal(makeProposal());

    const result = await channel.postResult(proposalId, "superseded");
    expect(result.ok).toBe(true);
  });

  test("returns ok=false if message edit fails", async () => {
    const { channel, textChannel } = await createChannel();
    await channel.postProposal(makeProposal());

    textChannel.messages.fetch = mock(async () => {
      throw new Error("Not found");
    });

    const result = await channel.postResult("nonexistent-msg", "applied");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Not found");
  });

  test("disconnects Discord client", async () => {
    const { channel, client } = await createChannel();

    await channel.dispose();

    expect(client.destroy).toHaveBeenCalledTimes(1);
  });
});

describe("DiscordConfig", () => {
  test("validates valid config", () => {
    const config = parseDiscordConfig({
      botToken: "token",
      channelId: "123",
      approverUserIds: ["user-1"],
    });
    expect(config.botToken).toBe("token");
  });

  test("rejects missing botToken", () => {
    expect(() => parseDiscordConfig({ channelId: "123", approverUserIds: ["u1"] })).toThrow();
  });

  test("rejects empty approverUserIds", () => {
    expect(() =>
      parseDiscordConfig({
        botToken: "token",
        channelId: "123",
        approverUserIds: [],
      }),
    ).toThrow();
  });
});
