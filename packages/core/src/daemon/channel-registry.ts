/**
 * Channel plugin registry.
 *
 * Uses globalThis because @soulguard/core is built as two separate bundles
 * (index.js and cli/cli.js). Module-level state isn't shared between them,
 * but globalThis is shared per-process.
 */

import type { CreateChannelFn } from "./types.js";

const REGISTRY_KEY = "__soulguard_channel_registry__";

type RegistryMap = Map<string, CreateChannelFn>;

function getRegistry(): RegistryMap {
  const g = globalThis as Record<string, unknown>;
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = new Map<string, CreateChannelFn>();
  }
  return g[REGISTRY_KEY] as RegistryMap;
}

export function registerChannel(name: string, createFn: CreateChannelFn): void {
  getRegistry().set(name, createFn);
}

export function getChannel(name: string): CreateChannelFn | undefined {
  return getRegistry().get(name);
}
