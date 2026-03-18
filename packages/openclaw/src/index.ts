/**
 * @soulguard/openclaw — OpenClaw framework plugin
 *
 * Provides:
 * - Configuration templates (default, paranoid, relaxed)
 * - before_tool_call hook to intercept writes to protected files
 * - Pending-changes context builder (for future before_prompt_build support)
 */

export { templates } from "./templates.js";
export type { TemplateName, Template } from "./templates.js";

export { createSoulguardPlugin } from "./plugin.js";
export type { SoulguardPluginOptions } from "./plugin.js";

// Default export for OpenClaw plugin discovery
import { createSoulguardPlugin } from "./plugin.js";
export default createSoulguardPlugin();

export { guardToolCall } from "./guard.js";
export type { GuardOptions, GuardResult } from "./guard.js";

export { getPendingChanges, buildPendingChangesContext } from "./context.js";
export type { PendingChangesResult } from "./context.js";

export type {
  OpenClawPluginDefinition,
  OpenClawPluginApi,
  AgentTool,
  AgentToolResult,
  AgentMessage,
  BeforeToolCallEvent,
  BeforeToolCallResult,
  ToolResultPersistEvent,
  ToolResultPersistResult,
} from "./openclaw-types.js";
