import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { linkStretch } from "@hauntology/shared/table/rag";
import type { TableData } from "@hauntology/shared/table/data";
import { buildModel } from "./model";
import { carryTarget, DRAG_THRESHOLD_PX, dropOutcome, gestureStep, HEAD_HEIGHT, IDLE, LIFT, RagDoll, STAND_UP_LIMIT_S, type Gesture, type GestureEffect, type GestureEvent } from "./carry";

const zones = ["library", "study", "nursery", "kitchen", "hall", "cellar"];
const data: TableData = {
  rooms: zones.map((z, i) => ({ zone: z, name: z[0]!.toUpperCase() + z.slice(1), slot: i, coldSpot: false, inspected: false })),
  pawns: [],
  suspects: ["cora", "vane", "pike", "thorne", "percy", "dunmore"].map((c) => ({ card: c, name: c })),
  relics: [],
  haunt: { level: 0, max: 6 },
};
const model = (theory = {}) => buildModel({ data, roomCode: "XYZ1", theory, tMs: 0, reducedMotion: true });

const run = (events: GestureEvent[]): GestureEffect[] => {
  let g: Gesture = IDLE; const out: GestureEffect[] = [];
  for (const e of events) { const r = gestureStep(g, e); g = r.state; out.push(r.effect); }
  return out;
};

describe("gestureStep", () => {
  it("picks a Suspect up only after more than 8 pixels, and does not turn the view", () => {
    const fx = run([{ type: "down", x: 100, y: 100, suspect: "cora" }, { type: "move", x: 100 + DRAG_THRESHOLD_PX, y: 100 }, { type: "move", x: 100 + DRAG_THRESHOLD_PX + 1, y: 100 }, { type: "move", x: 140, y: 120 }, { type: "up" }]);
    expect(fx.map((f) => f.kind)).toEqual(["none", "none", "carry_start", "carry_move", "drop"]);
    expect(fx.some((f) => f.kind === "turn")).toBe(false);
  });
  it("makes a tap of a touch that goes down and up without moving, even with small jitter", () => {
    expect(run([{ type: "down", x: 5, y: 5, suspect: "cora" }, { type: "move", x: 8, y: 9 }, { type: "up" }]).map((f) => f.kind)).toEqual(["none", "none", "tap"]);
    expect(run([{ type: "down", x: 5, y: 5, suspect: null }, { type: "up" }]).map((f) => f.kind)).toEqual(["none", "tap"]);
  });
  it("turns the view with a drag that starts off a Suspect, by the finger's own movement", () => {
    const fx = run([{ type: "down", x: 0, y: 0, suspect: null }, { type: "move", x: 30, y: 4 }, { type: "move", x: 40, y: 10 }, { type: "up" }]);
    expect(fx[1]).toEqual({ kind: "turn", dx: 30, dy: 4 });
    expect(fx[2]).toEqual({ kind: "turn", dx: 10, dy: 6 });
    expect(fx[3]!.kind).toBe("none");
  });
  it("cancels a carry, ignores bad numbers, and a move without a down does nothing", () => {
    expect(run([{ type: "down", x: 0, y: 0, suspect: "vane" }, { type: "move", x: 50, y: 0 }, { type: "cancel" }])[2]).toEqual({ kind: "cancel_carry", suspect: "vane" });
    expect(run([{ type: "move", x: 5, y: 5 }, { type: "up" }]).map((f) => f.kind)).toEqual(["none", "none"]);
    expect(run([{ type: "down", x: Number.NaN, y: 0, suspect: "vane" }, { type: "up" }]).map((f) => f.kind)).toEqual(["none", "none"]);
  });
});

describe("carryTarget and dropOutcome", () => {
  const m = model();
  const above = (x: number, z: number) => ({ o: { x, y: 1, z: z + 0.5 }, d: { x: 0, y: HEAD_HEIGHT - 1, z: -0.5 } });
  it("cuts the finger's ray with the plane at head height and reads the room under the feet", () => {
    const room = m.rooms[0]!;
    const t = carryTarget(m, above(room.center.x, room.center.z))!;
    expect(t.room?.zone).toBe(room.zone);
    expect(t.feet).toEqual(t.head);
    expect(carryTarget(m, { o: { x: 0, y: 1, z: 0 }, d: { x: 0, y: 1, z: 0 } })).toBeNull();
  });
  it("marks the room under the feet when let go over it and says so for the card", () => {
    const room = m.rooms[3]!;
    const t = carryTarget(m, above(room.center.x, room.center.z))!;
    const o = dropOutcome(m, {}, "pike", t);
    expect(o).toMatchObject({ change: "set", zone: room.zone, theory: { pike: room.zone } });
    expect(o.say).toContain("maybe here");
  });
  it("takes the mark back when let go anywhere else, touching nothing else, and never changes its input", () => {
    const theory = Object.freeze({ pike: "library", cora: "hall" });
    const off = carryTarget(m, above(-1.2, 0.9))!;
    expect(off.room).toBeNull();
    const o = dropOutcome(m, theory, "pike", off);
    expect(o.theory).toEqual({ cora: "hall" });
    expect(o.change).toBe("cleared");
    expect(theory).toEqual({ pike: "library", cora: "hall" });
    expect(dropOutcome(m, {}, "pike", off).change).toBe("none");
    expect(dropOutcome(m, {}, "pike", null).theory).toEqual({});
  });
  it("lets a room hold all six and a Suspect have at most one mark", () => {
    const room = m.rooms[1]!;
    const t = carryTarget(m, above(room.center.x, room.center.z))!;
    let th = {};
    for (const s of ["cora", "vane", "pike", "thorne", "percy", "dunmore"]) th = dropOutcome(m, th, s, t).theory;
    expect(Object.values(th)).toEqual(Array(6).fill(room.zone));
    const other = carryTarget(m, above(m.rooms[2]!.center.x, m.rooms[2]!.center.z))!;
    th = dropOutcome(m, th, "cora", other).theory;
    expect(Object.keys(th).filter((k) => k === "cora")).toHaveLength(1);
  });
});

const orig = (() => { const a: number[] = []; for (let r = 0; r <= 14; r++) { const y = (r / 14) * 0.225; a.push(-0.06, y, 0, 0.06, y, 0); } return Float64Array.from(a); })();

describe("RagDoll", () => {
  it("hangs a chain from the head while held and lifts the body", () => {
    const d = new RagDoll(0.225);
    d.grab();
    for (let i = 0; i < 60; i++) d.step(1 / 60, 0.002, 0);
    expect(d.mode).toBe("held");
    expect(d.lift).toBeGreaterThan(LIFT * 0.9);
    expect(linkStretch(d.chain!)).toBeLessThan(0.08);
  });

  it("stands back up, upright and still, within two seconds of being let go (also after a hard swing)", () => {
    const d = new RagDoll(0.225);
    d.grab();
    for (let i = 0; i < 90; i++) d.step(1 / 60, Math.sin(i / 4) * 0.01, Math.cos(i / 5) * 0.01);
    d.release();
    let t = 0;
    while (d.busy && t < 5) { d.step(1 / 60); t += 1 / 60; }
    expect(d.busy).toBe(false);
    expect(d.sinceRelease).toBeLessThanOrEqual(STAND_UP_LIMIT_S);
    const out = new Float64Array(orig.length);
    d.deform(orig, out);
    expect(Array.from(out)).toEqual(Array.from(orig));
  });

  it("keeps its links within 8 percent, its points off the floor and numeric, for any finger path and release (property)", () => {
    fc.assert(fc.property(
      fc.array(fc.tuple(fc.double({ min: -0.03, max: 0.03, noNaN: true }), fc.double({ min: -0.03, max: 0.03, noNaN: true })), { minLength: 5, maxLength: 120 }),
      fc.integer({ min: 0, max: 100 }),
      (path, extra) => {
        const d = new RagDoll(0.225);
        d.grab();
        for (const [a, b] of path) { d.step(1 / 60, a, b); expect(linkStretch(d.chain!)).toBeLessThan(0.08); }
        d.release();
        let t = 0;
        for (let i = 0; i < 300 + extra && d.busy; i++) {
          d.step(1 / 60); t += 1 / 60;
          const c = d.chain;
          if (c) for (let k = 0; k < c.p.length; k++) { expect(Number.isFinite(c.p[k])).toBe(true); if (k % 2 === 1) expect(c.p[k]!).toBeGreaterThanOrEqual(-1e-6); }
        }
        expect(d.busy).toBe(false);
        expect(t).toBeLessThanOrEqual(STAND_UP_LIMIT_S + 0.2);
      },
    ), { numRuns: 60, seed: 7 });
  });

  it("draws a chain hanging straight as exactly the flat picture", () => {
    const d = new RagDoll(0.225);
    d.grab();
    d.lift = 0;
    const out = new Float64Array(orig.length);
    d.deform(orig, out);
    for (let i = 0; i < orig.length; i++) expect(out[i]!).toBeCloseTo(orig[i]!, 9);
  });

  it("under reduced motion lifts and drops with no swing, fall or wobble", () => {
    const d = new RagDoll(0.225, true);
    d.grab();
    d.step(1 / 60, 0.3, 0.3);
    expect(d.chain).toBeNull();
    expect(d.lift).toBe(LIFT);
    const out = new Float64Array(orig.length);
    d.deform(orig, out);
    expect(out[1]!).toBeCloseTo(orig[1]! + LIFT, 9);
    expect(out[0]).toBe(orig[0]);
    d.release();
    expect(d.busy).toBe(false);
    expect(d.lift).toBe(0);
  });

  it("ignores a bad time step and a bad finger movement", () => {
    const d = new RagDoll(0.225);
    d.grab();
    d.step(Number.NaN, 1, 1); d.step(-1); d.step(1 / 60, Number.NaN, Number.POSITIVE_INFINITY);
    d.step(1 / 60, 0, 0);
    expect(d.chain!.p.every(Number.isFinite)).toBe(true);
  });
});
