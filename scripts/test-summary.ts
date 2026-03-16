/**
 * Runs `bun test` in each workspace package sequentially,
 * captures output, and prints only failures + a final summary.
 *
 * Usage: bun scripts/test-summary.ts
 */

import { $ } from "bun";

const packages = ["packages/openclaw", "packages/discord", "packages/core"];

interface PkgResult {
  name: string;
  passed: boolean;
  output: string;
  summary: string;
}

const results: PkgResult[] = [];

for (const pkg of packages) {
  const pkgJson = await Bun.file(`${pkg}/package.json`).json();
  const name: string = pkgJson.name;
  const testScript: string | undefined = pkgJson.scripts?.test;
  if (!testScript) {
    results.push({ name, passed: true, output: "", summary: "no test script" });
    continue;
  }

  // Extract args from the test script (e.g. "bun test src/" → "src/")
  const args = testScript.replace(/^bun test\s*/, "").trim();
  const cmd = args ? ["bun", "test", args] : ["bun", "test"];

  const proc = Bun.spawn(cmd, {
    cwd: pkg,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, FORCE_COLOR: "1", BUN_TEST_TIMEOUT: "10000" },
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  const output = stdout + stderr;

  // Extract the summary line (e.g. "Ran 10 tests across 1 file.")
  const summaryMatch = output.match(/Ran \d+ tests.*$/m);
  const failMatch = output.match(/\d+ fail/);
  const passMatch = output.match(/\d+ pass/);
  const summary = [passMatch?.[0], failMatch?.[0], summaryMatch?.[0]].filter(Boolean).join(", ");

  results.push({
    name,
    passed: exitCode === 0,
    output,
    summary: summary || (exitCode === 0 ? "ok" : `exit ${exitCode}`),
  });
}

// Print failures in full
const failures = results.filter((r) => !r.passed);
if (failures.length > 0) {
  for (const f of failures) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`FAIL: ${f.name}`);
    console.log("─".repeat(60));
    console.log(f.output);
  }
}

// Print summary table
console.log(`\n${"─".repeat(60)}`);
console.log("Summary");
console.log("─".repeat(60));
for (const r of results) {
  const icon = r.passed ? "✓" : "✗";
  console.log(`  ${icon} ${r.name}: ${r.summary}`);
}

const total = results.length;
const failed = failures.length;
if (failed > 0) {
  console.log(`\n${failed}/${total} packages failed.`);
  process.exit(1);
} else {
  console.log(`\n${total}/${total} packages passed.`);
}
