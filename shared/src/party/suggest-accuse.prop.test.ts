import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mulberry32, randInt, shuffle } from "../puzzles/rng";
import { gameOver, hauntRise, ownSealed, publicSealed, roundEnd, sealAccusation, type AccusePlayer, type AccuseState } from "./accuse";
import { dealCase, type Card, type Solution } from "./deal";
import { buildPool } from "./pool";
import { canSuggest, clockwiseFrom, defaultShown, isBluff, needsChoice, publicSuggestion, resolveSuggestion, validShow, type Named } from "./suggest";

const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);
const ids = (k: string): string[] => [1, 2, 3, 4, 5, 6].map((i) => `${k}${i}`);
const namedArb: fc.Arbitrary<Named> = fc.record({ zone: fc.constantFrom(...ids("z")), suspect: fc.constantFrom(...ids("s")), relic: fc.constantFrom(...ids("r")) });
const dealArb = fc.record({ n: fc.integer({ min: 2, max: 6 }), seed: fc.integer() }).map(({ n, seed }) => {
  const seats = Array.from({ length: n }, (_, i) => i + 1);
  return { seats, seed, deal: dealCase(buildPool([], PRESETS, seed), seats, seed) };
});

describe("Property 14: Suggestions resolve to the first holder clockwise", () => {
  it("lets only the active Detective suggest, in a Zone with no Cold Spot, once per Turn", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 6 }), fc.option(fc.integer({ min: 1, max: 6 }), { nil: null }), fc.boolean(), fc.option(fc.constantFrom("z1", "z2"), { nil: null }), fc.option(fc.constantFrom("z1", "z2"), { nil: null }), fc.boolean(), (seat, active, polt, inZone, cold, done) => {
      expect(canSuggest({ seat, activeSeat: active, poltergeist: polt, inZone, coldSpot: cold, suggestedThisTurn: done }))
        .toBe(seat === active && !polt && inZone !== null && inZone !== cold && !done);
    }));
  });

  it("passes everyone holding none, stops at the first holder clockwise, and never looks at the suggester's Hand", () => {
    fc.assert(fc.property(dealArb, fc.integer({ min: 0, max: 5 }), namedArb, ({ seats, deal }, si, named) => {
      const suggester = seats[si % seats.length] as number;
      const r = resolveSuggestion(deal.hands, seats, suggester, named);
      const wanted = [named.suspect, named.zone, named.relic];
      const n = seats.length;
      const order = Array.from({ length: n - 1 }, (_, k) => seats[(seats.indexOf(suggester) + 1 + k) % n] as number); // worked out by hand
      expect(clockwiseFrom(seats, suggester)).toEqual(order);
      const holds = (s: number): boolean => (deal.hands[s] ?? []).some((c) => wanted.includes(c.id));
      const firstHolder = order.find(holds) ?? null;
      expect(r.refuter).toBe(firstHolder);
      expect(r.passed).toEqual(firstHolder === null ? order : order.slice(0, order.indexOf(firstHolder)));
      for (const p of r.passed) expect(holds(p)).toBe(false);
      if (r.refuter !== null) expect([...r.held].sort()).toEqual((deal.hands[r.refuter] ?? []).map((c) => c.id).filter((id) => wanted.includes(id)).sort());
      // the suggester's own Hand plays no part: give them any Hand and the result is the same
      const swapped = { ...deal.hands, [suggester]: [] as Card[] };
      expect(resolveSuggestion(swapped, seats, suggester, named)).toEqual(r);
    }), { numRuns: 400 });
  });

  it("shows the only card, else one already shown, else one from the seed; and refuses a show of a card not held or not named", () => {
    fc.assert(fc.property(fc.uniqueArray(fc.constantFrom("s1", "z2", "r3"), { minLength: 1, maxLength: 3 }), fc.array(fc.constantFrom("s1", "z2", "r3", "s4")), fc.integer(), fc.nat(50), (held, before, seed, ev) => {
      const c = defaultShown(held, before, seed, ev);
      expect(held).toContain(c);
      if (held.length === 1) expect(c).toBe(held[0]);
      else if (held.some((h) => before.includes(h))) expect(before).toContain(c);
      expect(defaultShown(held, before, seed, ev)).toBe(c);
      for (const card of ["s1", "z2", "r3", "s4", "r6"]) expect(validShow(held, card)).toBe(held.includes(card));
    }));
    expect(needsChoice({ passed: [], refuter: 2, held: ["s1", "r3"] }, true)).toBe(true);
    expect(needsChoice({ passed: [], refuter: 2, held: ["s1", "r3"] }, false)).toBe(false);
    expect(needsChoice({ passed: [], refuter: 2, held: ["s1"] }, true)).toBe(false);
  });

  it("makes a Bluff look exactly like any other Suggestion with the same result, and never shows the card", () => {
    fc.assert(fc.property(dealArb, namedArb, ({ seats, deal }, named) => {
      const suggester = seats[0] as number;
      const hand = deal.hands[suggester] ?? [];
      const r = resolveSuggestion(deal.hands, seats, suggester, named);
      const ev = publicSuggestion(7, suggester, named, r);
      expect(isBluff(hand, named)).toBe(hand.some((c) => c.id === named.suspect || c.id === named.relic));
      expect(JSON.stringify(ev)).not.toMatch(/bluff|held|shown|card/i);
      expect(Object.keys(ev).sort()).toEqual(["id", "kind", "passed", "refuter", "relic", "seat", "suspect", "zone"]);
      expect(publicSuggestion(7, suggester, named, { ...r, held: [] })).toEqual(ev); // whatever was held, the event is the same
    }));
  });
});

const solArb: fc.Arbitrary<Solution> = fc.record({ suspect: fc.constantFrom(...ids("s")), zone: fc.constantFrom(...ids("z")), relic: fc.constantFrom(...ids("r")) });
const start = (n: number, max: number): AccuseState => ({
  round: 1, phase: "playing", haunt: { level: 0, max }, winners: [], houseWins: false,
  players: Array.from({ length: n }, (_, i): AccusePlayer => ({ seat: i + 1, poltergeist: false, sealed: null, hasSealed: false, joinedRound: null })),
});

describe("Property 15: Accusations decide the game and the game terminates", () => {
  it("lets each Player seal once, keeps it out of every view but their own until the reveal", () => {
    fc.assert(fc.property(solArb, solArb, (a, b) => {
      const s0 = start(3, 10);
      const r1 = sealAccusation(s0, 2, a);
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      expect(publicSealed(r1.state)).toEqual([2]);
      expect(ownSealed(r1.state, 2)).toEqual(a);
      expect(ownSealed(r1.state, 1)).toBeNull();
      expect(JSON.stringify(publicSealed(r1.state))).not.toContain(a.suspect);
      expect(sealAccusation(r1.state, 2, b)).toEqual({ ok: false, code: "already_sealed" });
      const after = roundEnd(r1.state, b).state;
      expect(sealAccusation(after, 2, b).ok).toBe(false); // once per game, even after the reveal
    }));
  });

  it("makes the right sealers the winners, every wrong sealer a Poltergeist with one Haunt level each, in any order", () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 6 }), solArb, fc.array(fc.tuple(fc.integer({ min: 1, max: 6 }), fc.boolean(), solArb)), fc.integer(), (n, sol, seals, seed) => {
      let s = start(n, 12);
      for (const [seat, right, guess] of seals) { const r = sealAccusation(s, seat, right ? sol : guess); if (r.ok) s = r.state; }
      const sealers = s.players.filter((p) => p.sealed !== null);
      const rightOnes = sealers.filter((p) => JSON.stringify(p.sealed) === JSON.stringify(sol)).map((p) => p.seat);
      const wrongOnes = sealers.filter((p) => !rightOnes.includes(p.seat)).map((p) => p.seat);
      const { state } = roundEnd(s, sol);
      const permuted = roundEnd({ ...s, players: shuffle(mulberry32(seed), s.players) }, sol).state;
      expect([...permuted.winners]).toEqual([...state.winners]);
      expect(permuted.haunt).toEqual(state.haunt);
      expect(state.winners).toEqual(rightOnes.sort((a, b) => a - b));
      for (const w of wrongOnes) expect(state.players.find((p) => p.seat === w)?.poltergeist).toBe(true);
      const allHaunting = state.players.every((p) => p.poltergeist);
      const extra = rightOnes.length === 0 && !allHaunting ? 1 : 0;
      expect(state.haunt.level).toBe(Math.min(12, wrongOnes.length + extra));
      expect(gameOver(state)).toBe(rightOnes.length > 0 || allHaunting || state.haunt.level >= 12);
      if (rightOnes.length === 0) expect(state.winners).toEqual([]);
      if (state.houseWins) expect(state.winners).toEqual([]);
    }), { numRuns: 400 });
  });

  it("never changes an ended game, and always ends within hauntMax + 3 Rounds", () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 6 }), fc.constantFrom(8, 10, 12), fc.integer(), solArb, (n, max, seed, sol) => {
      const r = mulberry32(seed);
      let s = start(n, max);
      let rounds = 0;
      while (!gameOver(s) && rounds < max + 10) {
        for (const p of s.players) {
          if (p.poltergeist || p.hasSealed || r() > 0.2) continue;
          const guess = { suspect: `s${1 + randInt(r, 6)}`, zone: `z${1 + randInt(r, 6)}`, relic: `r${1 + randInt(r, 6)}` };
          const res = sealAccusation(s, p.seat, guess);
          if (res.ok) s = res.state;
        }
        if (r() < 0.3) s = { ...s, haunt: hauntRise(s.haunt, "timeout", r() < 0.5) }; // lost Turns
        s = roundEnd(s, sol).state;
        rounds++;
      }
      expect(gameOver(s)).toBe(true);
      expect(rounds).toBeLessThanOrEqual(max + 3);
      expect(roundEnd(s, sol).state).toEqual(s);
      if (s.houseWins) expect(s.winners).toEqual([]);
    }), { numRuns: 300 });
  });

  it("raises the Haunt by one at most, never past the maximum, and not for a lost Turn on which a Spook was used", () => {
    expect(hauntRise({ level: 9, max: 10 }, "round-end")).toEqual({ level: 10, max: 10 });
    expect(hauntRise({ level: 10, max: 10 }, "wrong-accusation")).toEqual({ level: 10, max: 10 });
    expect(hauntRise({ level: 4, max: 10 }, "timeout", true)).toEqual({ level: 4, max: 10 });
    expect(hauntRise({ level: 4, max: 10 }, "timeout", false)).toEqual({ level: 5, max: 10 });
  });

  it("reports each threshold crossed at 3, 6 and 9 for the Haunt Events, once, below the maximum", () => {
    let s = start(4, 10);
    const crossed: number[] = [];
    while (!gameOver(s)) { const res = roundEnd(s, { suspect: "s1", zone: "z1", relic: "r1" }); crossed.push(...res.crossed); s = res.state; }
    expect(crossed).toEqual([3, 6, 9]);
  });
});
