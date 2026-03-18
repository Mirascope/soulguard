/**
 * CLI command: soulguard daemon start
 *
 * Runs the daemon in the foreground. Designed to be invoked
 * by systemd/launchd — the service manager handles backgrounding.
 */

import type { ConsoleOutput } from "../util/console.js";
import type { SystemOperations } from "../util/system-ops.js";
import type { SoulguardConfig } from "../util/types.js";
import { SoulguardDaemon } from "../daemon/daemon.js";

export type DaemonCommandOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
};

export class DaemonCommand {
  constructor(
    private options: DaemonCommandOptions,
    private out: ConsoleOutput,
  ) {}

  async execute(): Promise<number> {
    const { ops, config } = this.options;

    if (!config.daemon) {
      this.out.info("No daemon configuration in soulguard.json — nothing to do.");
      return 0;
    }

    const daemon = new SoulguardDaemon({ ops, config });

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

    // ── Wire all events on the daemon ─────────────────────────────────

    // Proposal events (only fire when a channel is configured)
    daemon.on("proposed", (proposal) => {
      this.out.info(
        `Proposal posted: ${proposal.payload.hash} (${proposal.payload.files.length} file(s))`,
      );
    });
    daemon.on("applied", (proposal) => {
      this.out.success(`Proposal applied: ${proposal.payload.hash}`);
    });
    daemon.on("rejected", (proposal) => {
      this.out.warn(`Proposal rejected: ${proposal.payload.hash}`);
    });
    daemon.on("superseded", (proposal) => {
      this.out.info(`Proposal superseded: ${proposal.payload.hash}`);
    });
    daemon.on("proposal:error", (error, context) => {
      this.out.error(`[${context}] ${error.message}`);
    });

    // Sync events (always fire)
    daemon.on("synced", (result) => {
      const driftCount = result.drifts.length;
      const errorCount = result.errors.length;
      const gitMsg = result.git?.committed ? `, committed ${result.git.files.length} file(s)` : "";
      // Only log when something happened — avoid noise every interval
      if (driftCount > 0 || result.git?.committed) {
        this.out.info(`[sync] fixed ${driftCount} drift(s), ${errorCount} error(s)${gitMsg}`);
      }
    });
    daemon.on("sync:error", (error) => {
      this.out.error(`[sync] ${error.message}`);
    });

    // ── Startup banner ────────────────────────────────────────────────

    const channelName = config.daemon.channel;
    const syncInterval = config.daemon.syncIntervalSecs ?? 60;
    const syncLabel = syncInterval > 0 ? `sync: every ${syncInterval}s` : "sync: disabled";
    if (channelName) {
      this.out.success(`Daemon running (channel: ${channelName}, ${syncLabel})`);
    } else {
      this.out.success(`Daemon running (${syncLabel})`);
    }

    // Keep the process alive — polling intervals prevent exit
    await new Promise<void>(() => {});
    return 0;
  }
}
