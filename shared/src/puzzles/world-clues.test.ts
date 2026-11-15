import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { makeLock } from "./make";
import { mulberry32 } from "./rng";
import { LEVELS, MEMORY_KINDS, type Kind } from "./types";
import { verify } from "./verify";
import { MAX_WORLD_LOCKS, SIGNS, answerFromSight, decoyFor, placeWorldClues, signForLock, worldCluePrompt, type PlacedLock } from "./world-clues";

const ZONES = ["Hall", "Library", "Kitchen", "Cellar", "Attic", "Garden"];
const KINDS_ALL: Kind[] = ["lockpick", "wires", "clock", "safe", "musicbox", "candles", "moved", "photo", "words", "board"];

/** One Lock per Zone, the Kinds drawn from the seed, as the Room places them. */
function locksFor(seed: number, level: (typeof LEVELS)[number]): PlacedLock[] {
  return ZONES.map((zone, i) => ({ zone, lock: makeLock(KINDS_ALL[(((seed + i * 3) % KINDS_ALL.length) + KINDS_ALL.length) % KINDS_ALL.length] as Kind, level, seed + i) }));
}

describe("world clues: placement (Property 1: World clues are placed fairly)", () => {
  it("gives up to three Memory Locks one real clue and one Decoy each, in two other Zones, all with their own Sign", () => {
    fc.assert(fc.property(fc.integer(), fc.constantFrom(...LEVELS), (seed, level) => {
      const locks = locksFor(seed, level);
      const clues = placeWorldClues(seed, ZONES, locks);
      const memory = locks.filter((p) => MEMORY_KINDS.includes(p.lock.kind));
      expect(clues.length).toBe(2 * Math.min(MAX_WORLD_LOCKS, memory.length));
      expect(new Set(clues.map((c) => c.sign)).size).toBe(clues.length);
      for (const c of clues) expect(SIGNS).toContain(c.sign);
      const real = clues.filter((c) => c.lockZone !== null);
      for (const c of real) {
        const lock = locks.find((p) => p.zone === c.lockZone)?.lock;
        expect(lock?.sight).toEqual(c.sight);
        const decoy = clues[clues.indexOf(c) + 1];
        expect(decoy?.lockZone).toBeNull();
        expect(decoy?.sight.kind).toBe(c.sight.kind);
        expect(new Set([c.lockZone, c.zone, decoy?.zone]).size).toBe(3); // the Lock, its clue and its Decoy: three Zones
        expect(JSON.stringify(decoy?.sight)).not.toBe(JSON.stringify(c.sight));
      }
    }), { numRuns: 200 });
  });

  it("is the same every time for a seed, and takes no Solution, Hand or Residue at all", () => {
    const locks = locksFor(42, "medium");
    expect(placeWorldClues(42, ZONES, locks)).toEqual(placeWorldClues(42, ZONES, locks));
    expect(placeWorldClues.length).toBe(3); // seed, Zones, Locks: nothing else can reach it
  });

  it("places nothing when no Lock is a Memory Kind", () => {
    const locks = ZONES.map((zone, i) => ({ zone, lock: makeLock("candles", "easy", i) }));
    expect(placeWorldClues(1, ZONES, locks)).toEqual([]);
  });
});

describe("world clues: answers (Property 2: The Lock and its World Clue agree)", () => {
  it("the real clue's answer opens its Lock, and the Decoy's answer does not", () => {
    fc.assert(fc.property(fc.integer(), fc.constantFrom(...LEVELS), fc.constantFrom(...MEMORY_KINDS), (seed, level, kind) => {
      const lock = makeLock(kind, level, seed);
      const decoy = decoyFor(mulberry32(seed), lock);
      expect(decoy).not.toBeNull();
      if (lock.sight === null || decoy === null) return;
      expect(decoy.kind).toBe(lock.kind);
      if (kind === "photo") {
        expect(JSON.stringify(decoy)).not.toBe(JSON.stringify(lock.sight)); // another picture
        return;
      }
      const good = answerFromSight(lock, lock.sight);
      const bad = answerFromSight(lock, decoy);
      expect(good && verify(lock, good)).toEqual({ ok: true });
      expect(bad && verify(lock, bad)).toEqual({ ok: false, code: "wrong" });
    }), { numRuns: 400 });
  });
});

describe("world clues: the Lock prompt", () => {
  it("names the Sign and never the answer", () => {
    const locks = locksFor(5, "easy");
    const clues = placeWorldClues(5, ZONES, locks);
    for (const c of clues.filter((x) => x.lockZone !== null)) {
      const sign = signForLock(clues, c.lockZone as string);
      expect(sign).toBe(c.sign);
      const text = worldCluePrompt(c.sight.kind, c.sign);
      expect(text).toContain(`marked with the ${c.sign}`);
      expect(text).not.toMatch(/\d/);
    }
    expect(signForLock(clues, "Nowhere")).toBeNull();
  });
});
