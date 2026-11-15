import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import {
  ADDRESSES, DATES, MAX_CLUES, codeSoFar, clueRows, isMadeUp, placeClues, readAll, turnGap,
  type SpiritClue,
} from "./clues";
import { makeLock } from "./make";
import { levelArb, seedArb } from "./puzzles.arb";
import { referenceSolve, verify } from "./verify";

/** A Safe code: 3, 4 or 5 digits (easy, medium and hard), never all one digit, but any digits for the ring. */
const codeArb = fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 3, maxLength: 5 });
const DEG = Math.PI / 180; // the limits below are written out here, not taken from the module, so changing the module cannot change the test
const quarter = (turn: number): number => Math.min(3, Math.floor(((turn < 0 ? turn + 2 * Math.PI : turn) / (Math.PI / 2))));

describe("Property 18: Clue rings are deterministic, spread out and made up", () => {
  // Feature: puzzles, Property 18: Clue rings are deterministic, spread out and made up
  // Validates: Requirements 15.2, 15.3, 15.4
  it("gives the same ring every time, one Code piece for each digit, in order, with the digits of the code", () => {
    fc.assert(
      fc.property(seedArb, codeArb, (seed, code) => {
        const a = placeClues(seed, code);
        if (JSON.stringify(a) !== JSON.stringify(placeClues(seed, code))) return false;
        const pieces = a.filter((c) => c.form === "code").sort((x, y) => (x.place ?? 0) - (y.place ?? 0));
        return (
          pieces.length === code.length &&
          pieces.every((c, i) => c.place === i + 1 && c.of === code.length && c.text === String(code[i])) &&
          new Set(a.map((c) => c.id)).size === a.length
        );
      }),
      propParams(),
    );
  });

  it("holds at most three Story clues, one of each form, and never more than seven clues", () => {
    fc.assert(
      fc.property(seedArb, codeArb, (seed, code) => {
        const a = placeClues(seed, code);
        const story = a.filter((c) => c.form !== "code");
        return story.length <= 3 && new Set(story.map((c) => c.form)).size === story.length && a.length <= MAX_CLUES && story.length === Math.min(3, MAX_CLUES - code.length);
      }),
      propParams(),
    );
  });

  it("takes every Story clue from the fixed made-up lists and every phone number from 555-0100 to 555-0199", () => {
    fc.assert(
      fc.property(seedArb, codeArb, (seed, code) =>
        placeClues(seed, code).every((c) => isMadeUp(c) && (c.form !== "address" || ADDRESSES.includes(c.text)) && (c.form !== "date" || DATES.includes(c.text)) && (c.form !== "phone" || /^555-01\d\d$/.test(c.text))),
      ),
      propParams(),
    );
  });

  it("keeps every pair of clues at least 35 degrees apart in turn, every height between -30 and +40 degrees, and every quarter of the turn filled, for any code of 1 to 7 digits", () => {
    fc.assert(
      fc.property(seedArb, fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 7 }), (seed, code) => {
        const a = placeClues(seed, code);
        for (let i = 0; i < a.length; i++) {
          const ci = a[i] as SpiritClue;
          if (!(ci.height >= -30 * DEG - 1e-12 && ci.height <= 40 * DEG + 1e-12)) return false;
          if (!(ci.turn > -Math.PI - 1e-12 && ci.turn <= Math.PI + 1e-12)) return false;
          for (let j = i + 1; j < a.length; j++) if (turnGap(ci.turn, (a[j] as SpiritClue).turn) < 35 * DEG - 1e-9) return false;
        }
        return a.length < 4 || [0, 1, 2, 3].every((q) => a.some((c) => quarter(c.turn) === q));
      }),
      propParams(),
    );
  });

  it("draws Story clues from lists of at least 12 made-up addresses and 12 dates before 1950, with no repeats", () => {
    for (const list of [ADDRESSES, DATES]) { expect(list.length).toBeGreaterThanOrEqual(12); expect(new Set(list).size).toBe(list.length); }
    for (const d of DATES) expect(Number(d.slice(-4))).toBeLessThan(1950);
    for (const a of ADDRESSES) expect(a).toMatch(/^\d{1,3} [A-Z][a-z]+ [A-Z][a-z]+$/);
  });

  it("refuses a code that is not 1 to 7 digits", () => {
    expect(() => placeClues(1, [])).toThrow(RangeError);
    expect(() => placeClues(1, [1, 2, 3, 4, 5, 6, 7, 8])).toThrow(RangeError);
    expect(() => placeClues(1, [1, 22, 3])).toThrow(RangeError);
    expect(() => placeClues(1, [1, 2.5, 3])).toThrow(RangeError);
  });
});

describe("Property 20: Spirit clues change what is shown and nothing else", () => {
  // Feature: puzzles, Property 20: Spirit clues change what is shown and nothing else
  // Validates: Requirements 15.1, 15.7
  it("lists the digits of the Sight in order whatever is read, and Show all as text reads every clue", () => {
    fc.assert(
      fc.property(seedArb, levelArb, fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }), (seed, level, picks) => {
        const lock = makeLock("safe", level, seed);
        if (lock.kind !== "safe") return false;
        const code = lock.sight.code;
        const clues = placeClues(seed, code);
        const some = new Set(clues.filter((_, i) => picks[i]).map((c) => c.id));
        const part = codeSoFar(clues, some);
        const all = codeSoFar(clues, readAll(clues));
        const rows = clueRows(clues, readAll(clues));
        return (
          part.length === code.length &&
          part.every((d, i) => d === null || d === code[i]) &&
          JSON.stringify(all) === JSON.stringify(code) &&
          rows.length === clues.length && rows.every((r) => r.text !== null) &&
          clueRows(clues, new Set()).every((r) => r.text === null)
        );
      }),
      propParams(),
    );
  });

  it("gives the same verdict for the same Transcript whatever was read", () => {
    fc.assert(
      fc.property(seedArb, levelArb, fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }), (seed, level, picks) => {
        const lock = makeLock("safe", level, seed);
        const clues = placeClues(seed, lock.kind === "safe" ? lock.sight.code : [1, 2, 3]);
        const good = referenceSolve(lock);
        const before = [verify(lock, good), verify(lock, { ...good, code: [...(good.kind === "safe" ? good.code : [])].reverse().concat(9) })];
        clueRows(clues, new Set(clues.filter((_, i) => picks[i]).map((c) => c.id))); // reading changes nothing the Lock can see
        const after = [verify(lock, good), verify(lock, { ...good, code: [...(good.kind === "safe" ? good.code : [])].reverse().concat(9) })];
        return JSON.stringify(before) === JSON.stringify(after) && before[0]?.ok === true;
      }),
      propParams(),
    );
  });
});
