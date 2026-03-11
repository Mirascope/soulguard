#!/usr/bin/env bun
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const rootDir = join(import.meta.dir, "..");
const packagesDir = join(rootDir, "packages");

interface PackageInfo {
  name: string;
  version: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  dir: string;
}

async function readPackageJson(dir: string) {
  return Bun.file(join(dir, "package.json")).json();
}

async function isPublished(name: string, version: string): Promise<boolean> {
  const proc = Bun.spawn(["npm", "view", `${name}@${version}`, "version"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  return exitCode === 0;
}

async function build(pkg: PackageInfo) {
  console.log(`🔨 Building ${pkg.name}...`);
  const proc = Bun.spawn(["bun", "run", "build"], {
    cwd: pkg.dir,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Failed to build ${pkg.name}`);
  }
}

async function publish(pkg: PackageInfo) {
  console.log(`📦 Publishing ${pkg.name}@${pkg.version}...`);
  const proc = Bun.spawn(["bun", "publish", "--access", "public"], {
    cwd: pkg.dir,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Failed to publish ${pkg.name}@${pkg.version}`);
  }
  console.log(`✅ Published ${pkg.name}@${pkg.version}`);
}

/** Topological sort based on internal dependency edges. */
function topoSort(packages: Map<string, PackageInfo>): PackageInfo[] {
  const names = new Set(packages.keys());
  const deps = new Map<string, string[]>();
  for (const [name, pkg] of packages) {
    deps.set(
      name,
      Object.keys(pkg.dependencies ?? {}).filter((d) => names.has(d)),
    );
  }

  const sorted: PackageInfo[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(name: string) {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      throw new Error(`Circular dependency detected involving ${name}`);
    }
    visiting.add(name);
    for (const dep of deps.get(name) ?? []) {
      visit(dep);
    }
    visiting.delete(name);
    visited.add(name);
    sorted.push(packages.get(name)!);
  }

  for (const name of names) {
    visit(name);
  }
  return sorted;
}

async function main() {
  // Verify versions are in sync before publishing
  const checkProc = Bun.spawn(["bun", "scripts/bump-version.ts", "--check"], {
    cwd: rootDir,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await checkProc.exited) !== 0) {
    throw new Error("Version mismatch detected. Run 'bun run bump-version <version>' first.");
  }

  const entries = await readdir(packagesDir, { withFileTypes: true });
  const packages = new Map<string, PackageInfo>();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(packagesDir, entry.name);
    const pkg = await readPackageJson(dir);
    packages.set(pkg.name, {
      name: pkg.name,
      version: pkg.version,
      private: pkg.private,
      dependencies: pkg.dependencies,
      dir,
    });
  }

  const sorted = topoSort(packages);

  for (const pkg of sorted) {
    if (pkg.private) {
      console.log(`⏭️  Skipping ${pkg.name} (private)`);
      continue;
    }
    if (pkg.version === "0.0.0") {
      console.log(`⏭️  Skipping ${pkg.name} (version 0.0.0, not ready)`);
      continue;
    }

    if (await isPublished(pkg.name, pkg.version)) {
      console.log(`✅ ${pkg.name}@${pkg.version} already published, skipping`);
      continue;
    }

    await build(pkg);
    await publish(pkg);
  }

  console.log("\n🎉 Done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
