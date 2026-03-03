#!/usr/bin/env bun
/**
 * E2E test runner. Import all test files, then run.
 *
 *   bun test-e2e/run.ts                       # verify all snapshots
 *   bun test-e2e/run.ts --update              # rewrite all expect() strings
 *   bun test-e2e/run.ts watch.test.ts         # run only matching files
 *   bun test-e2e/run.ts --update watch diff   # update only watch + diff tests
 */

import { Glob } from "bun";
import { run } from "./harness";

// Positional args (not --flags) are file filters
const filters = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const glob = new Glob("cases/*.test.ts");
for await (const path of glob.scan(import.meta.dir)) {
  if (filters.length > 0 && !filters.some((f) => path.includes(f))) continue;
  await import(`./${path}`);
}

await run();
