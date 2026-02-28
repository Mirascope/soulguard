#!/usr/bin/env node
/**
 * soulguard CLI entry point.
 */

import { Command } from "commander";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { LiveConsoleOutput } from "./console-live.js";
import { StatusCommand } from "./cli/status-command.js";
import { SyncCommand } from "./cli/sync-command.js";
import { DiffCommand } from "./cli/diff-command.js";
import { ApproveCommand } from "./cli/approve-command.js";
import { ResetCommand } from "./cli/reset-command.js";
import { InitCommand } from "./cli/init-command.js";
import { NodeSystemOps, writeFileAbsolute, existsAbsolute } from "./system-ops-node.js";
import { parseConfig } from "./schema.js";
import type { StatusOptions } from "./status.js";
import type { SoulguardConfig } from "./types.js";

import { IDENTITY, VAULT_OWNERSHIP } from "./constants.js";
function ledgerOwnership(): { user: string; group: string; mode: string } {
  const agentUser = process.env.SUDO_USER ?? "agent";
  return { user: agentUser, group: IDENTITY.group, mode: "644" };
}

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
    expectedLedgerOwnership: ledgerOwnership(),
    ops,
  };
}

function getVersion(): string {
  try {
    return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")).version;
  } catch {
    // Fallback for global installs where import.meta.url may not resolve correctly
    const req = createRequire(import.meta.url);
    return req("../package.json").version ?? "0.0.0";
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
  .option("--agent-user <user>", "agent OS username (default: $SUDO_USER or 'agent')")
  .option("--template <name>", "protection template")
  .action(async (workspace: string, opts: { agentUser?: string; template?: string }) => {
    const out = new LiveConsoleOutput();
    const absWorkspace = resolve(workspace);
    const nodeOps = new NodeSystemOps(absWorkspace);

    // Infer agent user: explicit flag > $SUDO_USER > "agent"
    const agentUser = opts.agentUser ?? process.env.SUDO_USER ?? "agent";

    // Use existing config if present, otherwise default
    let config: SoulguardConfig = DEFAULT_CONFIG;
    try {
      const raw = await readFile(resolve(absWorkspace, "soulguard.json"), "utf-8");
      config = parseConfig(JSON.parse(raw));
    } catch {
      // No existing config — will be created by init
    }

    const cmd = new InitCommand(
      {
        ops: nodeOps,
        identity: IDENTITY,
        config,
        agentUser,
        writeAbsolute: writeFileAbsolute,
        existsAbsolute,
      },
      out,
    );
    process.exitCode = await cmd.execute();
  });

program
  .command("diff")
  .description("Compare vault files against staging copies")
  .argument("[workspace]", "workspace path", process.cwd())
  .argument("[files...]", "specific files to diff")
  .action(async (workspace: string, files: string[]) => {
    const out = new LiveConsoleOutput();
    try {
      const opts = await makeOptions(workspace);
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
  .command("approve")
  .description("Approve and apply staging changes to vault")
  .argument("[workspace]", "workspace path", process.cwd())
  .option("--hash <hash>", "approval hash for non-interactive mode")
  .action(async (workspace: string, opts: { hash?: string }) => {
    const out = new LiveConsoleOutput();
    try {
      const statusOpts = await makeOptions(workspace);
      const agentUser = process.env.SUDO_USER ?? "agent";
      const cmd = new ApproveCommand(
        {
          ops: statusOpts.ops,
          config: statusOpts.config,
          vaultOwnership: VAULT_OWNERSHIP,
          stagingOwnership: { user: agentUser, group: IDENTITY.group, mode: "644" },
          hash: opts.hash,
          prompt: opts.hash
            ? undefined
            : async () => {
                // Interactive prompt via stdin
                const rl = await import("node:readline");
                const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
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
  .description("Reset staging to match vault (discard changes)")
  .argument("[workspace]", "workspace path", process.cwd())
  .action(async (workspace: string) => {
    const out = new LiveConsoleOutput();
    try {
      const statusOpts = await makeOptions(workspace);
      const agentUser = process.env.SUDO_USER ?? "agent";
      const cmd = new ResetCommand(
        {
          ops: statusOpts.ops,
          config: statusOpts.config,
          stagingOwnership: { user: agentUser, group: IDENTITY.group, mode: "644" },
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
