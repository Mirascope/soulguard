#!/usr/bin/env node
/**
 * soulguard CLI entry point.
 */

import { Command } from "commander";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { LiveConsoleOutput } from "../util/console-live.js";
import { StatusCommand } from "./status-command.js";
import { SyncCommand } from "./sync-command.js";
import { DiffCommand } from "./diff-command.js";
import { ApplyCommand } from "./apply-command.js";
import { ResetCommand } from "./reset-command.js";
import { StageCommand } from "./stage-command.js";
import { InitCommand } from "./init-command.js";
import { LogCommand } from "./log-command.js";
import { TierCommand } from "./tier-command.js";
import { NodeSystemOps } from "../util/system-ops-node.js";
import { parseConfig } from "../sdk/schema.js";

async function makeBaseOptions(workspace: string) {
  const ops = new NodeSystemOps(resolve(workspace));
  const configPath = resolve(workspace, "soulguard.json");

  let raw: string;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch {
    throw new Error(`No soulguard.json found in ${workspace}`);
  }

  const config = parseConfig(JSON.parse(raw));

  return { config, ops };
}

function getVersion(): string {
  try {
    return JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf-8"))
      .version;
  } catch {
    // Fallback for global installs where import.meta.url may not resolve correctly
    const req = createRequire(import.meta.url);
    return req("../../package.json").version ?? "0.0.0";
  }
}

const program = new Command()
  .name("soulguard")
  .description("Identity protection for AI agents")
  .version(getVersion());

program
  .command("status")
  .description("Report the status of a soulguard workspace")
  .argument("[workspace]", "workspace path", process.cwd())
  .action(async (workspace: string) => {
    const out = new LiveConsoleOutput();
    try {
      const opts = await makeBaseOptions(workspace);
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
      const opts = await makeBaseOptions(workspace);
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

  .action(async (workspace: string) => {
    const out = new LiveConsoleOutput();
    const absWorkspace = resolve(workspace);
    const nodeOps = new NodeSystemOps(absWorkspace);

    const cmd = new InitCommand(
      {
        ops: nodeOps,
      },
      out,
    );
    process.exitCode = await cmd.execute();
  });

program
  .command("diff")
  .description("Compare protected files against staging copies")
  .argument("[workspace]", "workspace path", process.cwd())
  .argument("[files...]", "specific files to diff")
  .action(async (workspace: string, files: string[]) => {
    const out = new LiveConsoleOutput();
    try {
      const opts = await makeBaseOptions(workspace);
      const cmd = new DiffCommand(
        {
          ops: opts.ops,
          config: opts.config,
          files: files.length > 0 ? files : undefined,
        },
        out,
      );
      process.exitCode = await cmd.execute();
    } catch (e) {
      out.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  });

program
  .command("apply")
  .description("Apply staging changes to protected files")
  .argument("[workspace]", "workspace path", process.cwd())
  .option("--hash <hash>", "approval hash for cryptographic verification")
  .option("-y, --yes", "skip hash verification (convenient but slightly less secure)")
  .action(async (workspace: string, opts: { hash?: string; yes?: boolean }) => {
    const out = new LiveConsoleOutput();
    try {
      const statusOpts = await makeBaseOptions(workspace);

      const cmd = new ApplyCommand(
        {
          ops: statusOpts.ops,
          config: statusOpts.config,
          hash: opts.hash,
          skipHashVerification: opts.yes,
          prompt:
            opts.hash || opts.yes
              ? undefined
              : async () => {
                  // Interactive prompt via stdin
                  const rl = await import("node:readline");
                  const iface = rl.createInterface({
                    input: process.stdin,
                    output: process.stdout,
                  });
                  return new Promise<boolean>((resolve) => {
                    iface.question("Apply these changes? [y/N] ", (answer) => {
                      iface.close();
                      resolve(answer.toLowerCase() === "y");
                    });
                  });
                },
        },
        out,
      );
      process.exitCode = await cmd.execute();
    } catch (e) {
      out.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  });

program
  .command("reset")
  .description("Reset staged changes (dry run, selective, or --all)")
  .argument("[paths...]", "specific paths to reset")
  .option("-a, --all", "reset all staged changes")
  .option("-w, --workspace <path>", "workspace path", process.cwd())
  .action(async (paths: string[], opts: { all?: boolean; workspace: string }) => {
    const out = new LiveConsoleOutput();
    try {
      const statusOpts = await makeBaseOptions(opts.workspace);

      const cmd = new ResetCommand(
        {
          ops: statusOpts.ops,
          config: statusOpts.config,
          paths: paths.length > 0 ? paths : undefined,
          all: opts.all,
        },
        out,
      );
      process.exitCode = await cmd.execute();
    } catch (e) {
      out.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  });

program
  .command("log")
  .description("Show git history for tracked files")
  .argument("[workspace]", "workspace path", process.cwd())
  .argument("[file]", "specific file to show history for")
  .action(async (workspace: string, file?: string) => {
    const out = new LiveConsoleOutput();
    try {
      const opts = await makeBaseOptions(workspace);
      const cmd = new LogCommand({ ops: opts.ops, config: opts.config, file }, out);
      process.exitCode = await cmd.execute();
    } catch (e) {
      out.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  });

program
  .command("protect")
  .description("Add files to the protect tier (requires sudo)")
  .argument("<paths...>", "files or directories to protect")
  .option("-w, --workspace <path>", "workspace path", process.cwd())
  .action(async (files: string[], opts: { workspace: string }) => {
    const out = new LiveConsoleOutput();
    if (process.getuid?.() !== 0) {
      out.error("soulguard protect requires sudo. Run with: sudo soulguard protect <files...>");
      process.exitCode = 1;
      return;
    }
    try {
      const base = await makeBaseOptions(opts.workspace);
      const cmd = new TierCommand(
        {
          ops: base.ops,
          files,
          action: { kind: "set", tier: "protect" },
        },
        out,
      );
      process.exitCode = await cmd.execute();
    } catch (e) {
      out.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  });

program
  .command("watch")
  .description("Add files to the watch tier (requires sudo)")
  .argument("<paths...>", "files or directories to watch")
  .option("-w, --workspace <path>", "workspace path", process.cwd())
  .action(async (files: string[], opts: { workspace: string }) => {
    const out = new LiveConsoleOutput();
    if (process.getuid?.() !== 0) {
      out.error("soulguard watch requires sudo. Run with: sudo soulguard watch <files...>");
      process.exitCode = 1;
      return;
    }
    try {
      const base = await makeBaseOptions(opts.workspace);
      const cmd = new TierCommand(
        {
          ops: base.ops,
          files,
          action: { kind: "set", tier: "watch" },
        },
        out,
      );
      process.exitCode = await cmd.execute();
    } catch (e) {
      out.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  });

program
  .command("release")
  .description("Release files from all tiers (requires sudo)")
  .argument("<paths...>", "files or directories to release")
  .option("-w, --workspace <path>", "workspace path", process.cwd())
  .action(async (files: string[], opts: { workspace: string }) => {
    const out = new LiveConsoleOutput();
    if (process.getuid?.() !== 0) {
      out.error("soulguard release requires sudo. Run with: sudo soulguard release <files...>");
      process.exitCode = 1;
      return;
    }
    try {
      const base = await makeBaseOptions(opts.workspace);
      const cmd = new TierCommand(
        {
          ops: base.ops,
          files,
          action: { kind: "release" },
        },
        out,
      );
      process.exitCode = await cmd.execute();
    } catch (e) {
      out.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  });

program
  .command("stage")
  .description("Stage protected files for editing or deletion")
  .argument("<paths...>", "files to stage")
  .option("-w, --workspace <path>", "workspace path", process.cwd())
  .option("-d, --delete", "stage for deletion instead of editing")
  .action(async (files: string[], opts: { workspace: string; delete?: boolean }) => {
    const out = new LiveConsoleOutput();
    try {
      const base = await makeBaseOptions(opts.workspace);
      const cmd = new StageCommand(
        {
          ops: base.ops,
          config: base.config,
          paths: files,
          delete: opts.delete,
        },
        out,
      );
      process.exitCode = await cmd.execute();
    } catch (e) {
      out.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  });

program.parse();
