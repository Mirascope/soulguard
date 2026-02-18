/**
 * Soulguard OpenClaw plugin — protects vault files from direct writes.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { status, diff, parseConfig, NodeSystemOps, type SoulguardConfig } from "@soulguard/core";
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
      let config: SoulguardConfig;
      let vaultFiles: string[];
      try {
        const raw = JSON.parse(readFileSync(configPath, "utf-8"));
        config = parseConfig(raw);
        vaultFiles = config.vault;
      } catch {
        // No config or invalid — nothing to guard
        api.logger?.warn("soulguard: could not read soulguard.json — vault protection disabled");
        return;
      }

      if (vaultFiles.length === 0) return;

      // Helper to create ops for the workspace
      const createOps = () => new NodeSystemOps(workspaceDir);

      // Status tool
      api.registerTool(
        {
          name: "soulguard_status",
          description: "Check soulguard protection status of vault and ledger files",
          parameters: { type: "object", properties: {}, required: [] },
          async execute(_id, _params) {
            const ops = createOps();
            const result = await status({
              config,
              expectedVaultOwnership: { user: "soulguardian", group: "soulguard", mode: "444" },
              // TODO: ledger ownership should come from config, not hardcoded (agent user varies per init)
              expectedLedgerOwnership: { user: "agent", group: "staff", mode: "644" },
              ops,
            });
            if (!result.ok) {
              return { content: [{ type: "text" as const, text: "Status check failed" }] };
            }
            const lines: string[] = ["Soulguard Status:", ""];
            for (const f of [...result.value.vault, ...result.value.ledger]) {
              if (f.status === "ok") lines.push(`  ✅ ${f.file.path}`);
              else if (f.status === "drifted")
                lines.push(`  ⚠️  ${f.file.path} — ${f.issues.map((i) => i.kind).join(", ")}`);
              else if (f.status === "missing") lines.push(`  ❌ ${f.path} — missing`);
              else if (f.status === "error") lines.push(`  ❌ ${f.path} — error: ${f.error.kind}`);
              else if (f.status === "glob_skipped")
                lines.push(`  ⏭️  ${f.pattern} — glob (skipped)`);
            }
            if (result.value.issues.length === 0) lines.push("", "All files ok.");
            else lines.push("", `${result.value.issues.length} issue(s) found.`);
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          },
        },
        { optional: true },
      );

      // Diff tool
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
                  { type: "text" as const, text: "No differences — staging matches vault." },
                ],
              };
            }
            const text = result.value.files
              .filter((d) => d.status === "modified" && d.diff)
              .map((d) => `--- ${d.path}\n${d.diff}`)
              .join("\n\n");
            return { content: [{ type: "text" as const, text: text || "No modified files." }] };
          },
        },
        { optional: true },
      );

      // Propose tool — uses sudo since propose needs elevated permissions
      api.registerTool(
        {
          name: "soulguard_propose",
          description:
            "Create a vault change proposal from staging edits. Edit .soulguard/staging/ files first, then call this to propose changes for owner approval.",
          parameters: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "Description of the proposed changes",
              },
            },
            required: [],
          },
          async execute(_id, params) {
            try {
              const args = ["soulguard", "propose", workspaceDir];
              if (params.message) args.push("-m", String(params.message));
              const output = execFileSync("sudo", args, {
                encoding: "utf-8",
                env: { ...process.env, NO_COLOR: "1" },
                timeout: 5_000, // prevent blocking if sudo hangs (no tty)
              });
              return { content: [{ type: "text" as const, text: output }] };
            } catch (e) {
              const msg =
                e instanceof Error && "stdout" in e ? (e as { stdout: string }).stdout : String(e);
              return { content: [{ type: "text" as const, text: msg || "Propose failed" }] };
            }
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
