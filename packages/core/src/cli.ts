#!/usr/bin/env node
/**
 * soulguard CLI entry point.
 */

import { Command } from "commander";
import { LiveConsoleOutput } from "./console-live.js";
import { StatusCommand } from "./cli/status-command.js";
import { SyncCommand } from "./cli/sync-command.js";
import type { StatusOptions } from "./status.js";

function makeOptions(_workspace: string): StatusOptions {
  // Real LiveSystemOps comes in a future PR
  throw new Error("Live system operations not yet implemented.");
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
    const opts = makeOptions(workspace);
    const cmd = new StatusCommand(opts, out);
    process.exitCode = await cmd.execute();
  });

program
  .command("sync")
  .description("Fix all issues in a soulguard workspace")
  .argument("[workspace]", "workspace path", process.cwd())
  .action(async (workspace: string) => {
    const out = new LiveConsoleOutput();
    const opts = makeOptions(workspace);
    const cmd = new SyncCommand(opts, out);
    process.exitCode = await cmd.execute();
  });

program.parse();
