#!/usr/bin/env node
/**
 * soulguard CLI entry point.
 */

import { Command } from "commander";
import { LiveConsoleOutput } from "./console-live.js";
import { StatusCommand } from "./cli/status-command.js";
import { SyncCommand } from "./cli/sync-command.js";
import type { StatusOptions } from "./status.js";
import type { SyncOptions } from "./sync.js";

// Hardcoded ownership values (resolveWorkspace comes later)
const VAULT_OWNERSHIP = { user: "soulguardian", group: "soulguard", mode: "444" } as const;
const LEDGER_OWNERSHIP = { user: "agent", group: "staff", mode: "644" } as const;

function makeOptions(workspace: string): StatusOptions & { ops: any } {
  // Dynamic import to avoid pulling in live ops at module level
  // For now, we'll construct a placeholder — real LiveSystemOps comes later
  throw new Error(`Live system operations not yet implemented. Workspace: ${workspace}`);
}

const program = new Command()
  .name("soulguard")
  .description("Soul file protection for AI workspaces")
  .version("0.0.0");

program
  .command("status")
  .description("Report the current protection state of a workspace")
  .argument("[workspace]", "workspace path", process.cwd())
  .action(async (workspace: string) => {
    const out = new LiveConsoleOutput();
    const opts = makeOptions(workspace);
    const cmd = new StatusCommand(opts, out);
    process.exitCode = await cmd.execute();
  });

program
  .command("sync")
  .description("Fix all issues found by status")
  .argument("[workspace]", "workspace path", process.cwd())
  .action(async (workspace: string) => {
    const out = new LiveConsoleOutput();
    const opts = makeOptions(workspace);
    const cmd = new SyncCommand(opts, out);
    process.exitCode = await cmd.execute();
  });

program.parse();
