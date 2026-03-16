/**
 * Soulguard OpenClaw plugin — protects files from direct writes.
 */

import { readFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { parseConfig, protectPatterns } from "@soulguard/core";

import { guardToolCall } from "./guard.js";
import type {
  BeforeToolCallEvent,
  BeforeToolCallResult,
  OpenClawPluginDefinition,
} from "./openclaw-types.js";

// Injected at build time via --define (see package.json build script)
declare const SOULGUARD_VERSION: string;
const PKG_VERSION: string =
  typeof SOULGUARD_VERSION !== "undefined" ? SOULGUARD_VERSION : "0.0.0-dev";

/** Shared plugin description (plugin.json keeps its own copy). */
export const PLUGIN_DESCRIPTION = "Identity protection for AI agents";

export type SoulguardPluginOptions = {
  /** Path to soulguard.json (relative to workspace or absolute). */
  configPath?: string;
};

/**
 * Create the soulguard OpenClaw plugin definition.
 */
export function createSoulguardPlugin(options?: SoulguardPluginOptions): OpenClawPluginDefinition {
  return {
    id: "soulguard",
    name: "Soulguard",
    description: PLUGIN_DESCRIPTION,
    version: PKG_VERSION,

    activate(api) {
      // Resolve OpenClaw state dir (~/.openclaw) where soulguard.json lives.
      // Cannot use api.resolvePath — it resolves relative to process.cwd(), not the workspace.
      const stateDir = process.env.OPENCLAW_STATE_DIR?.trim() ?? join(os.homedir(), ".openclaw");
      const configFile = options?.configPath ?? "soulguard.json";
      const configPath = join(stateDir, configFile);

      // Load config
      let protectFiles: string[];
      try {
        const raw = JSON.parse(readFileSync(configPath, "utf-8"));
        protectFiles = protectPatterns(parseConfig(raw));
      } catch {
        api.logger?.warn(`soulguard: no config found at ${configPath} — plugin inactive`);
        return;
      }

      if (protectFiles.length === 0) return;

      // ── Guard hook ─────────────────────────────────────────────────
      // Block writes to protected files with a helpful message
      // guiding the agent to use soulguard CLI commands for staging.
      api.on("before_tool_call", (...args: unknown[]) => {
        const event = args[0];
        if (!event || typeof event !== "object" || !("toolName" in event)) {
          return undefined;
        }
        const e = event as BeforeToolCallEvent;
        const result = guardToolCall(e.toolName, e.params, {
          protectFiles,
          stateDir,
        });
        if (result.blocked) {
          return { block: true, blockReason: result.reason } satisfies BeforeToolCallResult;
        }
        return undefined;
      });
    },
  };
}
