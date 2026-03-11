# Task 1: ApprovalChannel Interface, Daemon Config Types, and Skipped Tests

## Goal

Define the foundational types for the remote approval daemon. This PR introduces:

1. The `ApprovalChannel` interface that all channel plugins implement
2. Daemon-related config types added to `SoulguardConfig`
3. Zod schema updates for the new config shape
4. Skipped tests showing expected behavior

No runtime logic in this PR — just the type contracts and config validation.

## Files to create/modify

### New files

- `packages/core/src/daemon/types.ts` — `ApprovalChannel` interface, `Proposal` type, daemon event types
- `packages/core/src/daemon/index.ts` — re-exports from types.ts

### Modified files

- `packages/core/src/util/types.ts` — add `DaemonConfig` to `SoulguardConfig`
- `packages/core/src/sdk/schema.ts` — add Zod schema for daemon config
- `packages/core/src/index.ts` — re-export daemon types
- `packages/core/src/sdk/schema.test.ts` — add tests for daemon config validation

## Design decisions

### ApprovalChannel interface

```typescript
interface ApprovalChannel {
  postProposal(proposal: ProposalPayload): Promise<string>;
  waitForApproval(proposalId: string, signal: AbortSignal): Promise<ApprovalResult>;
  postResult(proposalId: string, result: ProposalOutcome): Promise<boolean>;
  dispose(): Promise<void>;
}
```

Key choices:

- `waitForApproval` takes an `AbortSignal` for cancellation on supersession
- `postResult` returns `boolean` (true = posted successfully) for logging
- `ProposalPayload` includes `diff`, `hash`, `description?`
- `ApprovalResult` includes `approved: boolean`, `approver: string`

### DaemonConfig

Added as an optional `daemon?` key on `SoulguardConfig`. The daemon is opt-in — existing configs without it continue to work. Channel-specific config is `Record<string, unknown>` at the core level (validated by the channel plugin, not core).

### Proposal lifecycle types

- `ProposalState`: `"pending" | "approved" | "rejected" | "superseded"`
- `ProposalOutcome`: `"applied" | "rejected" | "superseded"`

These are used by the Proposal Manager (Task 3) but defined here so the interface is complete.

## Status

- [ ] Implementation
- [ ] Tests passing
- [ ] Review complete
