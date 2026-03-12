/**
 * Discord channel configuration.
 */

import { z } from "zod";

export type DiscordConfig = {
  /** Discord bot token. */
  botToken: string;
  /** Discord channel ID to post proposals in. */
  channelId: string;
  /** Discord user IDs authorized to approve/reject proposals. */
  approverUserIds: string[];
};

export const discordConfigSchema = z.object({
  botToken: z.string().min(1),
  channelId: z.string().min(1),
  approverUserIds: z.array(z.string().min(1)).min(1),
});

export function parseDiscordConfig(raw: unknown): DiscordConfig {
  return discordConfigSchema.parse(raw);
}
