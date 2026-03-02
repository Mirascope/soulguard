/**
 * Soulguard OpenClaw plugin — protects protect files from direct writes.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  status,
  Registry,
  diff,
  parseConfig,
  NodeSystemOps,
  protectPatterns,
  type SoulguardConfig,
} from "@soulguard/core";

/** OpenClaw-specific default config — also protects openclaw.json */
const OPENCLAW_DEFAULT_CONFIG: SoulguardConfig = {
  version: 1 as const,
  files: {
    "openclaw.json": "protect",
    "soulguard.json": "protect",
  },
};
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
      const workspaceDir = api.resolvePath?.(".") ?? api.runtime.workspaceDir ?? ".";
      const configFile = options?.configPath ?? "soulguard.json";
      const configPath = api.resolvePath?.(configFile) ?? join(workspaceDir, configFile);

      // Load config — fall back to OpenClaw defaults if missing
      let config: SoulguardConfig;
      let protectFiles: string[];
      try {
        const raw = JSON.parse(readFileSync(configPath, "utf-8"));
        config = parseConfig(raw);
        protectFiles = protectPatterns(config);
      } catch {
        // No config file — use OpenClaw defaults (includes openclaw.json)
        config = OPENCLAW_DEFAULT_CONFIG;
        protectFiles = protectPatterns(config);
        api.logger?.warn("soulguard: no soulguard.json found — using OpenClaw defaults");
      }

      if (protectFiles.length === 0) return;

      // Helper to create ops for the workspace
      const createOps = () => new NodeSystemOps(workspaceDir);

      // Status tool
      api.registerTool(
        {
          name: "soulguard_status",
          description: "Check soulguard protection status of protect and watch files",
          parameters: { type: "object", properties: {}, required: [] },
          async execute(_id, _params) {
            const ops = createOps();
            const registryResult = await Registry.load(ops);
            if (!registryResult.ok) {
              return { content: [{ type: "text" as const, text: "Failed to load registry" }] };
            }
            const result = await status({
              config,
              expectedProtectOwnership: { user: "soulguardian", group: "soulguard", mode: "444" },
              ops,
              registry: registryResult.value,
            });
            if (!result.ok) {
              return { content: [{ type: "text" as const, text: "Status check failed" }] };
            }
            const lines: string[] = ["Soulguard Status:", ""];
            const { issues } = result.value;
            if (issues.length === 0) {
              lines.push("All files ok.");
            } else {
              for (const f of issues) {
                if (f.status === "drifted")
                  lines.push(
                    `  ⚠️  ${f.file.path} — ${f.issues.map((i: { kind: string }) => i.kind).join(", ")}`,
                  );
                else if (f.status === "missing") lines.push(`  ❌ ${f.path} — missing`);
                else if (f.status === "error")
                  lines.push(`  ❌ ${f.path} — error: ${f.error.kind}`);
                else if (f.status === "orphaned") lines.push(`  🔓 ${f.path} — orphaned`);
              }
              lines.push("", `${issues.length} issue(s) found.`);
            }
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          },
        },
        { optional: true },
      );

      // Diff tool
      api.registerTool(
        {
          name: "soulguard_diff",
          description: "Show differences between protect files and their staging copies",
          parameters: {
            type: "object",
            properties: {
              files: {
                type: "array",
                items: { type: "string" },
                description: "Specific files to diff (default: all protect files)",
              },
            },
            required: [],
          },
          async execute(_id, params) {
            const ops = createOps();
            const files = Array.isArray(params.files) ? (params.files as string[]) : undefined;
            const result = await diff({ ops, config, files });
            if (!result.ok) {
              return {
                content: [{ type: "text" as const, text: `Diff failed: ${result.error.kind}` }],
              };
            }
            if (!result.value.hasChanges) {
              return {
                content: [
                  { type: "text" as const, text: "No differences — staging matches protect." },
                ],
              };
            }
            const lines = result.value.files
              .filter((d) => d.status === "modified" && d.diff)
              .map((d) => `--- ${d.path}\n${d.diff}`);
            let text = lines.join("\n\n") || "No modified files.";
            if (result.value.approvalHash) {
              text += `\n\n────────────────────────────────────────\nApproval hash: ${result.value.approvalHash}\nTo apply: soulguard apply --hash ${result.value.approvalHash}`;
            }
            return { content: [{ type: "text" as const, text }] };
          },
        },
        { optional: true },
      );

      // Register the guard hook
      // Use registerHook (OpenClaw's actual API) with fallback to on()
      const hookFn = api.registerHook ?? api.on;
      hookFn("before_tool_call", (...args: unknown[]) => {
        const event = args[0];
        // Defense in depth — verify event shape before casting
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
    },
  };
}
