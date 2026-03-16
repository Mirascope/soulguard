/**
 * Interactive prompts for `soulguard init`.
 *
 * Detects OpenClaw workspace and offers template selection.
 * Optionally configures the Discord approval daemon.
 * All I/O happens here — the SDK layer stays non-interactive.
 */

import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import type { ConsoleOutput } from "../util/console.js";
import type { DaemonConfig } from "../util/types.js";
import { getPluginDir } from "./plugin-registry.js";

export type TemplateName = "default" | "paranoid" | "relaxed";

export type Template = {
  name: TemplateName;
  description: string;
  protect: readonly string[];
  watch: readonly string[];
  release: readonly string[];
};

export type InitPromptResult = {
  template?: Template;
  daemonConfig?: DaemonConfig;
  installPlugin?: boolean;
  cancelled?: boolean;
};

type PickerOption<T> = { label: string; description: string; value: T };

/** Arrow-key picker. Returns the selected value, or undefined on Ctrl-C/escape. */
function pick<T>(title: string, options: PickerOption<T>[]): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    let selected = 0;
    const { stdin, stdout } = process;
    const wasRaw = stdin.isRaw;

    function render() {
      // Move cursor up to redraw (after first render)
      stdout.write(`\x1b[${options.length}A`);
      for (let i = 0; i < options.length; i++) {
        const opt = options[i]!;
        const cursor = i === selected ? ">" : " ";
        const highlight = i === selected ? "\x1b[36m" : "\x1b[2m"; // cyan vs dim
        stdout.write(
          `\x1b[2K${cursor} ${highlight}${opt.label}\x1b[0m\x1b[2m — ${opt.description}\x1b[0m\n`,
        );
      }
    }

    function cleanup() {
      stdin.setRawMode(wasRaw ?? false);
      stdin.removeListener("data", onKey);
      stdin.pause();
    }

    function onKey(data: Buffer) {
      const key = data.toString();

      // Ctrl-C or Escape
      if (key === "\x03" || key === "\x1b") {
        cleanup();
        stdout.write("\n");
        resolve(undefined);
        return;
      }

      // Enter
      if (key === "\r" || key === "\n") {
        cleanup();
        resolve(options[selected]!.value);
        return;
      }

      // Arrow up / k
      if (key === "\x1b[A" || key === "k") {
        selected = (selected - 1 + options.length) % options.length;
        render();
        return;
      }

      // Arrow down / j
      if (key === "\x1b[B" || key === "j") {
        selected = (selected + 1) % options.length;
        render();
      }
    }

    stdout.write(`${title}\n`);
    // Print initial options (first render — no cursor-up needed, so print directly)
    for (let i = 0; i < options.length; i++) {
      const opt = options[i]!;
      const cursor = i === selected ? ">" : " ";
      const highlight = i === selected ? "\x1b[36m" : "\x1b[2m";
      stdout.write(
        `${cursor} ${highlight}${opt.label}\x1b[0m\x1b[2m — ${opt.description}\x1b[0m\n`,
      );
    }

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onKey);
  });
}

/**
 * Load templates from the @soulguard/openclaw plugin (if registered).
 * Returns undefined if the plugin isn't available.
 */
async function loadTemplates(): Promise<Record<TemplateName, Template> | undefined> {
  const pluginDir = getPluginDir("openclaw");
  if (!pluginDir) return undefined;
  try {
    const mod = await import(join(pluginDir, "dist/index.js"));
    return mod.templates;
  } catch {
    return undefined;
  }
}

// ── Text prompt helpers ──────────────────────────────────────────────

/** Prompt for a yes/no answer. Returns true for yes. */
function promptYesNo(question: string, defaultYes = false): Promise<boolean> {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  return new Promise((resolve) => {
    const iface = createInterface({ input: process.stdin, output: process.stdout });
    iface.question(`${question} ${hint} `, (answer) => {
      iface.close();
      const a = answer.trim().toLowerCase();
      resolve(a === "" ? defaultYes : a === "y" || a === "yes");
    });
  });
}

/** Truncate a string for display: first 10 + "..." + last 5. */
function truncate(s: string, max = 20): string {
  if (s.length <= max) return s;
  return s.slice(0, 10) + "..." + s.slice(-5);
}

/** Prompt for text input with an optional default value. */
function promptText(label: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` [${truncate(defaultValue)} from openclaw.json]` : "";
  return new Promise((resolve) => {
    const iface = createInterface({ input: process.stdin, output: process.stdout });
    iface.question(`  ${label}${suffix}: `, (answer) => {
      iface.close();
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

// ── OpenClaw config auto-detect ─────────────────────────────────────

type OpenClawDefaults = {
  botToken?: string;
  approverUserIds?: string[];
};

/** Read openclaw.json and extract Discord defaults if available. */
function readOpenClawDefaults(workspace: string): OpenClawDefaults {
  try {
    const raw = readFileSync(join(workspace, "openclaw.json"), "utf-8");
    const parsed = JSON.parse(raw);
    const discord = parsed?.channels?.discord;
    if (!discord) return {};
    return {
      botToken: typeof discord.token === "string" ? discord.token : undefined,
      approverUserIds: Array.isArray(discord.dm?.allowFrom) ? discord.dm.allowFrom : undefined,
    };
  } catch {
    return {};
  }
}

// ── Daemon prompts ──────────────────────────────────────────────────

/**
 * Prompt user to configure the Discord approval daemon.
 * Returns DaemonConfig if configured, undefined if declined.
 */
async function runDaemonPrompts(
  workspace: string,
  out: ConsoleOutput,
): Promise<DaemonConfig | undefined> {
  out.write("");
  const wantsDaemon = await promptYesNo("Set up Discord approval daemon?");
  if (!wantsDaemon) return undefined;

  const defaults = readOpenClawDefaults(workspace);

  const botToken = await promptText("Discord bot token", defaults.botToken);
  if (!botToken) {
    out.warn("  Bot token is required — skipping daemon setup.");
    return undefined;
  }

  const channelId = await promptText("Approval channel ID");
  if (!channelId) {
    out.warn("  Channel ID is required — skipping daemon setup.");
    return undefined;
  }

  const defaultApprovers = defaults.approverUserIds?.join(", ");
  const approversRaw = await promptText("Approver user ID(s) (comma-separated)", defaultApprovers);
  const approverUserIds = approversRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (approverUserIds.length === 0) {
    out.warn("  At least one approver is required — skipping daemon setup.");
    return undefined;
  }

  return {
    channel: "discord",
    discord: { botToken, channelId, approverUserIds },
  };
}

// ── Main prompt orchestrator ────────────────────────────────────────

/**
 * Run interactive init prompts. Returns the user's choices.
 */
export async function runInitPrompts(
  workspace: string,
  out: ConsoleOutput,
): Promise<InitPromptResult> {
  // Check for OpenClaw workspace
  if (!existsSync(join(workspace, "openclaw.json"))) {
    return {};
  }

  out.write("\nOpenClaw workspace detected.\n");

  const allTemplates = await loadTemplates();
  if (!allTemplates) {
    out.info("  (OpenClaw plugin not available — skipping template setup)");
    return {};
  }

  out.write("");
  const choice = await pick("Protection template:", [
    { label: "default", description: allTemplates.default.description, value: "default" as const },
    {
      label: "paranoid",
      description: allTemplates.paranoid.description,
      value: "paranoid" as const,
    },
    { label: "relaxed", description: allTemplates.relaxed.description, value: "relaxed" as const },
    { label: "none", description: "Skip template setup", value: "none" as const },
  ]);

  if (!choice) {
    return { cancelled: true };
  }

  let template: Template | undefined;
  if (choice !== "none") {
    template = allTemplates[choice];
    out.write("");
    out.info(`  Using "${template.name}" template: ${template.description}`);
  }

  // Daemon setup prompt
  const daemonConfig = await runDaemonPrompts(workspace, out);

  // Plugin install prompt
  out.write("");
  const installPlugin = await promptYesNo("Install OpenClaw plugin to workspace?", true);

  return { template, daemonConfig, installPlugin };
}
