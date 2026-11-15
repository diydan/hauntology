import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { setTheory, type Theory } from "../party/theory";
import { BOARD, applyDrop, lineupPos, placeSuspects, roomAtPoint, roomCenter, slotPos, type Slot } from "./marks";

const { W, D } = BOARD;
const zonesArb = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 6, maxLength: 6 });
const suspectsArb = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 6, maxLength: 6 });
const theoryArb = (suspects: readonly string[], zones: readonly string[]): fc.Arbitrary<Theory> =>
  fc.array(fc.tuple(fc.constantFrom(...suspects), fc.constantFrom(...zones)), { maxLength: 8 }).map((pairs) => Object.fromEntries(pairs));
const slots: Slot[] = [0, 1, 2].flatMap((c) => [0, 1].map((r) => ({ c, r })));
/** A point strictly inside a room. */
const insideArb = fc.tuple(fc.constantFrom(...slots), fc.double({ min: 0.02, max: 0.98, noNaN: true }), fc.double({ min: 0.02, max: 0.98, noNaN: true })).map(([s, u, v]) => ({
  s, x: (s.c - 1.5) * W + u * W, z: (s.r === 0 ? -D : 0) + v * D,
}));

describe("Property 7: A drop only sets or clears the player's own theory mark", () => {
  // Feature: spirit-table, Property 7: A drop only sets or clears the player's own theory mark
  // Validates: Requirements 2.3, 8.2, 8.3
  it("finds each of the six rooms from any point inside it, and no room from a point outside the board", () => {
    fc.assert(
      fc.property(insideArb, ({ s, x, z }) => {
        const got = roomAtPoint(x, z);
        return got !== null && got.c === s.c && got.r === s.r;
      }),
      propParams(),
    );
    fc.assert(
      fc.property(fc.oneof(fc.double({ min: -1, max: 1, noNaN: true }), fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY)), fc.oneof(fc.double({ min: D + 1e-6, max: 1, noNaN: true }), fc.double({ min: -1, max: -D - 1e-6, noNaN: true }), fc.constantFrom(Number.NaN)), (x, z) => roomAtPoint(x, z) === null),
      propParams(),
    );
    for (const x of [1.5 * W + 1e-6, -1.5 * W - 1e-6]) expect(roomAtPoint(x, 0)).toBeNull();
  });

  /** Six Suspects, six Zones, and a set of Theory marks between them. */
  const worldArb = fc.tuple(suspectsArb, zonesArb).chain(([suspects, zones]) => fc.tuple(fc.constant(suspects), fc.constant(zones), theoryArb(suspects, zones)));

  it("sets exactly that Suspect's Zone, or clears it, leaves every other Suspect and its input unchanged, and ignores a Zone that is not in the pool", () => {
    fc.assert(
      fc.property(worldArb, fc.string({ minLength: 1, maxLength: 8 }), fc.nat(5), fc.nat(5), fc.boolean(), ([suspects, zones, theory], outsider, si, zi, clear) => {
        Object.freeze(theory);
        const before = JSON.stringify(theory), suspect = suspects[si] as string, zone = zones[zi] as string;
        const next = applyDrop(theory, suspect, clear ? null : zone, zones);
        if (JSON.stringify(theory) !== before) return false; // never changes its input
        const others = Object.entries(theory).filter(([k]) => k !== suspect).sort();
        const keep = Object.entries(next).filter(([k]) => k !== suspect).sort();
        if (JSON.stringify(others) !== JSON.stringify(keep)) return false; // no other Suspect touched
        if (clear ? Object.hasOwn(next, suspect) : next[suspect] !== zone) return false;
        if (setTheory(theory, suspect, zone, zones)[suspect] !== zone) return false; // the notebook's own function says the same
        const off = zones.includes(outsider) ? theory : applyDrop(theory, suspect, outsider, zones);
        return JSON.stringify(off) === JSON.stringify(theory);
      }),
      propParams(),
    );
  });

  it("stands a Suspect in a room only by its Theory mark, in a free place inside that room, and everyone else in the line-up in order", () => {
    fc.assert(
      fc.property(worldArb, ([suspects, zones, theory]) => {
        const rooms = new Map(zones.map((z, i) => [z, slots[i] as Slot] as const));
        const stand = placeSuspects(theory, suspects, rooms);
        if (stand.size !== suspects.length) return false;
        const seen = new Set<string>();
        for (const [i, id] of suspects.entries()) {
          const st = stand.get(id);
          if (!st) return false;
          seen.add(`${st.x.toFixed(6)},${st.z.toFixed(6)}`);
          if (Object.hasOwn(theory, id)) {
            const c = roomCenter(rooms.get(theory[id] as string) as Slot);
            if (st.zone !== theory[id] || Math.abs(st.x - c.x) >= W / 2 || Math.abs(st.z - c.z) >= D / 2) return false;
          } else {
            const lp = lineupPos(i, suspects.length);
            if (st.zone !== null || st.x !== lp.x || st.z !== lp.z) return false;
          }
        }
        return seen.size === suspects.length; // nobody stands on anybody
      }),
      propParams(),
    );
  });

  it("puts the line-up in front of the board and no wider than it, and six places inside a room", () => {
    const xs = [0, 1, 2, 3, 4, 5].map((i) => lineupPos(i, 6));
    expect(Math.abs((xs[0]?.x ?? 0) + (xs[5]?.x ?? 0))).toBeLessThan(1e-12);
    expect(xs.every((p) => p.z > D + 0.017 && Math.abs(p.x) < 1.5 * W)).toBe(true);
    const seen = new Set<string>();
    for (let k = 0; k < 6; k++) { const s = slotPos(k); seen.add(`${s.x.toFixed(5)},${s.z.toFixed(5)}`); expect(Math.abs(s.x) < W / 2 && Math.abs(s.z) < D / 2).toBe(true); }
    expect(seen.size).toBe(6);
  });
});
