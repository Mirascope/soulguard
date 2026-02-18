/**
 * Soulguard OpenClaw plugin — protects vault files from direct writes.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseConfig } from "@soulguard/core";
import { guardToolCall } from "./guard.js";
import type {
  BeforeToolCallEvent,
  BeforeToolCallResult,
  OpenClawPluginDefinition,
} from "./openclaw-types.js";

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
    description: "Identity protection for AI agents — vault enforcement and helpful errors",
    version: "0.1.0",

    activate(api) {
      const workspaceDir = api.runtime.workspaceDir ?? ".";
      const configFile = options?.configPath ?? "soulguard.json";
      const configPath = join(workspaceDir, configFile);

      // Load config — fail gracefully if missing
      let vaultFiles: string[];
      try {
        const raw = JSON.parse(readFileSync(configPath, "utf-8"));
        const config = parseConfig(raw);
        vaultFiles = config.vault;
      } catch {
        // No config or invalid — nothing to guard
        return;
      }

      if (vaultFiles.length === 0) return;

      // Register the guard hook
      api.on("before_tool_call", (...args: unknown[]) => {
        const event = args[0] as BeforeToolCallEvent;
        const result = guardToolCall(event.toolName, event.params, {
          vaultFiles,
        });
        if (result.blocked) {
          return { block: true, blockReason: result.reason } satisfies BeforeToolCallResult;
        }
        return undefined;
      });
    },
  };
}
