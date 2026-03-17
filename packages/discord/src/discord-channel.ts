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

// ── Helpers ────────────────────────────────────────────────────────────

/** Count added/removed lines in a unified diff, excluding --- and +++ headers. */
function countDiffLines(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { added, removed };
}

/** Build the full diff attachment content from proposal files. */
function buildDiffAttachment(files: ProposalPayload["files"]): string {
  return files.map((f) => `# ${f.path} (${f.status})\n${f.diff || ""}`).join("\n\n");
}

// ── Implementation ─────────────────────────────────────────────────────

export class DiscordChannel implements ApprovalChannel {
  readonly name = "discord";

  private readonly _config: DiscordConfig;
  private readonly _client: Client;
  private readonly _ready: Promise<void>;
  /** Tracked proposals: messageId → expected payload for content verification. */
  private _trackedProposals = new Map<string, ProposalPayload>();
  /** Proposals posted with file attachment instead of inline diffs. */
  private _attachmentProposals = new Set<string>();

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

  /** Check whether a proposal exceeds Discord embed limits. */
  private _exceedsEmbedLimits(proposal: ProposalPayload): boolean {
    if (proposal.files.length > MAX_EMBED_FIELDS) return true;
    if (proposal.files.some((f) => (f.diff || "").length > MAX_DIFF_LENGTH)) return true;

    // Estimate total embed length
    let total = `📋 ${PROPOSAL_TITLE}`.length + `Hash: ${proposal.hash}`.length;
    for (const file of proposal.files) {
      total += `${file.status} ${file.path}`.length;
      total += `\`\`\`diff\n${file.diff || "(no diff)"}\n\`\`\``.length;
    }
    return total > MAX_EMBED_TOTAL_LENGTH;
  }

  async postProposal(proposal: ProposalPayload): Promise<PostProposalResult> {
    await this._ready;

    const channel = await this._client.channels.fetch(this._config.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error(`Channel ${this._config.channelId} is not a text channel`);
    }

    if (this._exceedsEmbedLimits(proposal)) {
      return this._postWithAttachment(channel, proposal);
    }

    const embed = new EmbedBuilder().setTitle(`📋 ${PROPOSAL_TITLE}`).setColor(SOULGUARD_COLOR);

    for (const file of proposal.files) {
      const label = `${file.status} ${file.path}`;
      const diffText = file.diff || "(no diff)";
      embed.addFields({
        name: label,
        value: `\`\`\`diff\n${diffText}\n\`\`\``,
      });
    }

    embed.setFooter({ text: `Hash: ${proposal.hash}` });

    // Final safety check — if somehow still over limit, use attachment mode
    if (embed.length > MAX_EMBED_TOTAL_LENGTH) {
      return this._postWithAttachment(channel, proposal);
    }

    const message = await channel.send({ embeds: [embed] });

    await message.react(APPROVE_EMOJI);
    await message.react(REJECT_EMOJI);

    this._trackedProposals.set(message.id, proposal);

    return { channel: "discord", proposalId: message.id };
  }

  /** Post a summary embed with a .diff file attachment for large proposals. */
  private async _postWithAttachment(
    channel: { send: (opts: any) => Promise<Message> },
    proposal: ProposalPayload,
  ): Promise<PostProposalResult> {
    const embed = new EmbedBuilder().setTitle(`📋 ${PROPOSAL_TITLE}`).setColor(SOULGUARD_COLOR);

    // Build compact file list with line counts
    const fileLines = proposal.files.map((f) => {
      if (!f.diff) return `• ${f.status} ${f.path} (no changes)`;
      const { added, removed } = countDiffLines(f.diff);
      return `• ${f.status} ${f.path} (+${added}, -${removed})`;
    });
    embed.addFields({ name: "Files Changed", value: fileLines.join("\n") });

    embed.setFooter({ text: `Hash: ${proposal.hash}` });

    const diffContent = buildDiffAttachment(proposal.files);
    const hashPrefix = proposal.hash.slice(0, 8);

    const message = await channel.send({
      embeds: [embed],
      files: [{ attachment: Buffer.from(diffContent), name: `proposal-${hashPrefix}.diff` }],
    });

    await message.react(APPROVE_EMOJI);
    await message.react(REJECT_EMOJI);

    this._trackedProposals.set(message.id, proposal);
    this._attachmentProposals.add(message.id);

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
        if (emoji !== APPROVE_EMOJI && emoji !== REJECT_EMOJI) return;

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
   * For inline proposals: checks hash + file count.
   * For attachment proposals: checks hash only (no per-file fields).
   */
  private _verifyMessageContent(msg: Message, proposalId: string): boolean {
    const expected = this._trackedProposals.get(proposalId);
    if (!expected) {
      console.warn(
        `[soulguard:discord] No tracked payload for proposal ${proposalId}, rejecting for safety`,
      );
      return false;
    }

    const embed = msg.embeds?.[0];
    if (!embed) return false;

    const footerText = embed.footer?.text ?? "";
    if (!footerText.includes(expected.hash)) return false;

    // For attachment-mode proposals, skip field count check
    if (this._attachmentProposals.has(proposalId)) {
      return true;
    }

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
        .setTitle(`${emoji} Soulguard Proposal ${result.charAt(0).toUpperCase() + result.slice(1)}`)
        .setColor(color);

      await message.edit({ embeds: [embed] });

      this._trackedProposals.delete(proposalId);
      this._attachmentProposals.delete(proposalId);

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
    this._attachmentProposals.clear();
    await this._client.destroy();
  }
}
