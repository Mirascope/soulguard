/**
 * Interactive prompts for `soulguard init`.
 *
 * Detects OpenClaw workspace and offers template selection.
 * All I/O happens here — the SDK layer stays non-interactive.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ConsoleOutput } from "../util/console.js";
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

  if (choice === "none") {
    return {};
  }

  const template = allTemplates[choice];
  out.write("");
  out.info(`  Using "${template.name}" template: ${template.description}`);

  return { template };
}
