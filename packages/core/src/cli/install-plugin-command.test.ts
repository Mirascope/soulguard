import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync, rmSync, lstatSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { InstallPluginCommand } from "./install-plugin-command.js";
import { registerPlugin } from "./plugin-registry.js";

const TEST_DIR = join(tmpdir(), "soulguard-install-plugin-test-" + process.pid);

class MockOutput {
  messages: { level: string; msg: string }[] = [];
  info(msg: string) {
    this.messages.push({ level: "info", msg });
  }
  success(msg: string) {
    this.messages.push({ level: "success", msg });
  }
  warn(msg: string) {
    this.messages.push({ level: "warn", msg });
  }
  error(msg: string) {
    this.messages.push({ level: "error", msg });
  }
  heading(msg: string) {
    this.messages.push({ level: "heading", msg });
  }
  write(msg: string) {
    this.messages.push({ level: "write", msg });
  }
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

/** Create a fake built plugin directory with dist/index.js + dist/manifest. */
function createFakePlugin(name: string): string {
  const dir = join(TEST_DIR, name);
  mkdirSync(join(dir, "dist"), { recursive: true });
  writeFileSync(join(dir, "dist", "index.js"), "");
  writeFileSync(join(dir, "dist", "openclaw.plugin.json"), '{"id":"soulguard"}');
  registerPlugin("openclaw", dir);
  return dir;
}

describe("InstallPluginCommand", () => {
  test("rejects unknown plugin name", async () => {
    const out = new MockOutput();
    writeFileSync(join(TEST_DIR, "openclaw.json"), "{}");
    const cmd = new InstallPluginCommand({ plugin: "nonexistent", workspace: TEST_DIR }, out);
    const code = await cmd.execute();
    expect(code).toBe(1);
    expect(out.messages.some((m) => m.msg.includes("Unknown plugin"))).toBe(true);
  });

  test("fails when no openclaw.json exists", async () => {
    const out = new MockOutput();
    const cmd = new InstallPluginCommand({ plugin: "openclaw", workspace: TEST_DIR }, out);
    const code = await cmd.execute();
    expect(code).toBe(1);
    expect(out.messages.some((m) => m.msg.includes("No openclaw.json"))).toBe(true);
  });

  test("fails when plugin is not registered", async () => {
    const out = new MockOutput();
    writeFileSync(join(TEST_DIR, "openclaw.json"), "{}");
    const cmd = new InstallPluginCommand({ plugin: "openclaw", workspace: TEST_DIR }, out);
    const code = await cmd.execute();
    expect(code).toBe(1);
    expect(out.messages.some((m) => m.msg.includes("Could not resolve"))).toBe(true);
  });

  test("creates symlinks in extensions/<pluginId>/", async () => {
    const out = new MockOutput();
    const fakeDir = createFakePlugin("fake-openclaw-symlink");
    writeFileSync(join(TEST_DIR, "openclaw.json"), "{}");

    const cmd = new InstallPluginCommand({ plugin: "openclaw", workspace: TEST_DIR }, out);
    const code = await cmd.execute();
    expect(code).toBe(0);
    expect(out.messages.some((m) => m.msg.includes("Installed"))).toBe(true);

    // Verify symlinks were created
    const extDir = join(TEST_DIR, "extensions", "soulguard");
    const indexLink = join(extDir, "index.js");
    const manifestLink = join(extDir, "openclaw.plugin.json");

    expect(lstatSync(indexLink).isSymbolicLink()).toBe(true);
    expect(lstatSync(manifestLink).isSymbolicLink()).toBe(true);
    expect(readlinkSync(indexLink)).toBe(join(fakeDir, "dist", "index.js"));
    expect(readlinkSync(manifestLink)).toBe(join(fakeDir, "dist", "openclaw.plugin.json"));
  });

  test("re-running is idempotent (updates symlinks)", async () => {
    const out = new MockOutput();
    createFakePlugin("fake-openclaw-idem");
    writeFileSync(join(TEST_DIR, "openclaw.json"), "{}");

    // Run twice
    const cmd1 = new InstallPluginCommand({ plugin: "openclaw", workspace: TEST_DIR }, out);
    expect(await cmd1.execute()).toBe(0);
    const cmd2 = new InstallPluginCommand({ plugin: "openclaw", workspace: TEST_DIR }, out);
    expect(await cmd2.execute()).toBe(0);

    // Symlinks still valid
    const indexLink = join(TEST_DIR, "extensions", "soulguard", "index.js");
    expect(lstatSync(indexLink).isSymbolicLink()).toBe(true);
  });

  test("cleans up stale load.paths entries", async () => {
    const out = new MockOutput();
    const fakeDir = createFakePlugin("fake-openclaw-stale");

    // Simulate old config with stale load.paths
    writeFileSync(
      join(TEST_DIR, "openclaw.json"),
      JSON.stringify({
        plugins: { load: { paths: [fakeDir, join(fakeDir, "dist")] } },
      }),
    );

    const cmd = new InstallPluginCommand({ plugin: "openclaw", workspace: TEST_DIR }, out);
    expect(await cmd.execute()).toBe(0);

    // Verify stale paths were removed
    const written = JSON.parse(readFileSync(join(TEST_DIR, "openclaw.json"), "utf-8"));
    const paths = written.plugins.load.paths as string[];
    expect(paths).toEqual([]);
  });
});
