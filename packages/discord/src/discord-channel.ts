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
  type TextChannel,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type User,
  type PartialUser,
  type MessageReactionEventDetails,
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

const APPROVE_EMOJI = "✅";
const REJECT_EMOJI = "❌";
/** Discord embed field value max is 1024 chars. Reserve space for code fences. */
const MAX_DIFF_LENGTH = 1024 - 16;

export class DiscordChannel implements ApprovalChannel {
  readonly name = "discord";

  private readonly _config: DiscordConfig;
  private readonly _client: Client;
  private readonly _ready: Promise<void>;
  private _trackedMessages = new Map<string, Message>();

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
    await this._client.login(this._config.botToken);
    await new Promise<void>((resolve) => {
      if (this._client.isReady()) {
        resolve();
      } else {
        this._client.once("ready", () => resolve());
      }
    });
  }

  async postProposal(proposal: ProposalPayload): Promise<PostProposalResult> {
    await this._ready;

    const channel = (await this._client.channels.fetch(this._config.channelId)) as TextChannel;

    const embed = new EmbedBuilder().setTitle("📋 Proposal for Approval").setColor(0x5865f2);

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

    this._trackedMessages.set(message.id, message);

    return { channel: "discord", proposalId: message.id };
  }

  async waitForApproval(proposalId: string, signal: AbortSignal): Promise<ApprovalResult> {
    await this._ready;

    if (signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    return new Promise<ApprovalResult>((resolve, reject) => {
      const onAbort = () => {
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      };

      signal.addEventListener("abort", onAbort, { once: true });

      const onReaction = async (
        reaction: MessageReaction | PartialMessageReaction,
        user: User | PartialUser,
        _details: MessageReactionEventDetails,
      ): Promise<void> => {
        if (reaction.message.id !== proposalId) return;
        if (user.id === this._client.user?.id) return;
        if (!this._config.approverUserIds.includes(user.id)) return;

        const emoji = reaction.emoji.name;
        if (emoji !== APPROVE_EMOJI && emoji !== REJECT_EMOJI) return;

        // Defense-in-depth: check if message was edited
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

  async postResult(proposalId: string, result: ProposalOutcome): Promise<PostResultOutcome> {
    await this._ready;

    try {
      const channel = (await this._client.channels.fetch(this._config.channelId)) as TextChannel;
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

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async dispose(): Promise<void> {
    this._trackedMessages.clear();
    await this._client.destroy();
  }
}
