import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { knockPlayTimes } from "./knock";
import { makeLock } from "./make";
import {
  WANDER_DOOR_WINDOW, knockWanderDoor, pushWanderDoor, skipWanderDoor, startWanderDoor, wanderDoorFor, wanderDoorLine, type WanderDoor, type WanderDoorState,
} from "./wander-door";

const seedArb = fc.integer({ min: 0, max: 2 ** 31 - 1 });
const knockDoor = (seed: number): WanderDoor => ({ lock: "knock", level: "easy", seed, need: 1 });
const heavyDoor = (seed: number): WanderDoor => ({ lock: "heavy", level: "easy", seed, need: 1 });
/** The right knock for a knock door: from the same lock the door uses. */
const rightKnock = (d: WanderDoor): number[] => {
  const l = makeLock("knock", d.level, d.seed);
  return l.kind === "knock" ? knockPlayTimes(l.secret) : [];
};

describe("the Wander door: at most one door per walk (Requirement 6.1)", () => {
  it("places at most one door among a walk's memories, and only on the window", () => {
    fc.assert(fc.property(seedArb, (seed) => {
      const placed = Array.from({ length: 10 }, (_, i) => i).filter((i) => wanderDoorFor(seed, i, true) !== null);
      return placed.length === 1 && placed[0]! < WANDER_DOOR_WINDOW;
    }), { numRuns: 300 });
  });

  it("places no door when the visitor has turned doors off, at any memory", () => {
    fc.assert(fc.property(seedArb, fc.integer({ min: 0, max: 9 }), (seed, i) => wanderDoorFor(seed, i, false) === null));
  });

  it("gives the same door for the same walk, every time", () => {
    fc.assert(fc.property(seedArb, fc.integer({ min: 0, max: 9 }), (seed, i) => {
      expect(wanderDoorFor(seed, i, true)).toEqual(wanderDoorFor(seed, i, true));
      return true;
    }));
  });

  it("a heavy door always asks for one Player, so one visitor can open it", () => {
    fc.assert(fc.property(seedArb, (seed) => {
      const door = wanderDoorFor(seed, 0, true) ?? wanderDoorFor(seed, 1, true) ?? wanderDoorFor(seed, 2, true);
      return door === null || door.need === 1;
    }));
  });
});

describe("the Wander door: Skip is always there (Requirement 6.2)", () => {
  it("opens a fresh door at once, with the words, for any seed", () => {
    fc.assert(fc.property(seedArb, (_seed) => {
      const r = skipWanderDoor(startWanderDoor());
      return r.ok && r.state.open && r.state.openedBy === "skip" && r.line === "The door opens.";
    }));
  });

  it("still opens after any number of wrong knocks, so a wrong knock is never a trap", () => {
    fc.assert(fc.property(seedArb, fc.integer({ min: 0, max: 20 }), (seed, wrong) => {
      const state: WanderDoorState = { open: false, wrong, openedBy: null };
      const r = skipWanderDoor(state);
      return r.ok && r.state.open;
    }));
  });

  it("refuses a second open, and changes nothing", () => {
    const open = (skipWanderDoor(startWanderDoor()) as { state: WanderDoorState }).state;
    expect(skipWanderDoor(open)).toEqual({ ok: false, code: "already_open" });
    expect(pushWanderDoor(heavyDoor(1), open)).toEqual({ ok: false, code: "already_open" });
  });
});

describe("the Wander door: pushing and knocking", () => {
  it("opens a heavy door with one act, and refuses a push on a knock door", () => {
    const r = pushWanderDoor(heavyDoor(3), startWanderDoor());
    expect(r).toMatchObject({ ok: true, opened: true, state: { open: true, openedBy: "push" } });
    expect(pushWanderDoor(knockDoor(3), startWanderDoor())).toEqual({ ok: false, code: "not_heavy" });
  });

  it("opens a knock door to the right knock, and says what was heard on a wrong one", () => {
    const door = knockDoor(11);
    const right = knockWanderDoor(door, startWanderDoor(), rightKnock(door));
    expect(right).toMatchObject({ ok: true, opened: true, state: { open: true, openedBy: "knock" } });
    const wrong = knockWanderDoor(door, startWanderDoor(), [0, 10_000]);
    expect(wrong).toMatchObject({ ok: true, opened: false, heard: "You knocked 1, 1.", line: "You knocked 1, 1. Not that one." });
    if (wrong.ok) expect(wrong.state).toMatchObject({ open: false, wrong: 1 });
  });

  it("refuses a knock on a heavy door", () => {
    expect(knockWanderDoor(heavyDoor(3), startWanderDoor(), [0, 300])).toEqual({ ok: false, code: "not_knock" });
  });

  it("never puts the pattern in a line or a heard message", () => {
    fc.assert(fc.property(seedArb, (seed) => {
      const door = knockDoor(seed);
      const pattern = makeLock("knock", door.level, door.seed);
      const groups = pattern.kind === "knock" ? pattern.secret.groups.join(",") : "";
      const wrong = knockWanderDoor(door, startWanderDoor(), [0, 10_000]);
      const text = wanderDoorLine(door) + JSON.stringify(wrong);
      return groups === "" || !text.includes(`groups`);
    }));
  });
});

describe("the Wander door: the words", () => {
  it("names the door without giving the knock away", () => {
    expect(wanderDoorLine(knockDoor(1))).toMatch(/secret knock/);
    expect(wanderDoorLine(heavyDoor(1))).toMatch(/Push it, or skip it/);
  });
});
