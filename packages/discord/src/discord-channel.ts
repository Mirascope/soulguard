/**
 * Discord approval channel implementation.
 *
 * Posts proposals as embeds, listens for emoji reactions from approved
 * users, and implements the security model (content verification,
 * edit detection, user ID filtering).
 */

import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ChannelType,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
} from "discord.js";
import type {
  ApprovalChannel,
  ProposalPayload,
  PostProposalResult,
  ApprovalResult,
  ProposalOutcome,
  PostResultOutcome,
} from "@soulguard/core";
import type { DiscordConfig } from "./config.js";

// ── Constants ──────────────────────────────────────────────────────────

const APPROVE_EMOJI = "✅";
const REJECT_EMOJI = "❌";
const PROPOSAL_TITLE = "Soulguard Proposal";
const SOULGUARD_COLOR = 0x5865f2;
/** Discord embed field value max is 1024 chars. Reserve space for code fences. */
const MAX_DIFF_LENGTH = 1024 - 16;

// ── Implementation ─────────────────────────────────────────────────────

export class DiscordChannel implements ApprovalChannel {
  readonly name = "discord";

  private readonly _config: DiscordConfig;
  private readonly _client: Client;
  private readonly _ready: Promise<void>;
  /** Tracked proposals: messageId → expected payload for content verification. */
  private _trackedProposals = new Map<string, ProposalPayload>();

  constructor(config: DiscordConfig) {
    this._config = config;
    this._client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
      ],
    });
    this._ready = this._login();
  }

  private async _login(): Promise<void> {
    const ready = new Promise<void>((resolve) => {
      if (this._client.isReady()) {
        resolve();
      } else {
        this._client.once("ready", () => resolve());
      }
    });
    await this._client.login(this._config.botToken);
    await ready;
  }

  async postProposal(proposal: ProposalPayload): Promise<PostProposalResult> {
    await this._ready;

    const channel = await this._client.channels.fetch(this._config.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error(`Channel ${this._config.channelId} is not a text channel`);
    }

    const embed = new EmbedBuilder().setTitle(`📋 ${PROPOSAL_TITLE}`).setColor(SOULGUARD_COLOR);

    if (proposal.description) {
      embed.setDescription(proposal.description);
    }

    for (const file of proposal.files) {
      const label = `${file.status} ${file.path}`;
      let diffText = file.diff || "(no diff)";
      if (diffText.length > MAX_DIFF_LENGTH) {
        diffText = diffText.slice(0, MAX_DIFF_LENGTH - 20) + "\n… (truncated)";
      }
      embed.addFields({
        name: label,
        value: `\`\`\`diff\n${diffText}\n\`\`\``,
      });
    }

    embed.setFooter({ text: `Hash: ${proposal.hash}` });

    const message = await channel.send({ embeds: [embed] });

    await message.react(APPROVE_EMOJI);
    await message.react(REJECT_EMOJI);

    // Track the proposal payload for content verification on approval
    this._trackedProposals.set(message.id, proposal);

    return { channel: "discord", proposalId: message.id };
  }

  async waitForApproval(proposalId: string, signal: AbortSignal): Promise<ApprovalResult> {
    await this._ready;

    if (signal.aborted) {
      const err = new Error("Aborted");
      err.name = "AbortError";
      throw err;
    }

    return new Promise<ApprovalResult>((resolve, reject) => {
      const onAbort = () => {
        cleanup();
        const err = new Error("Aborted");
        err.name = "AbortError";
        reject(err);
      };

      signal.addEventListener("abort", onAbort, { once: true });

      const onReaction = async (
        reaction: MessageReaction | PartialMessageReaction,
        user: { id: string },
      ): Promise<void> => {
        if (reaction.message.id !== proposalId) return;
        if (user.id === this._client.user?.id) return;
        if (!this._config.approverUserIds.includes(user.id)) return;

        const emoji = reaction.emoji.name;
        // Only respond to approve/reject emojis — other reactions (e.g. 🤔) are ignored
        if (emoji !== APPROVE_EMOJI && emoji !== REJECT_EMOJI) return;

        // Defense-in-depth: check if message was edited (potential tampering)
        const msg = await reaction.message.fetch();
        if (msg.editedTimestamp !== null) {
          await msg.reply("⚠️ Proposal message was edited — approval invalidated.");
          cleanup();
          resolve({
            approved: false,
            channel: "discord",
            approver: user.id,
          });
          return;
        }

        // Defense-in-depth: verify message content matches expected proposal
        if (!this._verifyMessageContent(msg, proposalId)) {
          await msg.reply("⚠️ Proposal message content mismatch — approval invalidated.");
          cleanup();
          resolve({
            approved: false,
            channel: "discord",
            approver: user.id,
          });
          return;
        }

        cleanup();
        resolve({
          approved: emoji === APPROVE_EMOJI,
          channel: "discord",
          approver: user.id,
        });
      };

      const cleanup = () => {
        signal.removeEventListener("abort", onAbort);
        this._client.off("messageReactionAdd", onReaction);
      };

      this._client.on("messageReactionAdd", onReaction);
    });
  }

  /**
   * Verify the Discord message content matches the expected proposal.
   * Checks: embed footer hash matches tracked proposal hash, file count matches.
   */
  private _verifyMessageContent(msg: Message, proposalId: string): boolean {
    const expected = this._trackedProposals.get(proposalId);
    if (!expected) {
      // No tracked proposal (e.g. after restart) — skip verification.
      // This is expected but worth logging for observability.
      console.warn(
        `[soulguard:discord] No tracked payload for proposal ${proposalId}, skipping content verification`,
      );
      return true;
    }

    const embed = msg.embeds?.[0];
    if (!embed) return false;

    // Verify hash in footer
    const footerText = embed.footer?.text ?? "";
    if (!footerText.includes(expected.hash)) return false;

    // Verify file count matches (embed fields = one per file)
    if (embed.fields.length !== expected.files.length) return false;

    return true;
  }

  async postResult(proposalId: string, result: ProposalOutcome): Promise<PostResultOutcome> {
    await this._ready;

    try {
      const channel = await this._client.channels.fetch(this._config.channelId);
      if (!channel || channel.type !== ChannelType.GuildText) {
        return { ok: false, error: `Channel ${this._config.channelId} is not a text channel` };
      }
      const message = await channel.messages.fetch(proposalId);

      const statusMap: Record<ProposalOutcome, { emoji: string; color: number }> = {
        applied: { emoji: "✅", color: 0x57f287 },
        rejected: { emoji: "❌", color: 0xed4245 },
        superseded: { emoji: "⏭️", color: 0xfee75c },
      };

      const { emoji, color } = statusMap[result];

      const existingEmbed = message.embeds[0];
      if (!existingEmbed) {
        return { ok: false, error: "No embed found on message" };
      }

      const embed = EmbedBuilder.from(existingEmbed)
        .setTitle(`${emoji} Proposal ${result.charAt(0).toUpperCase() + result.slice(1)}`)
        .setColor(color);

      await message.edit({ embeds: [embed] });

      // Clean up tracked proposal
      this._trackedProposals.delete(proposalId);

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async dispose(): Promise<void> {
    this._trackedProposals.clear();
    await this._client.destroy();
  }
}
