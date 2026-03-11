# Task 2: Staging Watcher with Debounce and Batch Mode

## Goal

Implement the filesystem watcher that polls `.soulguard-staging/` for changes
and emits events when a new proposal should be created. This is pure core logic
with no channel dependency.

## Files to create/modify

### New files

- `packages/core/src/daemon/watcher.ts` — `StagingWatcher` class
- `packages/core/src/daemon/watcher.test.ts` — tests

### Modified files

- `packages/core/src/daemon/index.ts` — re-export watcher
- `packages/core/src/index.ts` — re-export watcher

## Design

### StagingWatcher

```typescript
type WatcherEvents = {
  /** Emitted when staging changes are ready for a proposal. */
  proposal: (snapshot: StagingSnapshot) => void;
  /** Emitted on errors (e.g. permission denied reading staging dir). */
  error: (error: Error) => void;
};

type StagingSnapshot = {
  /** Files in the staging directory with their hashes. */
  files: Map<string, string>; // path → content hash
  /** Agent-provided description if .description exists. */
  description?: string;
  /** Timestamp when the snapshot was taken. */
  timestamp: string;
};

class StagingWatcher extends EventEmitter<WatcherEvents> {
  constructor(options: {
    ops: SystemOperations;
    stagingDir: string;
    debounceMs: number;
    batchReadyTimeoutMs: number;
    pollIntervalMs?: number; // default 1000
  });

  start(): void;
  stop(): void;
  readonly running: boolean;
}
```

### Behavior

1. **Polling**: Check `.soulguard-staging/` at `pollIntervalMs` intervals for changes
   (compare file list + content hashes against last known state).

2. **Debounce**: After detecting a change, wait `debounceMs` after the _last_ write
   before emitting `proposal`. Reset the timer on each new change.

3. **Batch mode**: If `.soulguard-staging/.wait-for-ready` exists, suppress proposal
   emission regardless of debounce. When the sentinel is removed (or `.ready` appears),
   emit immediately. Safety timeout: if sentinel persists longer than `batchReadyTimeoutMs`,
   log a warning and emit anyway.

4. **Snapshot**: When emitting, build a `StagingSnapshot` with current file hashes
   and optional `.description` content. Exclude `.wait-for-ready`, `.ready`, and
   `.description` from the file map.

5. **No-op detection**: If the staging directory is empty (or only contains metadata
   files), don't emit.

### What this does NOT do

- Build a StateTree (that's the Proposal Manager's job)
- Compute diffs (that's the Proposal Manager's job)
- Interact with any channel
- Know about proposals or their lifecycle

### Key test scenarios

- Debounce: rapid writes → single emission after debounce period
- Batch mode: sentinel present → no emission; sentinel removed → emission
- Batch timeout: sentinel present too long → emission with warning
- Change detection: only emit when files actually changed (not on every poll)
- Empty staging: no emission
- Description: included in snapshot when present, excluded from file map
- Start/stop: clean lifecycle, no leaking timers
- Error handling: permission denied on staging dir → error event

## Dependencies

- Task 1 (types) — for `SystemOperations`, constants
- Uses `EventEmitter` from Node.js (or a typed equivalent)

## Status

- [ ] Implementation
- [ ] Tests passing
- [ ] Review complete
