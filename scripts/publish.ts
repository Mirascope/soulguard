#!/usr/bin/env bun
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const rootDir = join(import.meta.dir, "..");
const packagesDir = join(rootDir, "packages");

interface PackageInfo {
  name: string;
  version: string;
  private?: boolean;
  dir: string;
}

// Define publish order: core first, then openclaw, then soulguard meta
const PUBLISH_ORDER = ["@soulguard/core", "@soulguard/openclaw", "soulguard"];

async function readPackageJson(dir: string) {
  const raw = await Bun.file(join(dir, "package.json")).json();
  return raw;
}

async function isPublished(name: string, version: string): Promise<boolean> {
  const proc = Bun.spawn(["npm", "view", `${name}@${version}`, "version"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  return exitCode === 0;
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

async function main() {
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
      dir,
    });
  }

  // Publish in dependency order
  for (const name of PUBLISH_ORDER) {
    const pkg = packages.get(name);
    if (!pkg) {
      console.log(`⏭️  Skipping ${name} (not found)`);
      continue;
    }
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

    await publish(pkg);
  }

  // Publish any remaining packages not in PUBLISH_ORDER
  for (const [name, pkg] of packages) {
    if (PUBLISH_ORDER.includes(name)) continue;
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

    await publish(pkg);
  }

  console.log("\n🎉 Done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
