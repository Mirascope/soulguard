/**
 * @soulguard/openclaw — OpenClaw framework plugin
 *
 * Provides:
 * - Configuration templates (default, paranoid, relaxed)
 * - before_tool_call hooks to intercept writes to vault files
 * - Cron and extension directory gating
 */

export { templates, defaultTemplate, paranoidTemplate, relaxedTemplate } from "./templates.js";
export type { TemplateName, Template } from "./templates.js";

export { createSoulguardPlugin } from "./plugin.js";
export type { SoulguardPluginOptions } from "./plugin.js";

export { guardToolCall } from "./guard.js";
export type { GuardOptions, GuardResult } from "./guard.js";

export type {
  OpenClawPluginDefinition,
  OpenClawPluginApi,
  AgentTool,
  AgentToolResult,
  BeforeToolCallEvent,
  BeforeToolCallResult,
} from "./openclaw-types.js";
