/**
 * Post-init hook for OpenClaw integration.
 *
 * Called by core `soulguard init` when openclaw.json is detected.
 * Handles template selection and plugin installation.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { writeConfig, type PostInitContext } from "@soulguard/core";
import { templates, templateToConfig, type TemplateName } from "./templates.js";

export type OnInitConsole = {
  info: (msg: string) => void;
  success: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

/**
 * Run OpenClaw-specific init steps:
 * 1. Apply a protection template
 * 2. Install the @soulguard/openclaw plugin into OpenClaw
 */
export async function onInit(ctx: PostInitContext, out: OnInitConsole): Promise<void> {
  out.info("");
  out.info("OpenClaw detected (openclaw.json found).");

  // ── 1. Apply protection template ────────────────────────────────────
  // For now, apply the default template non-interactively.
  // TODO: interactive template selection when stdin is a TTY
  const templateName: TemplateName = "default";
  const template = templates[templateName];
  const templateConfig = templateToConfig(template, ctx.config.guardian);

  // Merge template files into existing config
  const updatedConfig = {
    ...ctx.config,
    files: { ...ctx.config.files, ...templateConfig.files },
  };
  const writeResult = await writeConfig(ctx.ops, updatedConfig);
  if (writeResult.ok) {
    out.success(`✓ Applied "${templateName}" protection template (${template.description})`);
  } else {
    out.warn(`Could not apply template: ${writeResult.error.kind}`);
  }

  // ── 2. Install OpenClaw plugin ──────────────────────────────────────
  // Try `openclaw plugins install` first (works when published).
  // Fall back to plugins.load.paths with local package path.
  let installed = false;

  try {
    execSync("openclaw plugins install @soulguard/openclaw", {
      stdio: "pipe",
      timeout: 30_000,
    });
    out.success("✓ Installed @soulguard/openclaw plugin");
    installed = true;
  } catch {
    // Not published or openclaw CLI not available — try local path
  }

  if (!installed) {
    // Resolve the local @soulguard/openclaw package directory
    const localPluginDir = resolve(dirname(new URL(import.meta.url).pathname), "..");
    try {
      const openclawJsonPath = resolve(ctx.workspace, "openclaw.json");
      const openclawConfig = JSON.parse(readFileSync(openclawJsonPath, "utf-8"));

      // Add to plugins.load.paths
      const plugins = openclawConfig.plugins ?? {};
      const load = plugins.load ?? {};
      const paths: string[] = load.paths ?? [];

      if (!paths.includes(localPluginDir)) {
        paths.push(localPluginDir);
      }

      openclawConfig.plugins = { ...plugins, load: { ...load, paths } };
      writeFileSync(openclawJsonPath, JSON.stringify(openclawConfig, null, 2) + "\n");
      out.success(`✓ Added soulguard plugin to openclaw.json (local: ${localPluginDir})`);
      installed = true;
    } catch (e) {
      out.warn(`Could not configure plugin automatically: ${e}`);
    }
  }

  if (installed) {
    out.info("  Restart the gateway to activate: openclaw gateway restart");
  }
}
