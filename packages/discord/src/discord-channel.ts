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
/** Discord allows at most 25 fields per embed. */
const MAX_EMBED_FIELDS = 25;
/** Discord total character limit across all embeds in a message. */
const MAX_EMBED_TOTAL_LENGTH = 6000;

// ── Implementation ─────────────────────────────────────────────────────

export class DiscordChannel implements ApprovalChannel {
  readonly name = "discord";

  private readonly _config: DiscordConfig;
  private readonly _client: Client;
  private readonly _ready: Promise<void>;
  /** Tracked proposals: messageId → expected payload for content verification. */
  private _trackedProposals = new Map<string, ProposalPayload>();
  /** Proposals auto-rejected for exceeding Discord display limits. */
  private _tooLargeProposals = new Set<string>();

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

    // Check file count before building embed (addFields throws at >25)
    if (proposal.files.length > MAX_EMBED_FIELDS) {
      return this._postTooLargeEmbed(
        channel,
        proposal,
        "Too many files to display in a single Discord embed.",
      );
    }

    // Check for files whose diffs exceed the field value limit
    const oversizedFiles = proposal.files.filter((f) => (f.diff || "").length > MAX_DIFF_LENGTH);
    if (oversizedFiles.length > 0) {
      const names = oversizedFiles.map((f) => `\`${f.path}\``).join(", ");
      return this._postTooLargeEmbed(
        channel,
        proposal,
        `The following file(s) have diffs too large for a Discord embed field: ${names}`,
      );
    }

    const embed = new EmbedBuilder().setTitle(`📋 ${PROPOSAL_TITLE}`).setColor(SOULGUARD_COLOR);

    if (proposal.description) {
      embed.setDescription(proposal.description);
    }

    for (const file of proposal.files) {
      const label = `${file.status} ${file.path}`;
      const diffText = file.diff || "(no diff)";
      embed.addFields({
        name: label,
        value: `\`\`\`diff\n${diffText}\n\`\`\``,
      });
    }

    embed.setFooter({ text: `Hash: ${proposal.hash}` });

    // Check total length after building (many small diffs may still exceed 6000)
    if (embed.length > MAX_EMBED_TOTAL_LENGTH) {
      return this._postTooLargeEmbed(
        channel,
        proposal,
        "Total proposal content exceeds Discord's embed character limit.",
      );
    }

    const message = await channel.send({ embeds: [embed] });

    await message.react(APPROVE_EMOJI);
    await message.react(REJECT_EMOJI);

    // Track the proposal payload for content verification on approval
    this._trackedProposals.set(message.id, proposal);

    return { channel: "discord", proposalId: message.id };
  }

  async waitForApproval(proposalId: string, signal: AbortSignal): Promise<ApprovalResult> {
    await this._ready;

    // Auto-reject proposals that exceeded Discord's display limits
    if (this._tooLargeProposals.has(proposalId)) {
      return { approved: false, channel: "discord", approver: "system" };
    }

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

  /** Post a "too large" error embed and track for auto-rejection. */
  private async _postTooLargeEmbed(
    channel: { send: (opts: { embeds: EmbedBuilder[] }) => Promise<{ id: string }> },
    proposal: ProposalPayload,
    reason: string,
  ): Promise<PostProposalResult> {
    const fileList = proposal.files.map((f) => `\u2022 \`${f.status}\` ${f.path}`).join("\n");
    const errorEmbed = new EmbedBuilder()
      .setTitle("\u26d4 Proposal Too Large")
      .setColor(0xed4245)
      .setDescription(
        [
          reason,
          "",
          `**${proposal.files.length} file(s) changed:**`,
          fileList,
          "",
          `Use \`soulguard review ${proposal.hash}\` to review via CLI,`,
          "or have your agent split the change into smaller proposals.",
        ].join("\n"),
      )
      .setFooter({ text: `Hash: ${proposal.hash}` });

    const message = await channel.send({ embeds: [errorEmbed] });
    this._tooLargeProposals.add(message.id);
    return { channel: "discord", proposalId: message.id };
  }

  /**
   * Verify the Discord message content matches the expected proposal.
   * Checks: embed footer hash matches tracked proposal hash, file count matches.
   */
  private _verifyMessageContent(msg: Message, proposalId: string): boolean {
    const expected = this._trackedProposals.get(proposalId);
    if (!expected) {
      // No tracked proposal (e.g. after restart) — reject to force re-proposal.
      // The daemon will supersede and post a fresh proposal with a tracked payload.
      console.warn(
        `[soulguard:discord] No tracked payload for proposal ${proposalId}, rejecting for safety`,
      );
      return false;
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
    this._tooLargeProposals.clear();
    await this._client.destroy();
  }
}
