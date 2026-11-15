import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CAUGHT_BONUS_MS, DONE_SCARE, ERRAND_OBJECTS, ERRAND_RULE_LINE, caughtLogLine, doneLogLine, eligibleTargets, errandObjectForPrompt,
  isExpired, mayCallCaught, mayTryDone, nextErrand, recapLine, settleCaught, settleDone, type Errand, type SeatInfo,
} from "./errands";

const seatArb: fc.Arbitrary<SeatInfo[]> = fc
  .array(fc.record({ human: fc.boolean(), detective: fc.boolean(), optedOut: fc.boolean() }), { minLength: 2, maxLength: 6 })
  .map((xs) => xs.map((x, seat) => ({ seat, ...x })));

const open = (over: Partial<Errand> = {}): Errand => ({ id: "0:0", from: 0, target: 1, object: "spoon", givenRound: 1, doneTriedRound: null, status: "open", ...over });

describe("errands: the object list", () => {
  it("has twelve different safe home things, with nothing hot, sharp or medical", () => {
    expect(ERRAND_OBJECTS).toHaveLength(12);
    expect(new Set(ERRAND_OBJECTS).size).toBe(12);
    const unsafe = /knife|fork|scissor|candle|match|lighter|kettle|iron|pill|medicine|phone|wallet|bag|razor|hot/;
    for (const o of ERRAND_OBJECTS) expect(o, o).not.toMatch(unsafe);
    expect(ERRAND_RULE_LINE).toMatch(/Never grab or push/);
  });

  it("maps a photo prompt subject to an object by name, and gives null for anything else", () => {
    expect(errandObjectForPrompt("A mug")).toBe("mug");
    expect(errandObjectForPrompt("Books")).toBe("book");
    expect(errandObjectForPrompt("the sky")).toBeNull();
    expect(errandObjectForPrompt("shoes")).toBeNull();
  });
});

describe("errands: choosing one (Property 1: Errands pick only fair Targets)", () => {
  it("only targets human Detectives who have not opted out, never the sender, and never repeats an open pair", () => {
    fc.assert(fc.property(fc.integer(), seatArb, fc.nat(5), fc.nat(10), (seed, seats, fromIdx, given) => {
      const from = fromIdx % seats.length;
      const fair = eligibleTargets(from, seats);
      const others: Errand[] = [];
      for (let k = 0; k < 4; k++) {
        const e = nextErrand(seed, from, given + k, seats, others, 1);
        if (fair.length === 0) { expect(e).toBeNull(); return; }
        expect(e).not.toBeNull();
        const x = e as Errand;
        expect(fair).toContain(x.target);
        expect(x.target).not.toBe(from);
        expect(others.some((o) => o.target === x.target && o.object === x.object)).toBe(false);
        others.push(x);
      }
    }), { numRuns: 300 });
  });

  it("is the same for the same seed, sender and count, and differs as the count goes up", () => {
    const seats: SeatInfo[] = [0, 1, 2, 3].map((seat) => ({ seat, human: true, detective: seat !== 0, optedOut: false }));
    expect(nextErrand(7, 0, 0, seats, [], 1)).toEqual(nextErrand(7, 0, 0, seats, [], 1));
    const picks = new Set(Array.from({ length: 12 }, (_, g) => JSON.stringify(nextErrand(7, 0, g, seats, [], 1)?.object)));
    expect(picks.size).toBeGreaterThan(3);
  });

  it("gives no Errand when every other seat is a Bot, a Poltergeist or opted out", () => {
    const seats: SeatInfo[] = [
      { seat: 0, human: true, detective: false, optedOut: false },
      { seat: 1, human: false, detective: true, optedOut: false },
      { seat: 2, human: true, detective: false, optedOut: false },
      { seat: 3, human: true, detective: true, optedOut: true },
    ];
    expect(nextErrand(1, 0, 0, seats, [], 1)).toBeNull();
  });

  it("uses the photo's object first when one is given", () => {
    const seats: SeatInfo[] = [0, 1, 2].map((seat) => ({ seat, human: true, detective: seat !== 0, optedOut: false }));
    for (let seed = 0; seed < 50; seed++) expect(nextErrand(seed, 0, 0, seats, [], 1, "mug")?.object).toBe("mug");
  });

  it("runs out after two full Rounds", () => {
    expect(isExpired(open({ givenRound: 3 }), 4)).toBe(false);
    expect(isExpired(open({ givenRound: 3 }), 5)).toBe(true);
    expect(isExpired(open({ givenRound: 3, status: "done" }), 9)).toBe(false);
  });
});

describe("errands: Done and Caught (Property 3: Done and Caught settle once)", () => {
  it("counts Done only on Yes, scores once, and allows one try per Round", () => {
    const yes = settleDone(open(), "yes", 2);
    expect(yes.scare).toBe(DONE_SCARE);
    expect(yes.errand.status).toBe("done");
    expect(settleDone(yes.errand, "yes", 3).scare).toBe(0); // settled: never scores again
    for (const answer of ["no", "timeout"] as const) {
      const miss = settleDone(open(), answer, 2);
      expect(miss.scare).toBe(0);
      expect(miss.errand.status).toBe("open");
      expect(mayTryDone(miss.errand, 2)).toBe(false);
      expect(settleDone(miss.errand, "yes", 2).scare).toBe(0); // the Round's try is used
      expect(settleDone(miss.errand, "yes", 3).scare).toBe(DONE_SCARE);
    }
  });

  it("closes a matching Caught call with no Scare points and ten seconds for the caller; a miss changes nothing", () => {
    fc.assert(fc.property(fc.constantFrom(...ERRAND_OBJECTS), fc.nat(5), (object, polt) => {
      const errands = [open({ from: 0, object: "spoon" }), open({ id: "2:0", from: 2, target: 1, object: "mug" })];
      const res = settleCaught(errands, 1, polt, object);
      const hit = errands.find((e) => e.from === polt && e.object === object);
      if (hit) {
        expect(res.closed?.id).toBe(hit.id);
        expect(res.closed?.status).toBe("caught");
        expect(res.bonusMs).toBe(CAUGHT_BONUS_MS);
        expect(settleDone(res.closed as Errand, "yes", 9).scare).toBe(0);
        expect(settleCaught(res.errands, 1, polt, object).closed).toBeNull(); // only once
      } else {
        expect(res.closed).toBeNull();
        expect(res.bonusMs).toBe(0);
        expect(res.errands).toEqual(errands);
      }
    }));
  });

  it("lets a Detective call Caught once per Round", () => {
    expect(mayCallCaught(null, 1)).toBe(true);
    expect(mayCallCaught(1, 1)).toBe(false);
    expect(mayCallCaught(1, 2)).toBe(true);
  });
});

describe("errands: what is said", () => {
  it("never names the sender in the public log, and names everyone in the recap", () => {
    expect(doneLogLine("Sam", "spoon")).toBe("Sam was made to hold a spoon");
    expect(caughtLogLine("Ana")).toBe("Ana caught a haunting");
    const names = ["Ana", "Sam"];
    expect(recapLine(open({ status: "done" }), (s) => names[s] ?? "?")).toBe("Ana tried to get Sam to hold a spoon: done");
  });
});
