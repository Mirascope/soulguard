import { describe, expect, test } from "bun:test";
import { parseConfig, passwordHashSchema, proposalSchema } from "./schema.js";

describe("soulguardConfigSchema", () => {
  test("parses valid config", () => {
    const config = parseConfig({
      vault: ["SOUL.md", "AGENTS.md"],
      ledger: ["memory/**"],
    });
    expect(config.vault).toEqual(["SOUL.md", "AGENTS.md"]);
    expect(config.ledger).toEqual(["memory/**"]);
  });

  test("rejects missing vault", () => {
    expect(() => parseConfig({ ledger: [] })).toThrow();
  });

  test("rejects missing ledger", () => {
    expect(() => parseConfig({ vault: [] })).toThrow();
  });

  test("accepts empty arrays", () => {
    const config = parseConfig({ vault: [], ledger: [] });
    expect(config.vault).toEqual([]);
    expect(config.ledger).toEqual([]);
  });
});

describe("proposalSchema", () => {
  test("parses valid proposal", () => {
    const proposal = proposalSchema.parse({
      version: "1",
      message: "added rhetoric principle",
      createdAt: "2026-02-17T20:55:00.000Z",
      files: [
        { path: "SOUL.md", protectedHash: "abc123", stagedHash: "def456" },
        { path: "AGENTS.md", protectedHash: "ghi789", stagedHash: "jkl012" },
      ],
    });
    expect(proposal.version).toBe("1");
    expect(proposal.files).toHaveLength(2);
    expect(proposal.files[0]?.path).toBe("SOUL.md");
  });

  test("rejects wrong version", () => {
    expect(() =>
      proposalSchema.parse({
        version: "2",
        message: "test",
        createdAt: "2026-02-17T20:55:00.000Z",
        files: [],
      }),
    ).toThrow();
  });

  test("rejects missing files array", () => {
    expect(() =>
      proposalSchema.parse({
        version: "1",
        message: "test",
        createdAt: "2026-02-17T20:55:00.000Z",
      }),
    ).toThrow();
  });

  test("rejects file with missing hashes", () => {
    expect(() =>
      proposalSchema.parse({
        version: "1",
        message: "test",
        createdAt: "2026-02-17T20:55:00.000Z",
        files: [{ path: "SOUL.md" }],
      }),
    ).toThrow();
  });
});

describe("passwordHashSchema", () => {
  test("parses valid password hash", () => {
    const pw = passwordHashSchema.parse({
      hash: "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$somehash",
    });
    expect(pw.hash).toContain("argon2id");
  });

  test("rejects missing hash", () => {
    expect(() => passwordHashSchema.parse({})).toThrow();
  });
});
