/**
 * @soulguard/discord — Discord approval channel for SoulGuard.
 *
 * Exports createChannel as required by the channel plugin convention.
 */

import type { CreateChannelFn } from "@soulguard/core";
import { DiscordChannel } from "./discord-channel.js";
import { parseDiscordConfig } from "./config.js";

export const createChannel: CreateChannelFn = (config: unknown) => {
  const parsed = parseDiscordConfig(config);
  return new DiscordChannel(parsed);
};

export { DiscordChannel } from "./discord-channel.js";
export { parseDiscordConfig, discordConfigSchema } from "./config.js";
export type { DiscordConfig } from "./config.js";
