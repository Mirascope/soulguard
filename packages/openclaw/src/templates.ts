/**
 * OpenClaw configuration templates for Soulguard.
 *
 * Every known path is explicitly placed in vault, ledger, or unprotected.
 * Tests validate that all paths are accounted for in every template.
 */

import type { SoulguardConfig } from "@soulguard/core";

// ── Known path groups ──────────────────────────────────────────────────

export const SOULGUARD_CONFIG = ["soulguard.json"] as const;
export const CORE_IDENTITY = ["SOUL.md", "AGENTS.md", "IDENTITY.md", "USER.md"] as const;
export const CORE_SESSION = ["TOOLS.md", "HEARTBEAT.md", "BOOTSTRAP.md"] as const;
export const CORE_MEMORY = ["MEMORY.md"] as const;
export const MEMORY_DIR = ["memory/**"] as const;
export const SKILLS = ["skills/**"] as const;
export const OPENCLAW_CONFIG = ["openclaw.json"] as const;
export const CRON = ["cron/jobs.json"] as const;
export const EXTENSIONS = ["extensions/**"] as const;
export const SESSIONS = ["sessions/**"] as const;

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
  vault: readonly string[];
  ledger: readonly string[];
  unprotected: readonly string[];
};

/** Extract just the SoulguardConfig from a template */
export function templateToConfig(template: Template): SoulguardConfig {
  return {
    vault: [...template.vault],
    ledger: [...template.ledger],
  };
}

// ── Templates ──────────────────────────────────────────────────────────

export const defaultTemplate: Template = {
  name: "default",
  description: "Core identity and config in vault, memory and skills tracked in ledger",
  vault: [
    ...SOULGUARD_CONFIG,
    ...CORE_IDENTITY,
    ...CORE_SESSION,
    ...OPENCLAW_CONFIG,
    ...CRON,
    ...EXTENSIONS,
  ],
  ledger: [...CORE_MEMORY, ...MEMORY_DIR, ...SKILLS],
  unprotected: [...SESSIONS],
};

export const paranoidTemplate: Template = {
  name: "paranoid",
  description: "Everything possible in vault, only skills in ledger",
  vault: [
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
  ledger: [...SESSIONS],
  unprotected: [],
};

export const relaxedTemplate: Template = {
  name: "relaxed",
  description: "Only soulguard config locked, everything else tracked — good for initial setup",
  vault: [...SOULGUARD_CONFIG],
  ledger: [
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
