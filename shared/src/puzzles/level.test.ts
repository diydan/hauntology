import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { lockLevel } from "./level";
import { KINDS, LEVELS, MEMORY_KINDS, PUZZLE_SETTINGS } from "./types";

describe("Property 21: The level follows the Haunt, and a clue always fits", () => {
  it("steps up at Haunt 3 and 6, up to hard, never below the setting, one step at most under Gentle; Memory Kinds keep their Sight's level", () => {
    fc.assert(fc.property(fc.constantFrom(...PUZZLE_SETTINGS), fc.boolean(), fc.integer({ min: 0, max: 12 }), fc.constantFrom(...KINDS), fc.constantFrom(...LEVELS), (setting, gentle, haunt, kind, sightLevel) => {
      const l = lockLevel(setting, gentle, haunt, kind, sightLevel);
      if (setting === "off") { expect(l).toBeNull(); return; }
      if (MEMORY_KINDS.includes(kind)) { expect(l).toBe(sightLevel); return; }
      const i = LEVELS.indexOf(l!);
      const start = LEVELS.indexOf(setting);
      expect(i).toBeGreaterThanOrEqual(start);
      expect(i - start).toBeLessThanOrEqual(gentle ? 1 : 2);
      expect(i).toBe(Math.min(2, start + Math.min(gentle ? 1 : 2, (haunt >= 3 ? 1 : 0) + (haunt >= 6 ? 1 : 0))));
      if (haunt < 3) expect(l).toBe(setting);
    }));
    expect(lockLevel("easy", false, 6, "lockpick", "easy")).toBe("hard");
    expect(lockLevel("easy", true, 9, "lockpick", "easy")).toBe("medium");
    expect(lockLevel("medium", false, 3, "safe", "medium")).toBe("medium");
  });
});
