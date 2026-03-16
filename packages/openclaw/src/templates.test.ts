import { describe, expect, test } from "bun:test";
import { ALL_KNOWN_PATHS, templates } from "./templates.js";

describe("templates", () => {
  const sorted = (arr: readonly string[]) => [...arr].sort();

  for (const [name, template] of Object.entries(templates)) {
    test(`${name}: protect + watch + release = all known paths`, () => {
      const all = [...template.protect, ...template.watch, ...template.release];
      expect(sorted(all)).toEqual(sorted(ALL_KNOWN_PATHS));
    });

    test(`${name}: no path appears in multiple tiers`, () => {
      const protectSet = new Set(template.protect);
      const watchSet = new Set(template.watch);
      const releaseSet = new Set(template.release);

      for (const path of template.protect) {
        expect(watchSet.has(path)).toBe(false);
        expect(releaseSet.has(path)).toBe(false);
      }
      for (const path of template.watch) {
        expect(protectSet.has(path)).toBe(false);
        expect(releaseSet.has(path)).toBe(false);
      }
      for (const path of template.release) {
        expect(protectSet.has(path)).toBe(false);
        expect(watchSet.has(path)).toBe(false);
      }
    });
  }
});
