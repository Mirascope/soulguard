/**
 * CLI command: soulguard daemon start
 *
 * Runs the approval daemon in the foreground. Designed to be invoked
 * by systemd/launchd — the service manager handles backgrounding.
 */

import type { ConsoleOutput } from "../util/console.js";
import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig } from "../util/types.js";
import { SoulguardDaemon } from "../daemon/daemon.js";

export type DaemonCommandOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  workspaceRoot: string;
};

export class DaemonCommand {
  constructor(
    private options: DaemonCommandOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const { ops, config, workspaceRoot } = this.options;

    if (!config.daemon) {
      this.out.info("No daemon configuration in soulguard.json — nothing to do.");
      return 0;
    }

    const daemon = new SoulguardDaemon({ ops, config, workspaceRoot });

    // Wire up proposal lifecycle events for observability
    const onShutdown = async () => {
      this.out.info("Shutting down...");
      await daemon.stop();
      process.exit(0);
    };

    process.on("SIGINT", onShutdown);
    process.on("SIGTERM", onShutdown);

    try {
      await daemon.start();
    } catch (e) {
      this.out.error(e instanceof Error ? e.message : String(e));
      return 1;
    }

    const pm = daemon.proposalManager;
    if (pm) {
      pm.on("proposed", (proposal) => {
        this.out.info(
          `Proposal posted: ${proposal.payload.hash} (${proposal.payload.files.length} file(s))`,
        );
      });
      pm.on("applied", (proposal) => {
        this.out.success(`Proposal applied: ${proposal.payload.hash}`);
      });
      pm.on("rejected", (proposal) => {
        this.out.warn(`Proposal rejected: ${proposal.payload.hash}`);
      });
      pm.on("superseded", (proposal) => {
        this.out.info(`Proposal superseded: ${proposal.payload.hash}`);
      });
      pm.on("error", (error, context) => {
        this.out.error(`[${context}] ${error.message}`);
      });
    }

    this.out.success(`Daemon running (channel: ${config.daemon.channel})`);

    // Keep the process alive — polling intervals in ProposalManager prevent exit
    await new Promise<void>(() => {});
    return 0;
  }
}
