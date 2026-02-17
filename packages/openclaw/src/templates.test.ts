import { describe, expect, test } from "bun:test";
import { ALL_KNOWN_PATHS, templates } from "./templates.js";

describe("templates", () => {
  for (const [name, template] of Object.entries(templates)) {
    test(`${name}: accounts for all known paths`, () => {
      const allInTemplate = [...template.vault, ...template.ledger, ...template.unprotected];
      const sorted = (arr: string[]) => [...arr].sort();

      expect(sorted(allInTemplate)).toEqual(sorted([...ALL_KNOWN_PATHS]));
    });

    test(`${name}: no path appears in multiple tiers`, () => {
      const vaultSet = new Set(template.vault);
      const ledgerSet = new Set(template.ledger);
      const unprotectedSet = new Set(template.unprotected);

      for (const path of template.vault) {
        expect(ledgerSet.has(path)).toBe(false);
        expect(unprotectedSet.has(path)).toBe(false);
      }
      for (const path of template.ledger) {
        expect(vaultSet.has(path)).toBe(false);
        expect(unprotectedSet.has(path)).toBe(false);
      }
      for (const path of template.unprotected) {
        expect(vaultSet.has(path)).toBe(false);
        expect(ledgerSet.has(path)).toBe(false);
      }
    });

    test(`${name}: soulguard.json is always in vault`, () => {
      expect(template.vault).toContain("soulguard.json");
    });
  }
});
