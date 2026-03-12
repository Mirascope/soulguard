/**
 * Soulguard OpenClaw plugin — protects files from direct writes
 * and injects context about pending staged changes.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseConfig, NodeSystemOps, protectPatterns, type SoulguardConfig } from "@soulguard/core";

import { guardToolCall } from "./guard.js";
import { buildPendingChangesContext } from "./context.js";
import type {
  BeforeToolCallEvent,
  BeforeToolCallResult,
  OpenClawPluginDefinition,
} from "./openclaw-types.js";

// Read version from package.json to stay in sync with the monorepo
const PKG_VERSION = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf-8"))
  .version as string;

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
      const workspaceDir = api.resolvePath?.(".") ?? api.runtime.workspaceDir ?? ".";
      const configFile = options?.configPath ?? "soulguard.json";
      const configPath = api.resolvePath?.(configFile) ?? join(workspaceDir, configFile);

      // Load config
      let config: SoulguardConfig;
      let protectFiles: string[];
      try {
        const raw = JSON.parse(readFileSync(configPath, "utf-8"));
        config = parseConfig(raw);
        protectFiles = protectPatterns(config);
      } catch {
        api.logger?.warn("soulguard: no soulguard.json found — plugin inactive");
        return;
      }

      if (protectFiles.length === 0) return;

      const createOps = () => new NodeSystemOps(workspaceDir);
      const hookFn = api.registerHook ?? api.on;

      // ── Hooks ──────────────────────────────────────────────────────

      // Guard: block writes to protected files with a helpful message
      // guiding the agent to use soulguard CLI commands for staging.
      hookFn("before_tool_call", (...args: unknown[]) => {
        const event = args[0];
        if (!event || typeof event !== "object" || !("toolName" in event)) {
          return undefined;
        }
        const e = event as BeforeToolCallEvent;
        const result = guardToolCall(e.toolName, e.params, {
          protectFiles,
        });
        if (result.blocked) {
          return { block: true, blockReason: result.reason } satisfies BeforeToolCallResult;
        }
        return undefined;
      });

      // Context injection: notify agent of pending staged changes.
      // Only fires when there are actual pending changes — zero context
      // pollution on normal turns.
      hookFn("before_prompt_build", async (..._args: unknown[]) => {
        const ops = createOps();
        const context = await buildPendingChangesContext({ ops, config });
        if (!context) return undefined;
        return { prependContext: context };
      });
    },
  };
}
