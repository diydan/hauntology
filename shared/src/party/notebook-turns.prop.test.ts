import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { autoMarks, cellKey, cellMark, markCard, residueFound, type Knowledge, type Mark, type PlayerMarks } from "./notebook";
import { firstPlayer, nextPlayer, roundOrder, type Order } from "./turns";

const CARDS = [...["s", "z", "r"].flatMap((k) => [1, 2, 3, 4, 5, 6].map((i) => `${k}${i}`))];
const card = fc.constantFrom(...CARDS);
const seat = fc.integer({ min: 1, max: 6 });
const knowledgeArb: fc.Arbitrary<Knowledge> = fc.record({
  me: seat,
  hand: fc.uniqueArray(card, { maxLength: 6 }),
  shown: fc.array(fc.record({ card, by: seat }), { maxLength: 8 }),
  found: fc.uniqueArray(card, { maxLength: 3 }),
  passes: fc.array(fc.record({ seat, cards: fc.tuple(card, card, card) }), { maxLength: 6 }),
  autoCross: fc.boolean(),
});

describe("Property 10: Notebook marks are monotone", () => {
  it("fills exactly the Hand, the shown cards and the found Residue, and lacks only with auto-cross", () => {
    fc.assert(fc.property(knowledgeArb, (k) => {
      const m = autoMarks(k);
      const expectHas = new Set([...k.hand.map((c) => cellKey(c, k.me)), ...k.shown.map((s) => cellKey(s.card, s.by)), ...k.found.map((c) => cellKey(c, "residue"))]);
      const expectLacks = new Set(k.autoCross ? k.passes.flatMap((p) => p.cards.map((c) => cellKey(c, p.seat))) : []);
      for (const [key, mark] of m) {
        if (mark === "has") expect(expectHas.has(key)).toBe(true);
        else expect(expectLacks.has(key) && !expectHas.has(key)).toBe(true);
      }
      for (const key of expectHas) expect(m.get(key)).toBe("has");
      for (const key of expectLacks) if (!expectHas.has(key)) expect(m.get(key)).toBe("lacks");
      if (!k.autoCross) expect([...m.values()].includes("lacks")).toBe(false);
      expect(residueFound(k)).toBe(new Set(k.found).size);
    }), { numRuns: 500 });
  });

  it("does not depend on the order things were learned, and learning more only adds marks", () => {
    fc.assert(fc.property(knowledgeArb, fc.integer(), (k, salt) => {
      const rev = <T,>(xs: readonly T[]): T[] => (salt % 2 === 0 ? [...xs].reverse() : [...xs]);
      const shuffled: Knowledge = { ...k, hand: rev(k.hand), shown: rev(k.shown), found: rev(k.found), passes: rev(k.passes) };
      expect(new Map(autoMarks(shuffled))).toEqual(new Map(autoMarks(k)));
      const less: Knowledge = { ...k, shown: k.shown.slice(0, Math.floor(k.shown.length / 2)), passes: k.passes.slice(1) };
      for (const [key, mark] of autoMarks(less)) if (mark === "has") expect(autoMarks(k).get(key)).toBe("has");
    }));
  });

  it("never removes a Player's mark, whatever the game learns", () => {
    const markArb = fc.constantFrom<Mark>("has", "lacks", "maybe");
    fc.assert(fc.property(knowledgeArb, fc.array(fc.tuple(card, fc.oneof(seat, fc.constant("residue" as const)), markArb), { maxLength: 10 }), (k, edits) => {
      let mine: PlayerMarks = new Map();
      for (const [c, col, mark] of edits) mine = markCard(mine, c, col, mark);
      const auto = autoMarks(k);
      for (const [c, col] of edits) {
        const last = [...edits].reverse().find(([c2, col2]) => c2 === c && col2 === col);
        expect(cellMark(auto, mine, c, col)).toBe(last?.[2]);
      }
      const cleared = markCard(mine, "s1", 1, "blank");
      expect(cellMark(auto, cleared, "s1", 1)).toBe(auto.get(cellKey("s1", 1)) ?? "blank");
    }));
  });
});

const orderArb: fc.Arbitrary<Order> = fc.uniqueArray(seat, { minLength: 2, maxLength: 6 }).chain((seats) =>
  fc.subarray(seats, { maxLength: seats.length - 1 }).map((out) => ({ seats, out })));

describe("Property 11: Turn order is fair", () => {
  it("visits every Detective once per Round, in clockwise order from the first player, never one who is out", () => {
    fc.assert(fc.property(orderArb, fc.integer(), (o, seed) => {
      const first = firstPlayer(o, null, seed);
      expect(first).not.toBeNull();
      const f = first as number;
      expect(o.out).not.toContain(f);
      const visited = [f];
      for (let cur = f, guard = 0; guard < 10; guard++) {
        const nx = nextPlayer(o, f, cur);
        if (nx === null) break;
        expect(o.out).not.toContain(nx);
        visited.push(nx);
        cur = nx;
      }
      expect(visited).toEqual(roundOrder(o, f));
      const detectives = o.seats.filter((s) => !o.out.includes(s)).sort((a, b) => a - b);
      expect([...visited].sort((a, b) => a - b)).toEqual(detectives);
      for (let i = 1; i < visited.length; i++) {
        const a = detectives.indexOf(visited[i - 1] as number);
        expect(visited[i]).toBe(detectives[(a + 1) % detectives.length]); // clockwise, one at a time
      }
    }), { numRuns: 500 });
  });

  it("moves the first player one Detective clockwise each Round, so each is first once every d Rounds", () => {
    fc.assert(fc.property(orderArb, fc.integer(), (o, seed) => {
      const detectives = o.seats.filter((s) => !o.out.includes(s)).sort((a, b) => a - b);
      const d = detectives.length;
      let first = firstPlayer(o, null, seed) as number;
      const firsts = [first];
      for (let r = 1; r < 2 * d; r++) { first = firstPlayer(o, first, seed) as number; firsts.push(first); }
      for (let r = 1; r < firsts.length; r++) {
        const a = detectives.indexOf(firsts[r - 1] as number);
        expect(firsts[r]).toBe(detectives[(a + 1) % d]);
      }
      expect(new Set(firsts.slice(0, d)).size).toBe(d);
    }));
  });

  it("ends the Round when the order comes back round, even if the first player went out during it", () => {
    const o: Order = { seats: [1, 2, 3, 4], out: [2] };
    expect(nextPlayer(o, 2, 1)).toBeNull(); // first player 2 went out; after 1 comes 2's seat: the Round is over
    expect(nextPlayer(o, 3, 4)).toBe(1);
    expect(nextPlayer(o, 3, 1)).toBeNull(); // 2 is out, then 3 is first again
    expect(firstPlayer({ seats: [1, 2], out: [1, 2] }, null, 1)).toBeNull();
  });
});
