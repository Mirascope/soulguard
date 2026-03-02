/**
 * OpenClaw configuration templates for Soulguard.
 *
 * Every known path is explicitly placed in protect, watch, or unprotected.
 * Paths are relative to the OpenClaw home directory (~/.openclaw/).
 * Tests validate that all paths are accounted for in every template.
 */

import type { SoulguardConfig, Tier } from "@soulguard/core";

// ── Known path groups ──────────────────────────────────────────────────

export const SOULGUARD_CONFIG = ["soulguard.json"] as const;
export const CORE_IDENTITY = [
  "workspace/SOUL.md",
  "workspace/AGENTS.md",
  "workspace/IDENTITY.md",
  "workspace/USER.md",
] as const;
export const CORE_SESSION = [
  "workspace/TOOLS.md",
  "workspace/HEARTBEAT.md",
  "workspace/BOOTSTRAP.md",
] as const;
export const CORE_MEMORY = ["workspace/MEMORY.md"] as const;
export const MEMORY_DIR = ["workspace/memory/**/*.md"] as const;
export const SKILLS = ["workspace/skills/**"] as const;
export const OPENCLAW_CONFIG = ["openclaw.json"] as const;
export const CRON = ["cron/jobs.json"] as const;
export const EXTENSIONS = ["extensions/**"] as const;
export const SESSIONS = ["workspace/sessions/**"] as const;

/** All known paths — every template must account for all of these */
export const ALL_KNOWN_PATHS = [
  ...SOULGUARD_CONFIG,
  ...CORE_IDENTITY,
  ...CORE_SESSION,
  ...CORE_MEMORY,
  ...MEMORY_DIR,
  ...SKILLS,
  ...OPENCLAW_CONFIG,
  ...CRON,
  ...EXTENSIONS,
  ...SESSIONS,
] as const;

// ── Template type ──────────────────────────────────────────────────────

export type TemplateName = "default" | "paranoid" | "relaxed";

export type Template = {
  name: TemplateName;
  description: string;
  protect: readonly string[];
  watch: readonly string[];
  unprotected: readonly string[];
};

/** Extract just the SoulguardConfig from a template */
export function templateToConfig(template: Template): SoulguardConfig {
  const files: Record<string, Tier> = {};
  for (const p of template.protect) files[p] = "protect";
  for (const w of template.watch) files[w] = "watch";
  return { version: 1, files };
}

// ── Templates ──────────────────────────────────────────────────────────

export const defaultTemplate: Template = {
  name: "default",
  description: "Core identity and config in protect, memory and skills tracked in watch",
  protect: [
    ...SOULGUARD_CONFIG,
    ...CORE_IDENTITY,
    ...CORE_SESSION,
    ...OPENCLAW_CONFIG,
    ...CRON,
    ...EXTENSIONS,
  ],
  watch: [...CORE_MEMORY, ...MEMORY_DIR, ...SKILLS],
  unprotected: [...SESSIONS],
};

export const paranoidTemplate: Template = {
  name: "paranoid",
  description: "Everything possible in protect tier, sessions in watch",
  protect: [
    ...SOULGUARD_CONFIG,
    ...CORE_IDENTITY,
    ...CORE_SESSION,
    ...CORE_MEMORY,
    ...MEMORY_DIR,
    ...SKILLS,
    ...OPENCLAW_CONFIG,
    ...CRON,
    ...EXTENSIONS,
  ],
  watch: [...SESSIONS],
  unprotected: [],
};

export const relaxedTemplate: Template = {
  name: "relaxed",
  description:
    "Only soulguard config in protect, everything else in watch — good for initial setup",
  protect: [...SOULGUARD_CONFIG],
  watch: [
    ...CORE_IDENTITY,
    ...CORE_SESSION,
    ...CORE_MEMORY,
    ...MEMORY_DIR,
    ...SKILLS,
    ...OPENCLAW_CONFIG,
    ...CRON,
    ...EXTENSIONS,
  ],
  unprotected: [...SESSIONS],
};

export const templates: Record<TemplateName, Template> = {
  default: defaultTemplate,
  paranoid: paranoidTemplate,
  relaxed: relaxedTemplate,
};
