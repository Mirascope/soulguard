/**
 * E2E snapshot test harness for soulguard CLI.
 *
 * Each test is a sequence of shell commands with inline expected output.
 * Commands and snapshots live in the same file — no cross-referencing.
 *
 * Usage in test files:
 *
 *   import { e2e } from "../harness";
 *
 *   e2e("my test", (t) => {
 *     // Snapshot includes exit code + output (auto-updated by --update)
 *     t.$(`echo hello`).expect(`
 *       exit 0
 *       hello
 *     `);
 *
 *     // Snapshot + invariants (never auto-updated, checked every run)
 *     t.$(`soulguard status`).expect(`
 *       exit 0
 *       All files ok.
 *     `).exits(0).outputs(/All files ok/);
 *
 *     // Multiple output patterns chain naturally
 *     t.$(`su - agent -c "echo hacked > file"`).expect(`
 *       exit 1
 *       Permission denied
 *     `).exits(1).outputs(/Permission denied/).outputs(/hacked/);
 *   });
 *
 * Run:    bun test-e2e/run.ts              # verify snapshots
 * Update: bun test-e2e/run.ts --update     # rewrite expect() strings in-place
 *
 * Note: Use \$(cmd) instead of $(cmd) inside t.$() backtick strings
 * to avoid TypeScript template literal interpolation.
 */

import { $ } from "bun";

// ── Types ──────────────────────────────────────────────────────────────

interface Step {
  command: string;
  expected: string;
  exitCodes: number[];
  patterns: RegExp[];
}

interface InvariantChain {
  /** Invariant: command must exit with this code. Never auto-updated. */
  exits(code: number): InvariantChain;
  /** Invariant: output must match this pattern. Never auto-updated. Chainable. */
  outputs(pattern: RegExp): InvariantChain;
}

interface StepChain {
  /** Expected snapshot (exit code + output). Auto-updated by --update. */
  expect(expected: string): InvariantChain;
}

interface TestContext {
  /** Run a shell command. Chain with .expect() for expected output. */
  $(command: string): StepChain;
}

interface TestCase {
  name: string;
  file: string;
  steps: Step[];
  skip?: boolean;
}

// ── Registry ───────────────────────────────────────────────────────────

const registry: TestCase[] = [];

export function e2e(name: string, fn: (t: TestContext) => void): void {
  // Resolve the caller's file path from the call stack.
  // Scan all stack lines for the first .test.ts file.
  const err = new Error();
  const lines = err.stack?.split("\n") ?? [];
  let file = "unknown";
  for (const line of lines) {
    const match =
      line.match(/\((.+\.test\.ts):\d+(?::\d+)?\)/) ??
      line.match(/at (.+\.test\.ts):\d+/) ??
      line.match(/\s(.+\.test\.ts):\d+/);
    if (match?.[1]) {
      file = match[1];
      break;
    }
  }

  const steps: Step[] = [];

  const ctx: TestContext = {
    $(command: string): StepChain {
      const cmd = dedent(command);
      return {
        expect(expected: string): InvariantChain {
          const step: Step = {
            command: cmd,
            expected: dedent(expected),
            exitCodes: [],
            patterns: [],
          };
          steps.push(step);

          const chain: InvariantChain = {
            exits(code: number): InvariantChain {
              step.exitCodes.push(code);
              return chain;
            },
            outputs(pattern: RegExp): InvariantChain {
              step.patterns.push(pattern);
              return chain;
            },
          };
          return chain;
        },
      };
    },
  };

  fn(ctx);
  registry.push({ name, file, steps });
}

e2e.skip = function (name: string, fn: (t: TestContext) => void): void {
  e2e(name, fn);
  registry[registry.length - 1]!.skip = true;
};

// ── Runner ─────────────────────────────────────────────────────────────

export async function run(): Promise<void> {
  const update = process.argv.includes("--update");
  let pass = 0;
  let fail = 0;
  let skip = 0;
  const failedTests: { name: string; file: string; messages: string[] }[] = [];
  const pendingUpdates: { test: TestCase; results: StepResult[] }[] = [];
  const passed: { test: TestCase; status: Status }[] = [];

  for (const test of registry) {
    if (test.skip) {
      skip++;
      console.log(`SKIP: ${test.name}`);
      continue;
    }
    const result = await runTest(test, update);
    if (result.status === "PASS" || result.status === "UPDATED") {
      pass++;
      passed.push({ test, status: result.status });
      if (result.status === "UPDATED") {
        pendingUpdates.push({ test, results: result.stepResults! });
      }
    } else {
      fail++;
      console.log(`FAIL: ${test.name}`);
      for (const msg of result.messages) console.log(msg);
      failedTests.push({ name: test.name, file: test.file, messages: result.messages });
      if (result.stepResults) {
        pendingUpdates.push({ test, results: result.stepResults });
      }
    }
  }

  // Write all snapshot updates grouped by file so tests sharing a file
  // don't clobber each other's .expect() strings.
  // Build a map of test name → results for quick lookup.
  const updatedMap = new Map<string, StepResult[]>();
  for (const entry of pendingUpdates) {
    updatedMap.set(entry.test.name, entry.results);
  }

  // Group by file, preserving registry order within each file.
  // Each segment is either results (update) or a skip count (leave alone).
  const seen = new Set<string>();
  for (const entry of pendingUpdates) {
    if (seen.has(entry.test.file)) continue;
    seen.add(entry.test.file);
    const segments: SnapshotSegment[] = registry
      .filter((t) => t.file === entry.test.file)
      .map((t) => ({
        stepCount: t.steps.length,
        results: updatedMap.get(t.name) ?? null,
      }));
    await updateSnapshots(entry.test.file, segments);
  }

  for (const { test, status } of passed) {
    console.log(`${status}: ${test.name}`);
  }

  if (failedTests.length > 0) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Failures:\n`);
    for (const t of failedTests) {
      console.log(`  FAIL: ${t.name}  (${t.file})`);
      for (const msg of t.messages) console.log(`  ${msg}`);
      console.log();
    }
  }

  const parts = [`${pass} passed`, `${fail} failed`];
  if (skip > 0) parts.push(`${skip} skipped`);
  console.log(parts.join(", "));
  if (fail > 0) process.exit(1);
}

/** Delimiters separating each step's output in the combined shell script. */
const STEP_DELIM = `__SOULGUARD_E2E_STEP__`;
const EXIT_DELIM = `__SOULGUARD_E2E_EXIT__`;

interface StepResult {
  output: string;
  exitCode: number;
}

type Status = "PASS" | "FAIL" | "UPDATED";

interface SnapshotSegment {
  stepCount: number;
  results: StepResult[] | null; // null = skip (test not updated)
}

interface TestResult {
  status: Status;
  messages: string[];
  stepResults?: StepResult[];
}

/** Format a StepResult as the snapshot string: "exit N" on first line, then output. */
/** Format a StepResult as the snapshot string. */
function formatSnapshot(result: StepResult): string {
  if (result.output.length === 0) return `exit ${result.exitCode}`;
  return `exit ${result.exitCode}\n${result.output}`;
}

async function runTest(test: TestCase, update: boolean): Promise<TestResult> {
  // Build a single shell script that runs every step and separates output
  // with a unique delimiter so we can split per-step results.
  const scriptParts: string[] = [
    // Create isolated workspace
    `workspace=$(mktemp -d /tmp/soulguard-e2e-XXXX)`,
    `chmod 755 "$workspace"`,
    `cd "$workspace"`,
    `export NO_COLOR=1`,
  ];

  for (let i = 0; i < test.steps.length; i++) {
    if (i > 0) scriptParts.push(`printf '%s\\n' '${STEP_DELIM}'`);
    const cmd = test.steps[i]!.command;
    // Run command, capture exit code separately
    scriptParts.push(`{ ${cmd}\n} 2>&1`, `printf '%s:%d\\n' '${EXIT_DELIM}' $?`);
  }

  const script = scriptParts.join("\n");

  // Run in Docker — complete isolation per test
  const image = "soulguard-e2e";
  const dockerResult = await $`docker run --rm ${image} bash -c ${script}`.quiet().nothrow();

  const rawOutput = dockerResult.stdout.toString();

  // Normalize the random workspace path to /workspace
  const workspaceMatch = rawOutput.match(/\/tmp\/soulguard-e2e-\w+/);
  const workspacePath = workspaceMatch?.[0] ?? "/tmp/soulguard-e2e-XXXX";
  const withWorkspace = rawOutput.replaceAll(workspacePath, "/workspace");
  // Normalize git short hashes (7-char hex before known commit messages)
  const normalized = withWorkspace.replace(/[0-9a-f]{7} (soulguard: )/g, "GITHASH $1");

  // Split by step delimiter, then extract exit code from each chunk
  const rawSteps = normalized.split(`${STEP_DELIM}\n`);
  const results: StepResult[] = rawSteps.map(parseStepResult);

  if (update) {
    // Check invariants — failures still update snapshots (for debugging)
    // but the test is reported as FAIL.
    const invariantFailures = checkInvariants(test, results);
    const allMatch = test.steps.every(
      (step, i) => formatSnapshot(results[i] ?? { output: "", exitCode: -1 }) === step.expected,
    );
    if (invariantFailures.length > 0) {
      return {
        status: "FAIL",
        messages: invariantFailures.map((m) => `  ${m}`),
        stepResults: allMatch ? undefined : results,
      };
    }
    return allMatch
      ? { status: "PASS", messages: [] }
      : { status: "UPDATED", messages: [], stepResults: results };
  }

  // Compare each step
  const messages: string[] = [];
  for (let i = 0; i < test.steps.length; i++) {
    const step = test.steps[i]!;
    const result = results[i] ?? { output: "", exitCode: -1 };
    const label = truncate(step.command, 60);
    const actualSnap = formatSnapshot(result);

    if (actualSnap !== step.expected) {
      messages.push(`  Step ${i + 1}: ${label}`);
      messages.push(...formatDiff(step.expected, actualSnap));
    }

    // Check invariants
    const failures = checkStepInvariants(i, step, result);
    for (const msg of failures) messages.push(`  ${msg}`);
  }

  return messages.length === 0 ? { status: "PASS", messages: [] } : { status: "FAIL", messages };
}

function parseStepResult(chunk: string): StepResult {
  // Exit code is on the last line as __SOULGUARD_E2E_EXIT__:N
  const exitMatch = chunk.match(new RegExp(`${EXIT_DELIM}:(\\d+)\\n?$`));
  const exitCode = exitMatch ? parseInt(exitMatch[1]!, 10) : -1;

  // Output is everything before the exit code line
  const output = exitMatch
    ? chunk.slice(0, exitMatch.index).replace(/\n$/, "")
    : chunk.replace(/\n$/, "");

  return { output, exitCode };
}

function checkStepInvariants(stepIdx: number, step: Step, result: StepResult): string[] {
  const failures: string[] = [];
  const label = truncate(step.command, 60);

  for (const code of step.exitCodes) {
    if (result.exitCode !== code) {
      failures.push(
        `Step ${stepIdx + 1}: ${label}\n` + `    exits: expected ${code}, got ${result.exitCode}`,
      );
    }
  }

  for (const pattern of step.patterns) {
    if (!pattern.test(result.output)) {
      failures.push(
        `Step ${stepIdx + 1}: ${label}\n` + `    outputs: must match ${pattern}, but didn't`,
      );
    }
  }

  return failures;
}

function checkInvariants(test: TestCase, results: StepResult[]): string[] {
  const failures: string[] = [];
  for (let i = 0; i < test.steps.length; i++) {
    const step = test.steps[i]!;
    const result = results[i] ?? { output: "", exitCode: -1 };
    failures.push(...checkStepInvariants(i, step, result));
  }
  return failures;
}

// ── Snapshot updater ───────────────────────────────────────────────────

async function updateSnapshots(filePath: string, segments: SnapshotSegment[]): Promise<boolean> {
  const file = Bun.file(filePath);
  const original = await file.text();
  let source = original;

  // Flatten segments into a per-.expect() action list:
  // each entry is either a StepResult (replace) or null (skip).
  const actions: (StepResult | null)[] = [];
  for (const seg of segments) {
    if (seg.results) {
      for (const r of seg.results) actions.push(r);
    } else {
      for (let i = 0; i < seg.stepCount; i++) actions.push(null);
    }
  }

  // Walk through .expect(...) calls in order and replace or skip.
  let actionIndex = 0;
  let searchFrom = 0;

  while (actionIndex < actions.length) {
    const expectCallIdx = source.indexOf(".expect(", searchFrom);
    if (expectCallIdx === -1) break;

    const afterParen = expectCallIdx + ".expect(".length;
    const delim = source[afterParen];

    if (delim !== "`" && delim !== '"' && delim !== "'") {
      searchFrom = afterParen;
      continue;
    }

    // Find the closing delimiter (handling escapes)
    const contentStart = afterParen + 1;
    let contentEnd = contentStart;
    while (contentEnd < source.length) {
      if (source[contentEnd] === "\\") {
        contentEnd += 2;
      } else if (
        (delim === "`" && source[contentEnd] === "`") ||
        (delim !== "`" && source[contentEnd] === delim)
      ) {
        break;
      } else {
        contentEnd++;
      }
    }

    const action = actions[actionIndex] ?? null;
    if (action === null) {
      // Skip — leave this .expect() untouched
      searchFrom = contentEnd + 1;
      actionIndex++;
      continue;
    }

    const snap = formatSnapshot(action).replaceAll("`", "\\`");

    // Detect indentation of the line containing .expect(
    const lineStart = source.lastIndexOf("\n", expectCallIdx) + 1;
    const lineText = source.slice(lineStart, expectCallIdx);
    const indent = lineText.match(/^(\s*)/)?.[1] ?? "  ";

    // Build replacement: indent each line of snapshot
    const indented = snap
      .split("\n")
      .map((line) => (line.length > 0 ? indent + "  " + line : ""))
      .join("\n");
    const replacement = `\n${indented}\n${indent}`;

    if (delim === "`") {
      // Replace content inside existing backticks
      source = source.slice(0, contentStart) + replacement + source.slice(contentEnd);
      searchFrom = contentStart + replacement.length + 1;
    } else {
      // Convert to backtick string (multi-line content needs backticks)
      source = source.slice(0, afterParen) + "`" + replacement + "`" + source.slice(contentEnd + 1);
      searchFrom = afterParen + replacement.length + 2;
    }

    actionIndex++;
  }

  if (source === original) return false;
  await Bun.write(filePath, source);
  return true;
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Strip common leading whitespace from a template literal string. */
function dedent(s: string): string {
  const lines = s.split("\n");

  // Remove leading empty line (from opening backtick on its own line)
  if (lines[0]?.trim() === "") lines.shift();
  // Remove trailing empty line (from closing backtick on its own line)
  if (lines.length > 0 && lines[lines.length - 1]?.trim() === "") lines.pop();

  if (lines.length === 0) return "";

  // Find minimum indentation across non-empty lines
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^(\s*)/)?.[1]?.length ?? 0);
  const minIndent = Math.min(...indents);

  if (minIndent === 0) return lines.join("\n");
  return lines.map((l) => l.slice(minIndent)).join("\n");
}

function truncate(s: string, max: number): string {
  const oneLine = s.replace(/\n/g, " ").trim();
  return oneLine.length <= max ? oneLine : oneLine.slice(0, max - 3) + "...";
}

function formatDiff(expected: string, actual: string): string[] {
  const lines: string[] = [];
  const expLines = expected.split("\n");
  const actLines = actual.split("\n");
  const max = Math.max(expLines.length, actLines.length);
  for (let i = 0; i < max; i++) {
    const e = expLines[i];
    const a = actLines[i];
    if (e !== a) {
      if (e !== undefined) lines.push(`    - ${e}`);
      if (a !== undefined) lines.push(`    + ${a}`);
    }
  }
  return lines;
}
