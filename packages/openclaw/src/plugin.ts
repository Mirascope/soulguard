/**
 * Soulguard OpenClaw plugin — protects vault files from direct writes.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseConfig } from "@soulguard/core";
import { guardToolCall } from "./guard.js";
import type {
  BeforeToolCallEvent,
  BeforeToolCallResult,
  OpenClawPluginDefinition,
} from "./openclaw-types.js";

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
        api.logger?.warn("soulguard: could not read soulguard.json — vault protection disabled");
        return;
      }

      if (vaultFiles.length === 0) return;

      // Register agent tools
      const execSoulguard = (cmd: string): string => {
        try {
          return execSync(`soulguard ${cmd} ${workspaceDir}`, {
            encoding: "utf-8",
            env: { ...process.env, NO_COLOR: "1" },
          });
        } catch (e) {
          const msg =
            e instanceof Error && "stdout" in e ? (e as { stdout: string }).stdout : String(e);
          return msg || `soulguard ${cmd.split(" ")[0]} failed`;
        }
      };

      api.registerTool(
        {
          name: "soulguard_status",
          description: "Check soulguard protection status of vault and ledger files",
          parameters: { type: "object", properties: {}, required: [] },
          async execute(_id, _params) {
            const output = execSoulguard("status");
            return { content: [{ type: "text", text: output }] };
          },
        },
        { optional: true },
      );

      api.registerTool(
        {
          name: "soulguard_diff",
          description: "Show differences between vault files and their staging copies",
          parameters: {
            type: "object",
            properties: {
              files: {
                type: "array",
                items: { type: "string" },
                description: "Specific files to diff (default: all vault files)",
              },
            },
            required: [],
          },
          async execute(_id, params) {
            const files =
              Array.isArray(params.files) && params.files.length > 0
                ? ` ${(params.files as string[]).join(" ")}`
                : "";
            const output = execSoulguard(`diff${files}`);
            return { content: [{ type: "text", text: output }] };
          },
        },
        { optional: true },
      );

      api.registerTool(
        {
          name: "soulguard_propose",
          description:
            "Create a vault change proposal from staging edits. Edit .soulguard/staging/ files first, then call this to propose the changes for owner approval.",
          parameters: {
            type: "object",
            properties: {
              message: { type: "string", description: "Description of the proposed changes" },
              force: { type: "boolean", description: "Replace existing proposal if one exists" },
            },
            required: [],
          },
          async execute(_id, params) {
            const msg = params.message ? ` -m "${String(params.message)}"` : "";
            const force = params.force ? " --force" : "";
            const output = execSoulguard(`propose${msg}${force}`);
            return { content: [{ type: "text", text: output }] };
          },
        },
        { optional: true },
      );

      // Register the guard hook
      api.on("before_tool_call", (...args: unknown[]) => {
        const event = args[0];
        // Defense in depth — verify event shape before casting
        if (!event || typeof event !== "object" || !("toolName" in event)) {
          return undefined;
        }
        const e = event as BeforeToolCallEvent;
        const result = guardToolCall(e.toolName, e.params, {
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
