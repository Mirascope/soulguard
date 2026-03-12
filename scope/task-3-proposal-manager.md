# Task 3: Proposal Manager — State Machine and Orchestration

## Goal

The proposal manager is the core orchestrator. It receives "proposal ready"
signals from the watcher, builds a StateTree, derives the ProposalPayload,
posts it to the channel, waits for approval, and calls apply() or handles
rejection/supersession.

## Files to create/modify

### New files

- `packages/core/src/daemon/proposal-manager.ts` — `ProposalManager` class
- `packages/core/src/daemon/proposal-manager.test.ts` — tests

### Modified files

- `packages/core/src/daemon/index.ts` — re-export
- `packages/core/src/index.ts` — re-export

## Design

### ProposalManager

```typescript
type ProposalManagerOptions = {
  ops: SystemOperations;
  config: SoulguardConfig;
  channel: ApprovalChannel;
  workspaceRoot: string;
};

class ProposalManager {
  constructor(options: ProposalManagerOptions);

  /** Handle a "staging ready" signal from the watcher. */
  onStagingReady(): Promise<void>;

  /** Current active proposal, if any. */
  readonly activeProposal: Proposal | null;

  /** Shut down — cancel any pending approval wait. */
  dispose(): Promise<void>;
}
```

### Lifecycle (what onStagingReady does)

1. If there's an active pending proposal → supersede it:
   - Abort the `waitForApproval` call (via AbortController)
   - Call `channel.postResult(id, "superseded")`
   - Clear active proposal

2. Build a new StateTree from current filesystem state

3. Derive ProposalPayload:
   - Use `diff()` to get per-file diffs
   - Read `.soulguard-staging/.description` if present
   - Compute approval hash from StateTree

4. Call `channel.postProposal(payload)` → get PostProposalResult

5. Create Proposal record, set as active

6. Call `channel.waitForApproval(id, signal)`:
   - On approved: call `apply(tree, hash)`, then `channel.postResult(id, "applied")`
   - On rejected: `channel.postResult(id, "rejected")`
   - On abort (superseded): handled by step 1 of next onStagingReady call

### Content verification

At approval time, before calling apply():

1. Build a fresh StateTree from current filesystem
2. Compare its approval hash against the proposal's hash
3. If they differ → staging was modified between proposal and approval → reject

This catches the race where the agent modifies staging after the proposal
was posted but before the human approves.

### Key test scenarios (all with mock ApprovalChannel)

- Happy path: staging ready → proposal posted → approved → applied
- Rejection: staging ready → proposal posted → rejected → postResult("rejected")
- Supersession: proposal pending → new staging ready → old aborted, new posted
- Content verification: staging modified after proposal → hash mismatch → rejected
- Apply failure: apply() returns error → postResult with error info
- Description: .description file content passed through to ProposalPayload
- Dispose: cancels pending waitForApproval
- Empty diff: staging ready but no actual changes → no proposal posted

## Dependencies

- Task 1 (types) — ApprovalChannel, ProposalPayload, etc.
- Task 2 (watcher) — not a code dependency, but the watcher calls onStagingReady
- Existing SDK: StateTree, diff(), apply()

## Status

- [ ] Implementation
- [ ] Tests passing
- [ ] Review complete
