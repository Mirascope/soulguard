/**
 * InstallPluginCommand — installs a soulguard plugin into an OpenClaw workspace.
 *
 * Currently supports: "openclaw" (the @soulguard/openclaw plugin).
 *
 * Creates symlinks in ~/.openclaw/extensions/<pluginId>/ pointing at the built
 * plugin files (index.js + manifest). This matches OpenClaw's native plugin
 * discovery and ensures the directory name equals the plugin ID.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  symlinkSync,
  unlinkSync,
  lstatSync,
} from "node:fs";
import { resolve, join } from "node:path";
import type { ConsoleOutput } from "../util/console.js";
import { getPluginDir } from "./plugin-registry.js";

// ── Types ──────────────────────────────────────────────────────────────

export type InstallPluginOptions = {
  /** Plugin name (e.g. "openclaw") */
  plugin: string;
  /** Workspace path containing openclaw.json */
  workspace: string;
};

// ── Constants ──────────────────────────────────────────────────────────

/** Map of short plugin names to npm package names + manifest plugin IDs. */
const KNOWN_PLUGINS: Record<string, { packageName: string; pluginId: string; manifest: string }> = {
  openclaw: {
    packageName: "@soulguard/openclaw",
    pluginId: "soulguard",
    manifest: "openclaw.plugin.json",
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────

/** Create or replace a symlink (idempotent). */
function forceSymlink(target: string, linkPath: string): void {
  try {
    if (lstatSync(linkPath)) unlinkSync(linkPath);
  } catch {
    // doesn't exist — fine
  }
  symlinkSync(target, linkPath);
}

// ── Command ────────────────────────────────────────────────────────────

export class InstallPluginCommand {
  constructor(
    private opts: InstallPluginOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const { plugin, workspace } = this.opts;

    // Validate plugin name
    const known = KNOWN_PLUGINS[plugin];
    if (!known) {
      this.out.error(`Unknown plugin: "${plugin}"`);
      this.out.info(`Available plugins: ${Object.keys(KNOWN_PLUGINS).join(", ")}`);
      return 1;
    }

    // Check openclaw.json exists
    const openclawJsonPath = resolve(workspace, "openclaw.json");
    if (!existsSync(openclawJsonPath)) {
      this.out.error(`No openclaw.json found in ${workspace}`);
      this.out.info("This command must be run in an OpenClaw workspace.");
      return 1;
    }

    // Look up the plugin directory from the registry (pre-registered by bin/soulguard.js)
    const pluginDir = getPluginDir(plugin);
    if (!pluginDir) {
      this.out.error(`Could not resolve ${known.packageName}.`);
      this.out.info("Make sure you've run `bun run build-and-link` in the soulguard repo first.");
      return 1;
    }

    // Verify the package is built
    const distDir = resolve(pluginDir, "dist");
    const distIndex = resolve(distDir, "index.js");
    const distManifest = resolve(distDir, known.manifest);
    if (!existsSync(distIndex)) {
      this.out.error(`Plugin package found at ${pluginDir} but dist/index.js is missing.`);
      this.out.info("Run `bun run build-and-link` in the soulguard repo first.");
      return 1;
    }
    if (!existsSync(distManifest)) {
      this.out.error(`Plugin package found at ${pluginDir} but dist/${known.manifest} is missing.`);
      this.out.info("Run `bun run build-and-link` in the soulguard repo first.");
      return 1;
    }

    // Create extensions/<pluginId>/ with symlinks
    const extensionsDir = resolve(workspace, "extensions", known.pluginId);
    mkdirSync(extensionsDir, { recursive: true });

    forceSymlink(distIndex, join(extensionsDir, "index.js"));
    forceSymlink(distManifest, join(extensionsDir, known.manifest));

    // Ensure the extensions dir is treated as ESM (the bundle uses import.meta)
    const extPkgPath = join(extensionsDir, "package.json");
    if (!existsSync(extPkgPath)) {
      writeFileSync(extPkgPath, '{ "type": "module" }\n');
    }

    // Clean up any stale load.paths entries that pointed at the plugin
    let openclawConfig: Record<string, unknown>;
    try {
      openclawConfig = JSON.parse(readFileSync(openclawJsonPath, "utf-8"));
    } catch (e) {
      this.out.error(`Failed to read openclaw.json: ${e}`);
      return 1;
    }

    const plugins = (openclawConfig.plugins ?? {}) as Record<string, unknown>;
    const load = (plugins.load ?? {}) as Record<string, unknown>;
    const paths: string[] = (load.paths as string[]) ?? [];

    // Remove any paths that reference this plugin (package root or dist)
    const cleanedPaths = paths.filter((p) => p !== pluginDir && p !== distDir);

    if (cleanedPaths.length !== paths.length) {
      openclawConfig.plugins = { ...plugins, load: { ...load, paths: cleanedPaths } };
      try {
        writeFileSync(openclawJsonPath, JSON.stringify(openclawConfig, null, 2) + "\n");
      } catch (e) {
        this.out.warn(`Could not clean up stale load.paths in openclaw.json: ${e}`);
      }
    }

    this.out.success(`✓ Installed ${known.packageName} → ${extensionsDir}`);
    this.out.info("  Restart the gateway to activate: openclaw gateway restart");
    return 0;
  }
}
