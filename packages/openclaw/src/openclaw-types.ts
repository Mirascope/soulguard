/**
 * Minimal types from the OpenClaw plugin API.
 *
 * We vendor just the surface soulguard touches so the package has zero
 * runtime dependency on openclaw itself.
 */

export type OpenClawPluginDefinition = {
  id?: string;
  name?: string;
  description?: string;
  version?: string;
  register?: (api: OpenClawPluginApi) => void | Promise<void>;
  activate?: (api: OpenClawPluginApi) => void | Promise<void>;
};

export type OpenClawPluginApi = {
  on: (hookName: string, handler: (...args: unknown[]) => unknown) => void;
  registerTool: (tool: AgentTool, opts?: { optional?: boolean }) => void;
  config: Record<string, unknown>;
  runtime: { workspaceDir?: string };
  logger?: { warn: (msg: string) => void; error: (msg: string) => void };
};

export type AgentTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (id: string, params: Record<string, unknown>) => Promise<AgentToolResult>;
};

export type AgentToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

export type BeforeToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
};

export type BeforeToolCallResult = {
  block?: boolean;
  blockReason?: string;
};
