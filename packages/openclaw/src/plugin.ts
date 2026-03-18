/**
 * Soulguard OpenClaw plugin — redirects writes to protected files into the
 * staging tree so agents can propose changes without direct access.
 */

import { readFileSync } from "node:fs";
import { access, chmod, copyFile, mkdir } from "node:fs/promises";
import os from "node:os";
import { dirname, join } from "node:path";
import { parseConfig, protectPatterns } from "@soulguard/core";

import { guardToolCall } from "./guard.js";
import type {
  BeforeToolCallEvent,
  BeforeToolCallResult,
  OpenClawPluginDefinition,
  ToolResultPersistEvent,
  ToolResultPersistResult,
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

// ── Redirect correlation state ────────────────────────────────────────

const MAX_TRACKED_REDIRECTS = 1024;

type RedirectInfo = {
  originalPath: string;
  redirectedPath: string;
};

const redirectMap = new Map<string, RedirectInfo>();

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Ensure a staging copy exists, creating it from the original if needed.
 * Uses raw fs operations — no SystemOperations required.
 */
async function ensureStagingCopy(originalAbsPath: string, stagingAbsPath: string): Promise<void> {
  try {
    await access(stagingAbsPath);
    return; // already exists
  } catch {
    // doesn't exist yet — create it
  }

  await mkdir(dirname(stagingAbsPath), { recursive: true });

  try {
    await copyFile(originalAbsPath, stagingAbsPath);
    // copyFile preserves the source mode (444 for protected files).
    // The agent owns the new copy but needs write permission.
    await chmod(stagingAbsPath, 0o644);
  } catch {
    // Original doesn't exist (agent creating a new file) — let the Write tool create it
  }
}

/**
 * Build the warning message appended to tool results for redirected writes.
 */
function buildRedirectWarning(info: RedirectInfo): string {
  return (
    `\n\n[Soulguard] This edit was redirected to the staging copy at ${info.redirectedPath}. ` +
    `The original file ${info.originalPath} is protected. ` +
    "Run `soulguard diff` to review your changes. " +
    "Your owner will review and apply them."
  );
}

// ── Plugin factory ────────────────────────────────────────────────────

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
      // Redirect writes to protected files into the staging tree.
      api.on("before_tool_call", async (...args: unknown[]) => {
        const event = args[0];
        if (!event || typeof event !== "object" || !("toolName" in event)) {
          return undefined;
        }
        const e = event as BeforeToolCallEvent;
        const result = guardToolCall(e.toolName, e.params, {
          protectFiles,
          stateDir,
        });

        if (result.action === "block") {
          return { block: true, blockReason: result.reason } satisfies BeforeToolCallResult;
        }

        if (result.action === "redirect") {
          // Auto-create the staging copy from the original
          const originalAbsPath = join(stateDir, result.originalPath);
          const stagingAbsPath = result.redirectedPath.startsWith("/")
            ? result.redirectedPath
            : join(stateDir, result.redirectedPath);

          await ensureStagingCopy(originalAbsPath, stagingAbsPath);

          // Store redirect info for the tool_result_persist hook
          const toolCallId = e.toolCallId;
          if (toolCallId) {
            if (redirectMap.size >= MAX_TRACKED_REDIRECTS) {
              const oldest = redirectMap.keys().next().value;
              if (oldest) redirectMap.delete(oldest);
            }
            redirectMap.set(toolCallId, {
              originalPath: result.originalPath,
              redirectedPath: result.redirectedPath,
            });
          }

          // Rewrite the path param to point to the staging copy
          return {
            params: { [result.pathKey]: result.redirectedPath },
          } satisfies BeforeToolCallResult;
        }

        return undefined;
      });

      // ── Result annotation hook ─────────────────────────────────────
      // Append a warning to the tool result when a write was redirected.
      // This hook is synchronous — no async allowed.
      api.on("tool_result_persist", (...args: unknown[]) => {
        const event = args[0] as ToolResultPersistEvent | undefined;
        if (!event?.toolCallId || !event.message) return undefined;

        const info = redirectMap.get(event.toolCallId);
        if (!info) return undefined;

        // Consume — one-shot per tool call
        redirectMap.delete(event.toolCallId);

        const warning = buildRedirectWarning(info);
        const msg = event.message;

        // Clone content and append the warning
        type ContentBlock = { type: string; text?: string };
        const content: ContentBlock[] = Array.isArray(msg.content) ? [...msg.content] : [];
        let lastText: ContentBlock | undefined;
        for (let i = content.length - 1; i >= 0; i--) {
          const block = content[i];
          if (block && block.type === "text") {
            lastText = block;
            break;
          }
        }
        if (lastText && lastText.text != null) {
          lastText.text += warning;
        } else {
          content.push({ type: "text", text: warning.trimStart() });
        }

        return { message: { ...msg, content } } satisfies ToolResultPersistResult;
      });
    },
  };
}
