import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { SCRIPTED_BANKS } from "./banks";
import { canonicalSpeechKey } from "./key";
import { buildLibrary, prefetchPlan, type LibraryEntry, type PrefetchView } from "./library";
import { FINITE_VALUES } from "./placeholders";

const entries = buildLibrary(SCRIPTED_BANKS, FINITE_VALUES);
const view = (over: Partial<PrefetchView> = {}): PrefetchView => ({
  phase: "playing",
  haunt: { level: 0, max: 10 },
  minutesToMidnight: null,
  ...over,
});

/** Keys of every entry whose source ids start with one of the prefixes (the test's own reading of a kind). */
const keysOf = (prefixes: string[]): string[] =>
  entries.filter((e) => e.sources.some((id) => prefixes.some((p) => id.startsWith(p)))).map((e: LibraryEntry) => canonicalSpeechKey(e.voice, e.spoken));

describe("prefetchPlan (ghost-voice 2.18: Prefetch without secrets)", () => {
  it("warms only the turn-start lines during ordinary play", () => {
    const plan = prefetchPlan(view(), entries);
    expect(plan.length).toBeGreaterThan(0);
    expect(new Set(plan)).toEqual(new Set(keysOf(["turn-start."])));
  });

  it("warms nothing outside play", () => {
    expect(prefetchPlan(view({ phase: "ended", haunt: { level: 2, max: 10 }, minutesToMidnight: 5 }), entries)).toEqual([]);
    expect(prefetchPlan(view({ phase: "lobby" }), entries)).toEqual([]);
  });

  it("adds all four Haunt Event options one level below a threshold that can fire, and only then", () => {
    const hauntKeys = keysOf(["haunt.cold-spot.", "haunt.blackout.", "haunt.restless.", "haunt.lull."]);
    expect(hauntKeys.length).toBeGreaterThan(0);
    const below = new Set(prefetchPlan(view({ haunt: { level: 2, max: 10 } }), entries));
    for (const k of hauntKeys) expect(below.has(k)).toBe(true);
    const at = new Set(prefetchPlan(view({ haunt: { level: 3, max: 10 } }), entries));
    for (const k of hauntKeys) expect(at.has(k)).toBe(false);
    // Level 8 is one below 9, but a threshold at the maximum never fires.
    const capped = new Set(prefetchPlan(view({ haunt: { level: 8, max: 8 } }), entries));
    for (const k of hauntKeys) expect(capped.has(k)).toBe(false);
  });

  it("adds the midnight lines within the hour, and only then", () => {
    const midnight = keysOf(["midnight."]);
    expect(midnight.length).toBeGreaterThan(0);
    for (const k of midnight) expect(prefetchPlan(view({ minutesToMidnight: 30 }), entries)).toContain(k);
    for (const k of midnight) expect(prefetchPlan(view({ minutesToMidnight: 61 }), entries)).not.toContain(k);
    for (const k of midnight) expect(prefetchPlan(view({ minutesToMidnight: null }), entries)).not.toContain(k);
  });

  it("never warms a confession, reveal or ending line, whatever the public facts", () => {
    const secretKeys = new Set(keysOf(["confession.", "accuse.", "reveal.", "end."]));
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 12 }),
        fc.constantFrom(8, 10, 12),
        fc.option(fc.double({ min: -10, max: 300, noNaN: true }), { nil: null }),
        (level, max, minutes) => {
          const plan = prefetchPlan(view({ haunt: { level, max }, minutesToMidnight: minutes }), entries);
          return plan.every((k) => !secretKeys.has(k)) && new Set(plan).size === plan.length &&
            JSON.stringify(plan) === JSON.stringify(prefetchPlan(view({ haunt: { level, max }, minutesToMidnight: minutes }), entries));
        },
      ),
      propParams(),
    );
  });
});
