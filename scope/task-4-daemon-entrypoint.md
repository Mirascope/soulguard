# Task 4: Daemon Entrypoint, CLI Commands, and Service Management

## Goal

Wire everything together: watcher → proposal manager → channel plugin.
Add CLI commands (`soulguard daemon start/stop/status`) and systemd/launchd
service file generation.

## Files to create/modify

### New files

- `packages/core/src/daemon/daemon.ts` — `SoulguardDaemon` class (wires components)
- `packages/core/src/daemon/daemon.test.ts` — integration tests
- `packages/core/src/daemon/service.ts` — systemd unit / launchd plist generation
- `packages/core/src/daemon/service.test.ts` — tests for service file generation
- `packages/core/src/cli/daemon-command.ts` — CLI `daemon` subcommand

### Modified files

- `packages/core/src/daemon/index.ts` — re-export daemon + service
- `packages/core/src/index.ts` — re-export
- `packages/core/src/cli/cli.ts` — register daemon subcommand

## Design

### SoulguardDaemon

```typescript
type DaemonOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  workspaceRoot: string;
};

class SoulguardDaemon {
  constructor(options: DaemonOptions);

  /** Start the daemon: load channel plugin, start watcher, wire events. */
  start(): Promise<void>;

  /** Stop the daemon: dispose channel, stop watcher, cancel proposals. */
  stop(): Promise<void>;

  readonly running: boolean;
}
```

### What start() does

1. Read `config.daemon` — fail if missing
2. Dynamic import of channel plugin: `@soulguard/${config.daemon.channel}`
   - Call exported `createChannel(config.daemon[channelName])` → `ApprovalChannel`
3. Create `StagingWatcher` with config values (debounceMs, batchReadyTimeoutMs)
4. Create `ProposalManager` with ops, config, channel
5. Wire: `watcher.on("proposal", () => proposalManager.onStagingReady())`
6. Wire: `watcher.on("error", (err) => /* log */)`
7. Start watcher

### Service file generation

```typescript
type ServicePlatform = "systemd" | "launchd";

function generateServiceFile(options: {
  platform: ServicePlatform;
  agentUser: string; // e.g. "agent_a"
  guardianUser: string; // e.g. "soulguardian_agent_a"
  workspaceRoot: string;
  soulguardBin: string; // path to soulguard binary
}): string;
```

- systemd: generates a `.service` unit file
- launchd: generates a `.plist` file
- Both run as the guardian user, not root

### CLI commands

- `soulguard daemon start` — start the daemon (foreground by default)
- `soulguard daemon stop` — stop the daemon (signal-based)
- `soulguard daemon status` — show daemon status
- `soulguard daemon install` — generate and install service file

### Key test scenarios

- Daemon start: channel loaded, watcher started, events wired
- Daemon stop: everything disposed cleanly
- Channel plugin not found: helpful error message
- Missing daemon config: clear error
- Service file generation: valid systemd unit / launchd plist for both platforms
- Watcher error propagation: daemon logs watcher errors

## Dependencies

- Task 1 (types), Task 2 (watcher), Task 3 (proposal manager)
- Dynamic import mechanics

## Status

- [ ] Implementation
- [ ] Tests passing
- [ ] Review complete
