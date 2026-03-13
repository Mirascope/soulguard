/**
 * ProposalManager tests.
 *
 * Uses MockSystemOps and a mock ApprovalChannel to test the full
 * proposal lifecycle without real filesystem or channel interactions.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { ProposalManager } from "./proposal-manager.js";
import type {
  ApprovalChannel,
  ApprovalResult,
  PostProposalResult,
  PostResultOutcome,
  ProposalOutcome,
  ProposalPayload,
} from "./types.js";
import { MockSystemOps } from "../util/system-ops-mock.js";
import type { SoulguardConfig } from "../util/types.js";

// ── Mock ApprovalChannel ─────────────────────────────────────────────

type WaitBehavior =
  | { kind: "approve" }
  | { kind: "reject" }
  | { kind: "hang" }
  | { kind: "approve-after"; ms: number };

class MockApprovalChannel implements ApprovalChannel {
  readonly name = "mock";
  proposals: ProposalPayload[] = [];
  results: Array<{ id: string; outcome: ProposalOutcome }> = [];
  waitBehavior: WaitBehavior = { kind: "approve" };
  private _nextId = 1;
  disposed = false;

  async postProposal(proposal: ProposalPayload): Promise<PostProposalResult> {
    this.proposals.push(proposal);
    return { channel: "mock", proposalId: `proposal-${this._nextId++}` };
  }

  async waitForApproval(proposalId: string, signal: AbortSignal): Promise<ApprovalResult> {
    const behavior = this.waitBehavior;

    if (behavior.kind === "approve") {
      return { approved: true, channel: "mock", approver: "human" };
    }
    if (behavior.kind === "reject") {
      return { approved: false, channel: "mock", approver: "human" };
    }
    if (behavior.kind === "hang") {
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    }
    if (behavior.kind === "approve-after") {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve({ approved: true, channel: "mock", approver: "human" });
        }, behavior.ms);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    }
    throw new Error("Unknown behavior");
  }

  async postResult(proposalId: string, result: ProposalOutcome): Promise<PostResultOutcome> {
    this.results.push({ id: proposalId, outcome: result });
    return { ok: true };
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

const WORKSPACE = "/test-workspace";

const DEFAULT_CONFIG: SoulguardConfig = {
  version: 1,
  guardian: "soulguardian",
  files: { "SOUL.md": "protect" },
};

function setupOps(): MockSystemOps {
  const ops = new MockSystemOps(WORKSPACE);
  // Canonical SOUL.md
  ops.addFile("SOUL.md", "original soul content", {
    owner: "soulguardian",
    group: "soulguard",
    mode: "444",
  });
  // Staged SOUL.md with different content
  ops.addDirectory(".soulguard-staging");
  ops.addFile(".soulguard-staging/SOUL.md", "modified soul content", {
    owner: "agent",
    group: "staff",
    mode: "644",
  });
  // System user/group for apply
  ops.addUser("soulguardian");
  ops.addGroup("soulguard");
  return ops;
}

function createManager(
  ops: MockSystemOps,
  channel: MockApprovalChannel,
  config?: SoulguardConfig,
): ProposalManager {
  return new ProposalManager({
    ops,
    config: config ?? DEFAULT_CONFIG,
    channel,
    workspaceRoot: WORKSPACE,
  });
}

// ── Tests ────────────────────────────────────────────────────────────

describe("ProposalManager", () => {
  let ops: MockSystemOps;
  let channel: MockApprovalChannel;

  beforeEach(() => {
    ops = setupOps();
    channel = new MockApprovalChannel();
  });

  // ── Happy path ─────────────────────────────────────────────────────

  test("posts proposal to channel on staging ready", async () => {
    channel.waitBehavior = { kind: "approve" };
    const mgr = createManager(ops, channel);
    await mgr.onStagingReady();

    expect(channel.proposals.length).toBe(1);
    expect(channel.proposals[0]!.files.length).toBe(1);
    expect(channel.proposals[0]!.files[0]!.path).toBe("SOUL.md");
    expect(channel.proposals[0]!.files[0]!.status).toBe("modified");
    expect(channel.proposals[0]!.hash).toBeTruthy();
  });

  test("applies changes on approval", async () => {
    channel.waitBehavior = { kind: "approve" };
    const mgr = createManager(ops, channel);

    const events: string[] = [];
    mgr.on("applied", () => events.push("applied"));

    await mgr.onStagingReady();

    expect(events).toContain("applied");
    expect(channel.results.some((r) => r.outcome === "applied")).toBe(true);
    expect(mgr.activeProposal).toBeNull();
  });

  // ── Rejection ──────────────────────────────────────────────────────

  test("handles rejection", async () => {
    channel.waitBehavior = { kind: "reject" };
    const mgr = createManager(ops, channel);

    const events: string[] = [];
    mgr.on("rejected", () => events.push("rejected"));

    await mgr.onStagingReady();

    expect(events).toContain("rejected");
    expect(channel.results.some((r) => r.outcome === "rejected")).toBe(true);
    expect(mgr.activeProposal).toBeNull();
  });

  // ── Supersession ───────────────────────────────────────────────────

  test("supersedes pending proposal on new staging ready", async () => {
    channel.waitBehavior = { kind: "hang" };
    const mgr = createManager(ops, channel);

    const events: string[] = [];
    mgr.on("superseded", () => events.push("superseded"));
    mgr.on("proposed", () => events.push("proposed"));

    // Start first proposal (will hang on waitForApproval)
    const firstFlow = mgr.onStagingReady();

    // Need to let the first flow proceed to the point where it's waiting
    // Use a small delay
    await new Promise((r) => setTimeout(r, 10));

    expect(mgr.activeProposal).not.toBeNull();
    const firstId = mgr.activeProposal!.externalId;

    // Now switch to auto-approve for second proposal
    channel.waitBehavior = { kind: "approve" };

    // Second staging ready supersedes the first
    await mgr.onStagingReady();

    // Wait for first flow to settle
    await firstFlow.catch(() => {});

    expect(events).toContain("superseded");
    expect(channel.results.some((r) => r.id === firstId && r.outcome === "superseded")).toBe(true);
    expect(channel.proposals.length).toBe(2);
  });

  test("abort signal cancels waitForApproval", async () => {
    let abortFired = false;
    const customChannel: ApprovalChannel = {
      name: "test",
      async postProposal(p) {
        return { channel: "test", proposalId: "p1" };
      },
      async waitForApproval(id, signal) {
        return new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            abortFired = true;
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      },
      async postResult() {
        return { ok: true };
      },
      async dispose() {},
    };

    const mgr = new ProposalManager({
      ops,
      config: DEFAULT_CONFIG,
      channel: customChannel,
      workspaceRoot: WORKSPACE,
    });

    const flow = mgr.onStagingReady();
    await new Promise((r) => setTimeout(r, 10));

    await mgr.dispose();
    await flow.catch(() => {});

    expect(abortFired).toBe(true);
  });

  // ── Content verification ───────────────────────────────────────────

  test("rejects approval when staging modified after proposal", async () => {
    channel.waitBehavior = { kind: "approve-after", ms: 50 };
    const mgr = createManager(ops, channel);

    const events: string[] = [];
    mgr.on("rejected", () => events.push("rejected"));
    mgr.on("proposed", () => events.push("proposed"));

    // Start the flow — it'll wait 50ms before approving
    const flowPromise = mgr.onStagingReady();

    // Modify staging while waiting for approval
    await new Promise((r) => setTimeout(r, 10));
    ops.addFile(".soulguard-staging/SOUL.md", "tampered content after proposal");

    await flowPromise;

    expect(events).toContain("rejected");
    expect(channel.results.some((r) => r.outcome === "rejected")).toBe(true);
  });

  // ── Apply failure ──────────────────────────────────────────────────

  test("handles apply failure gracefully", async () => {
    // Use approve-after so we can inject a failure between proposal and apply
    channel.waitBehavior = { kind: "approve-after", ms: 50 };

    const mgr = createManager(ops, channel);
    const errors: string[] = [];
    mgr.on("error", (err) => errors.push(err.message));

    // Start the flow
    const flowPromise = mgr.onStagingReady();

    // After proposal posted but before approval, make hashFile fail
    // This will cause the per-file integrity check in apply() to fail
    await new Promise((r) => setTimeout(r, 20));
    ops.failingHashes.add("SOUL.md");

    await flowPromise;

    // apply should have failed, resulting in rejection
    expect(channel.results.some((r) => r.outcome === "rejected")).toBe(true);
    expect(errors.length).toBeGreaterThan(0);
  });

  // ── Description ────────────────────────────────────────────────────

  test("includes .description in ProposalPayload", async () => {
    ops.addFile(".soulguard-staging/.description", "Updated SOUL.md");
    channel.waitBehavior = { kind: "approve" };
    const mgr = createManager(ops, channel);

    await mgr.onStagingReady();

    expect(channel.proposals[0]!.description).toBe("Updated SOUL.md");
  });

  // ── Empty diff ─────────────────────────────────────────────────────

  test("does not post proposal when staging has no actual changes", async () => {
    // Make staging content match canonical
    ops.addFile(".soulguard-staging/SOUL.md", "original soul content");

    const mgr = createManager(ops, channel);
    await mgr.onStagingReady();

    expect(channel.proposals.length).toBe(0);
  });

  // ── Dispose ────────────────────────────────────────────────────────

  test("dispose cancels pending waitForApproval", async () => {
    channel.waitBehavior = { kind: "hang" };
    const mgr = createManager(ops, channel);

    const flow = mgr.onStagingReady();
    await new Promise((r) => setTimeout(r, 10));

    expect(mgr.activeProposal).not.toBeNull();

    await mgr.dispose();
    await flow.catch(() => {});

    expect(mgr.activeProposal).toBeNull();
  });

  test("dispose is safe to call with no active proposal", async () => {
    const mgr = createManager(ops, channel);
    await mgr.dispose(); // Should not throw
  });
});
