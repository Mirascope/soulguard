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
  test("parses valid pending proposal", () => {
    const meta = proposalSchema.parse({
      id: "01JMTEST000000000000000000",
      file: "SOUL.md",
      message: "added rhetoric principle",
      createdAt: "2026-02-17T20:55:00.000Z",
      status: "pending",
    });
    expect(meta.id).toBe("01JMTEST000000000000000000");
    expect(meta.status).toBe("pending");
    expect(meta.resolvedAt).toBeUndefined();
  });

  test("parses approved proposal with resolvedAt", () => {
    const meta = proposalSchema.parse({
      id: "01JMTEST000000000000000000",
      file: "SOUL.md",
      message: "added rhetoric principle",
      createdAt: "2026-02-17T20:55:00.000Z",
      status: "approved",
      resolvedAt: "2026-02-17T21:00:00.000Z",
    });
    expect(meta.status).toBe("approved");
    expect(meta.resolvedAt).toBe("2026-02-17T21:00:00.000Z");
  });

  test("rejects invalid status", () => {
    expect(() =>
      proposalSchema.parse({
        id: "01JMTEST000000000000000000",
        file: "SOUL.md",
        message: "test",
        createdAt: "2026-02-17T20:55:00.000Z",
        status: "maybe",
      }),
    ).toThrow();
  });

  test("rejects missing required fields", () => {
    expect(() => proposalSchema.parse({ id: "01JMTEST" })).toThrow();
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
