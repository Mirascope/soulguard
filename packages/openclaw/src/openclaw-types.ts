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
  config: Record<string, unknown>;
  runtime: { workspaceDir?: string };
};

export type BeforeToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
};

export type BeforeToolCallResult = {
  block?: boolean;
  blockReason?: string;
};
