#!/usr/bin/env node
/**
 * soulguard CLI entry point.
 */

import { Command } from "commander";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { LiveConsoleOutput } from "./console-live.js";
import { StatusCommand } from "./cli/status-command.js";
import { SyncCommand } from "./cli/sync-command.js";
import { InitCommand } from "./cli/init-command.js";
import { NodeSystemOps, writeFileAbsolute, existsAbsolute } from "./system-ops-node.js";
import { parseConfig } from "./schema.js";
import type { StatusOptions } from "./status.js";
import type { SoulguardConfig } from "./types.js";

const IDENTITY = { user: "soulguardian", group: "soulguard" } as const;
const VAULT_OWNERSHIP = { user: IDENTITY.user, group: IDENTITY.group, mode: "444" } as const;
const LEDGER_OWNERSHIP = { user: "agent", group: "staff", mode: "644" } as const;

const DEFAULT_CONFIG: SoulguardConfig = {
  vault: [
    "SOUL.md",
    "AGENTS.md",
    "IDENTITY.md",
    "USER.md",
    "TOOLS.md",
    "HEARTBEAT.md",
    "BOOTSTRAP.md",
    "soulguard.json",
  ],
  ledger: ["memory/**", "skills/**"],
};

async function makeOptions(workspace: string): Promise<StatusOptions> {
  const ops = new NodeSystemOps(resolve(workspace));
  const configPath = resolve(workspace, "soulguard.json");

  let raw: string;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch {
    throw new Error(`No soulguard.json found in ${workspace}`);
  }

  const config = parseConfig(JSON.parse(raw));

  return {
    config,
    expectedVaultOwnership: VAULT_OWNERSHIP,
    expectedLedgerOwnership: LEDGER_OWNERSHIP,
    ops,
  };
}

const program = new Command()
  .name("soulguard")
  .description("Identity protection for AI agents")
  .version("0.0.0");

program
  .command("status")
  .description("Report the status of a soulguard workspace")
  .argument("[workspace]", "workspace path", process.cwd())
  .action(async (workspace: string) => {
    const out = new LiveConsoleOutput();
    try {
      const opts = await makeOptions(workspace);
      const cmd = new StatusCommand(opts, out);
      process.exitCode = await cmd.execute();
    } catch (e) {
      out.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  });

program
  .command("sync")
  .description("Fix all issues in a soulguard workspace")
  .argument("[workspace]", "workspace path", process.cwd())
  .action(async (workspace: string) => {
    const out = new LiveConsoleOutput();
    try {
      const opts = await makeOptions(workspace);
      const cmd = new SyncCommand(opts, out);
      process.exitCode = await cmd.execute();
    } catch (e) {
      out.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  });

program
  .command("init")
  .description("Initialize soulguard for a workspace")
  .argument("[workspace]", "workspace path", process.cwd())
  .option("--agent-user <user>", "agent OS username", "agent")
  .option("--password", "set a password during init")
  .option("--template <name>", "protection template")
  .action(
    async (
      workspace: string,
      opts: { agentUser: string; password?: boolean; template?: string },
    ) => {
      const out = new LiveConsoleOutput();
      const absWorkspace = resolve(workspace);
      const nodeOps = new NodeSystemOps(absWorkspace);

      // Use existing config if present, otherwise default
      let config: SoulguardConfig = DEFAULT_CONFIG;
      try {
        const raw = await readFile(resolve(absWorkspace, "soulguard.json"), "utf-8");
        config = parseConfig(JSON.parse(raw));
      } catch {
        // No existing config — will be created by init
      }

      // TODO: if --password, prompt for password via stdin
      const password = opts.password ? undefined : undefined; // placeholder

      const cmd = new InitCommand(
        {
          ops: nodeOps,
          identity: IDENTITY,
          config,
          agentUser: opts.agentUser,
          writeAbsolute: writeFileAbsolute,
          existsAbsolute,
          password,
        },
        out,
      );
      process.exitCode = await cmd.execute();
    },
  );

program.parse();
