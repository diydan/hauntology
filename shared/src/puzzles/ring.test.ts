import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { placeClues, type SpiritClue } from "./clues";
import { READ_MS, clueAngle } from "./read";
import {
  ARROW_AFTER_MS, RING_MAX_DRAWN, RING_MIN_FRAME_MS, RING_MS, RING_MS_ASSIST, allRead, arrowFor, clueSpot, drawnClues, readSet, ringDone, ringPlan, showAllRead,
  ringForSight, startRing, stepRing, viewOfDirection, type RingState,
} from "./ring";

const code = fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 7 });
const ringOf = (seed: number, c: number[]): SpiritClue[] => placeClues(seed, c);
const look = (s: RingState, clues: readonly SpiritClue[], at: SpiritClue, ms: number, step = 50): { s: RingState; read: string[] } => {
  let cur = s; const read: string[] = [];
  for (let t = 0; t < ms; t += step) { const r = stepRing(cur, clues, { turn: at.turn, height: at.height }, step); cur = r.state; read.push(...r.newlyRead); }
  return { s: cur, read };
};

describe("the Clue ring as maths (puzzles 10.6, 10.8, Requirement 15)", () => {
  it("a clue hangs where its turn and height say, and the view of that direction is the same turn and height", () => {
    fc.assert(fc.property(fc.double({ min: -Math.PI + 0.01, max: Math.PI - 0.01, noNaN: true }), fc.double({ min: (-30 * Math.PI) / 180, max: (40 * Math.PI) / 180, noNaN: true }), (turn, height) => {
      const v = viewOfDirection(clueSpot({ turn, height }, 1.5));
      expect(v.turn).toBeCloseTo(turn, 6);
      expect(v.height).toBeCloseTo(height, 6);
    }));
  });
  it("reads a clue after 0.7 s of steady looking, once, and keeps it read when the view leaves", () => {
    const clues = ringOf(5, [1, 2, 3, 4]);
    const first = clues[0]!;
    const { s, read } = look(startRing(clues), clues, first, READ_MS + 100);
    expect(read).toEqual([first.id]);
    expect(readSet(s).has(first.id)).toBe(true);
    const away = stepRing(s, clues, { turn: first.turn + Math.PI, height: 0 }, 5000).state;
    expect(readSet(away).has(first.id)).toBe(true);
    expect(stepRing(away, clues, { turn: first.turn, height: first.height }, 100).newlyRead).toEqual([]);
  });
  it("does not read a clue in 0.6 s, and the progress falls back when the view leaves (1.4 s)", () => {
    const clues = ringOf(5, [1, 2, 3, 4]);
    const c = clues[1]!;
    const { s } = look(startRing(clues), clues, c, 600);
    expect(readSet(s).size).toBe(0);
    expect(s.reads[c.id]!.progress).toBeGreaterThan(0.8);
    let gone = s;
    for (let i = 0; i < 14; i++) gone = stepRing(gone, clues, { turn: c.turn + 2, height: 0 }, 100).state; // 14 steps of 100 ms: a step is capped at 100 ms
    expect(gone.reads[c.id]!.progress).toBe(0);
  });
  it("Property 19 over the ring: the same time of looking reads the same clues at any report rate", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 1e6 }), code, fc.constantFrom(10, 16, 33, 50, 100), (seed, c, step) => {
      const clues = ringOf(seed, c);
      const target = clues[0]!;
      const a = look(startRing(clues), clues, target, 1000, step);
      const b = look(startRing(clues), clues, target, 1000, 25);
      expect(readSet(a.s)).toEqual(readSet(b.s));
    }));
  });
  it("a stall never reads a clue: a step over 100 ms counts as 100 ms", () => {
    const clues = ringOf(9, [1, 2, 3, 4]);
    const c = clues[0]!;
    const r = stepRing(startRing(clues), clues, { turn: c.turn, height: c.height }, 60_000);
    expect(r.newlyRead).toEqual([]);
  });
  it("reads nothing with no sensor view, and counts no time while face down or hidden", () => {
    const clues = ringOf(9, [1, 2, 3, 4]);
    expect(stepRing(startRing(clues), clues, null, 1000).state.reads[clues[0]!.id]!.progress).toBe(0);
    const s0 = startRing(clues);
    expect(stepRing(s0, clues, { turn: 0, height: 0 }, 5000, false).state).toBe(s0);
  });
  it("draws at most 12 clues and reads no more", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, form: "code" as const, text: "1", turn: 0, height: 0 }));
    expect(drawnClues(many)).toHaveLength(RING_MAX_DRAWN);
    const s = stepRing(startRing(many), many, { turn: 0, height: 0 }, 100).state;
    expect(s.reads["x12"]!.progress).toBe(0);
  });
  it("Show all as text reads every clue at once; the ring ends when all are read, on Done, or after 30 s (45 with Assist)", () => {
    const clues = ringOf(3, [4, 5, 6, 7]);
    const s = startRing(clues);
    expect(ringDone(s, false, false)).toBe(false);
    expect(ringDone(s, false, true)).toBe(true);
    const all = showAllRead(s);
    expect(allRead(all)).toBe(true);
    expect(ringDone(all, false, false)).toBe(true);
    const late = { ...s, openMs: RING_MS };
    expect(ringDone({ ...late, openMs: RING_MS - 1 }, false, false)).toBe(false);
    expect(ringDone(late, false, false)).toBe(true);
    expect(ringDone(late, true, false)).toBe(false);
    expect(ringDone({ ...late, openMs: RING_MS_ASSIST }, true, false)).toBe(true);
  });
  it("shows the arrow after 3 s with nothing read, towards the nearest unread clue, and not while the list is open or once a clue is read", () => {
    const clues = ringOf(3, [4, 5, 6, 7]);
    const view = { turn: 0, height: 0 };
    let s = startRing(clues);
    expect(arrowFor(s, clues, view, false).show).toBe(false);
    s = stepRing(s, clues, { turn: Math.PI, height: 1.2 }, ARROW_AFTER_MS, true).state;
    // the nearest unread clue to the view, found by hand
    const nearest = [...clues].sort((a, b) => clueAngle(view, a) - clueAngle(view, b))[0]!;
    const a = arrowFor(s, clues, view, false);
    expect(a.show).toBe(true);
    expect(a.clueId).toBe(nearest.id);
    expect(arrowFor(s, clues, view, true).show).toBe(false);
    expect(arrowFor(s, clues, null, false).show).toBe(false);
    expect(arrowFor(showAllRead(s), clues, view, false).show).toBe(false);
  });
  it("counts the quiet from the last clue read, so the arrow waits 3 s after a read and never points at a clue already read", () => {
    const clues = ringOf(3, [4, 5, 6, 7]);
    const first = clues[0]!;
    const view = { turn: first.turn, height: first.height };
    let s = look(startRing(clues), clues, first, READ_MS + 100).s;
    expect(readSet(s).has(first.id)).toBe(true);
    s = stepRing(s, clues, { turn: first.turn + Math.PI, height: 1.3 }, 100).state;
    for (let i = 0; i < 24; i++) s = stepRing(s, clues, { turn: first.turn + Math.PI, height: 1.3 }, 100).state; // 2.5 s of quiet after the read
    expect(arrowFor(s, clues, view, false).show).toBe(false);
    for (let i = 0; i < 6; i++) s = stepRing(s, clues, { turn: first.turn + Math.PI, height: 1.3 }, 100).state;
    const a = arrowFor(s, clues, view, false);
    expect(a.show).toBe(true);
    expect(a.clueId).not.toBe(first.id); // the read clue is under the view and is skipped
  });
  it("points right for a clue to the right and up for a clue above", () => {
    const right: SpiritClue = { id: "r", form: "code", text: "1", turn: 1, height: 0 };
    const above: SpiritClue = { id: "u", form: "code", text: "1", turn: 0, height: 0.7 };
    const idle = (cs: SpiritClue[]): RingState => ({ ...startRing(cs), idleMs: ARROW_AFTER_MS });
    expect(arrowFor(idle([right]), [right], { turn: 0, height: 0 }, false).angle).toBeCloseTo(0, 6);
    expect(arrowFor(idle([above]), [above], { turn: 0, height: 0 }, false).angle).toBeCloseTo(Math.PI / 2, 6);
    const left: SpiritClue = { id: "l", form: "code", text: "1", turn: -1, height: 0 };
    expect(Math.abs(arrowFor(idle([left]), [left], { turn: 0, height: 0 }, false).angle)).toBeCloseTo(Math.PI, 6);
  });
  it("draws at most 30 frames a second, nothing face down or hidden, and is still under reduced motion", () => {
    expect(RING_MIN_FRAME_MS).toBeGreaterThanOrEqual(33);
    expect(ringPlan({ faceDown: false, hidden: false, reducedMotion: false, now: 100 }).draw).toBe(true);
    expect(ringPlan({ faceDown: false, hidden: false, reducedMotion: false, now: 120, lastDrawMs: 100 }).draw).toBe(false);
    expect(ringPlan({ faceDown: false, hidden: false, reducedMotion: false, now: 100 + RING_MIN_FRAME_MS, lastDrawMs: 100 }).draw).toBe(true);
    expect(ringPlan({ faceDown: true, hidden: false, reducedMotion: false, now: 1000 })).toMatchObject({ draw: false, awake: false });
    expect(ringPlan({ faceDown: false, hidden: true, reducedMotion: false, now: 1000 })).toMatchObject({ draw: false, awake: false });
    expect(ringPlan({ faceDown: false, hidden: false, reducedMotion: true, now: 1000 }).still).toBe(true);
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 40 }), { maxLength: 80 }), (gaps) => {
      let now = 0, last: number | undefined; const draws: number[] = [];
      for (const g of gaps) { now += g; const p = ringPlan({ faceDown: false, hidden: false, reducedMotion: false, now, ...(last === undefined ? {} : { lastDrawMs: last }) }); if (p.draw) { draws.push(now); last = now; } }
      for (let i = 1; i < draws.length; i++) expect(draws[i]! - draws[i - 1]!).toBeGreaterThanOrEqual(RING_MIN_FRAME_MS);
    }));
  });
});

describe("a Sight as a Clue ring (puzzles 10.8, Requirement 15.2, 15.8)", () => {
  const safe = (code: number[]) => ({ payload: { kind: "safe" as const, code } });
  it("hangs the Safe code only, one Code piece for each digit, and nothing for another Kind", () => {
    const ring = ringForSight("sight-1", safe([3, 1, 4, 1]))!;
    expect(ring.filter((c) => c.form === "code").sort((a, b) => (a.place ?? 0) - (b.place ?? 0)).map((c) => c.text)).toEqual(["3", "1", "4", "1"]); // laid in a seeded order, numbered by place
    expect(ringForSight("sight-1", { payload: { kind: "clock", h: 3, m: 15 } })).toBeNull();
    expect(ringForSight("sight-1", { payload: { kind: "wires", order: [0, 1] } })).toBeNull();
    expect(ringForSight("sight-1", safe([]))).toBeNull();
    expect(ringForSight("sight-1", safe([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  });
  it("depends on the Sight's id and code alone: the same everywhere, different for another Sight, never a clock or a random number", () => {
    fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 12 }), code, (id, c) => {
      expect(ringForSight(id, safe(c))).toEqual(ringForSight(id, safe(c)));
    }));
    expect(ringForSight("a", safe([1, 2, 3, 4]))).not.toEqual(ringForSight("b", safe([1, 2, 3, 4])));
  });
  it("makes no more than seven clues and every Story clue is made up", () => {
    fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 12 }), code, (id, c) => {
      const ring = ringForSight(id, safe(c))!;
      expect(ring.length).toBeLessThanOrEqual(7);
      expect(ring.filter((x) => x.form === "code")).toHaveLength(c.length);
    }));
  });
});
