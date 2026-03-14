#!/usr/bin/env node

// Pre-register plugins before the CLI module parses and executes.
// Static imports are hoisted, so we use dynamic import for the CLI to ensure
// registration completes before program.parse() runs.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { registerChannel, registerPlugin } from "@soulguard/core";
import { createChannel as discordChannel } from "@soulguard/discord";

registerChannel("discord", discordChannel);

// Register plugin paths — resolved here (in packages/soulguard) where
// workspace:^ deps are visible, not in @soulguard/core where they aren't.
const openclawPkgJson = import.meta.resolve("@soulguard/openclaw/package.json");
registerPlugin(
  "openclaw",
  dirname(openclawPkgJson.startsWith("file://") ? fileURLToPath(openclawPkgJson) : openclawPkgJson),
);

await import("@soulguard/core/cli");
