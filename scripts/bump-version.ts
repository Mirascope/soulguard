#!/usr/bin/env bun
/**
 * Bump version across the entire monorepo (root + all workspace packages).
 *
 * Usage:
 *   bun scripts/bump-version.ts 2.0.0      # set explicit version
 *   bun scripts/bump-version.ts --patch     # 1.2.3 → 1.2.4
 *   bun scripts/bump-version.ts --minor     # 1.2.3 → 1.3.0
 *   bun scripts/bump-version.ts --major     # 1.2.3 → 2.0.0
 *   bun scripts/bump-version.ts --check     # exit 1 if packages are out of sync (for pre-commit)
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const rootDir = join(import.meta.dir, "..");
const packagesDir = join(rootDir, "packages");

function parseVersion(v: string): [number, number, number] {
  const parts = v.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid semver: ${v}`);
  }
  return parts as [number, number, number];
}

function bumpVersion(current: string, type: "patch" | "minor" | "major"): string {
  const [major, minor, patch] = parseVersion(current);
  switch (type) {
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "major":
      return `${major + 1}.0.0`;
  }
}

async function readPkgJson(dir: string) {
  return Bun.file(join(dir, "package.json")).json();
}

async function writePkgJson(dir: string, pkg: Record<string, unknown>) {
  await Bun.write(join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
}

async function getPackageDirs(): Promise<string[]> {
  const entries = await readdir(packagesDir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => join(packagesDir, e.name));
}

async function check(rootVersion: string, dirs: string[]): Promise<boolean> {
  const mismatches: string[] = [];
  for (const dir of dirs) {
    const pkg = await readPkgJson(dir);
    if (pkg.version !== rootVersion) {
      mismatches.push(`  ${pkg.name}: ${pkg.version}`);
    }
  }
  if (mismatches.length > 0) {
    console.error(`Version mismatch! Root is ${rootVersion} but:\n${mismatches.join("\n")}`);
    console.error('\nRun "bun run bump-version <version>" to fix.');
    return false;
  }
  return true;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error(
      "Usage: bun scripts/bump-version.ts <version | --patch | --minor | --major | --check>",
    );
    process.exit(1);
  }

  const rootPkg = await readPkgJson(rootDir);
  const currentVersion: string = rootPkg.version;
  const dirs = await getPackageDirs();

  // --check mode: just verify all versions match
  if (args[0] === "--check") {
    const ok = await check(currentVersion, dirs);
    if (ok) console.log(`All packages at ${currentVersion}`);
    process.exit(ok ? 0 : 1);
  }

  // Determine new version
  let newVersion: string;
  if (args[0] === "--patch" || args[0] === "--minor" || args[0] === "--major") {
    newVersion = bumpVersion(currentVersion, args[0].slice(2) as "patch" | "minor" | "major");
  } else {
    parseVersion(args[0]); // validate
    newVersion = args[0];
  }

  // Write root
  rootPkg.version = newVersion;
  await writePkgJson(rootDir, rootPkg);
  console.log(`  root → ${newVersion}`);

  // Write all packages
  for (const dir of dirs) {
    const pkg = await readPkgJson(dir);
    pkg.version = newVersion;
    await writePkgJson(dir, pkg);
    console.log(`  ${pkg.name} → ${newVersion}`);
  }

  console.log(`\nBumped all packages from ${currentVersion} to ${newVersion}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
