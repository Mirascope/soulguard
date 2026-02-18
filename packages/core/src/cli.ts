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
import { NodeSystemOps } from "./system-ops-node.js";
import { parseConfig } from "./schema.js";
import type { StatusOptions } from "./status.js";

// TODO: read from config after `soulguard init` is implemented
const VAULT_OWNERSHIP = { user: "soulguardian", group: "soulguard", mode: "444" } as const;
const LEDGER_OWNERSHIP = { user: "agent", group: "staff", mode: "644" } as const;

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

program.parse();
