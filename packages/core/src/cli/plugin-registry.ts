/**
 * Plugin path registry.
 *
 * Same pattern as the channel registry — uses globalThis because @soulguard/core
 * is built as two separate bundles (index.js and cli/cli.js). The entrypoint in
 * packages/soulguard registers plugin paths before the CLI module runs.
 */

const REGISTRY_KEY = "__soulguard_plugin_registry__";

type RegistryMap = Map<string, string>;

function getRegistry(): RegistryMap {
  const g = globalThis as Record<string, unknown>;
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = new Map<string, string>();
  }
  return g[REGISTRY_KEY] as RegistryMap;
}

/** Register a plugin's resolved directory path (called from bin/soulguard.js). */
export function registerPlugin(name: string, dir: string): void {
  getRegistry().set(name, dir);
}

/** Look up a registered plugin directory. */
export function getPluginDir(name: string): string | undefined {
  return getRegistry().get(name);
}
