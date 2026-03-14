#!/usr/bin/env node

// Pre-register channel plugins before the CLI module parses and executes.
// Static imports are hoisted, so we use dynamic import for the CLI to ensure
// registration completes before program.parse() runs.
import { registerChannel } from "@soulguard/core";
import { createChannel as discordChannel } from "@soulguard/discord";

registerChannel("discord", discordChannel);

await import("@soulguard/core/cli");
