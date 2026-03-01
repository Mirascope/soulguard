import { describe, expect, test } from "bun:test";
import { ALL_KNOWN_PATHS, templates } from "./templates.js";

describe("templates", () => {
  for (const [name, template] of Object.entries(templates)) {
    test(`${name}: accounts for all known paths`, () => {
      const allInTemplate = [...template.protect, ...template.watch, ...template.unprotected];
      const sorted = (arr: string[]) => [...arr].sort();

      expect(sorted(allInTemplate)).toEqual(sorted([...ALL_KNOWN_PATHS]));
    });

    test(`${name}: no path appears in multiple tiers`, () => {
      const protectSet = new Set(template.protect);
      const ledgerSet = new Set(template.watch);
      const unprotectedSet = new Set(template.unprotected);

      for (const path of template.protect) {
        expect(ledgerSet.has(path)).toBe(false);
        expect(unprotectedSet.has(path)).toBe(false);
      }
      for (const path of template.watch) {
        expect(protectSet.has(path)).toBe(false);
        expect(unprotectedSet.has(path)).toBe(false);
      }
      for (const path of template.unprotected) {
        expect(protectSet.has(path)).toBe(false);
        expect(ledgerSet.has(path)).toBe(false);
      }
    });

    test(`${name}: soulguard.json is always in protect tier`, () => {
      expect(template.protect).toContain("soulguard.json");
    });
  }
});
