import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { makeLock } from "../puzzles/make";
import {
  ACT_WINDOW_MS, DOOR_WIDTH_MAX, DOOR_WIDTH_MIN, MAX_DOORS, actCount, actsTogether, canSlam, doorKnock, doorProblems, failKnock,
  heavyNeed, initialDoors, openDoor, reachableZones, shutDoor, slamTargets, tickRound, zonesBehind, type Door, type DoorAct, type DoorState, type Passage,
} from "./doors";

const ZONES = ["hall", "cellar", "attic", "garden", "study", "porch"] as const;
const zoneIds: string[] = [...ZONES];
const door = (over: Partial<Door> = {}): Door => ({ id: "cellar-door", at: { x: 1, z: 2 }, width: 1.2, a: "hall", b: "cellar", lock: "knock", ...over });
const ring: Passage[] = ZONES.slice(1).map((z, i): Passage => [ZONES[i] as string, z]); // hall-cellar-attic-garden-study-porch in a line
const openGround: Passage[] = ring.filter(([a, b]) => !(a === "hall" && b === "cellar"));

describe("doors: the manifest check (Property 1: A door list is valid, or it is refused with a reason)", () => {
  it("passes a world with no doors whatever the passages are", () => {
    expect(doorProblems([], zoneIds, [], "hall")).toEqual([]);
    expect(doorProblems([], [], [], "nowhere")).toEqual([]);
  });

  it("passes a good door and refuses each broken field with its own reason", () => {
    expect(doorProblems([door()], zoneIds, ring, "hall")).toEqual([]);
    expect(doorProblems([door({ id: "Cellar Door" })], zoneIds, ring, "hall")).toContain("0:id");
    expect(doorProblems([door({ width: DOOR_WIDTH_MIN - 0.01 })], zoneIds, ring, "hall")).toContain("0:width");
    expect(doorProblems([door({ width: DOOR_WIDTH_MAX + 0.01 })], zoneIds, ring, "hall")).toContain("0:width");
    expect(doorProblems([door({ width: Number.NaN })], zoneIds, ring, "hall")).toContain("0:width");
    expect(doorProblems([door({ a: "moon" })], zoneIds, ring, "hall")).toContain("0:zone");
    expect(doorProblems([door({ b: "hall" })], zoneIds, ring, "hall")).toContain("0:same_zone");
    expect(doorProblems([door({ lock: "iron" as never })], zoneIds, ring, "hall")).toContain("0:lock");
    expect(doorProblems([door({ at: { x: Number.POSITIVE_INFINITY, z: 0 } })], zoneIds, ring, "hall")).toContain("0:at");
  });

  it("wants a heavy door to ask for 2 or 3 Players and a knock door to ask for none", () => {
    expect(doorProblems([door({ lock: "heavy", need: 2 })], zoneIds, ring, "hall")).toEqual([]);
    expect(doorProblems([door({ lock: "heavy", need: 3 })], zoneIds, ring, "hall")).toEqual([]);
    expect(doorProblems([door({ lock: "heavy" })], zoneIds, ring, "hall")).toContain("0:need");
    expect(doorProblems([door({ lock: "heavy", need: 4 })], zoneIds, ring, "hall")).toContain("0:need");
    expect(doorProblems([door({ lock: "knock", need: 2 })], zoneIds, ring, "hall")).toContain("0:need");
  });

  it("allows 3 doors and refuses a fourth, and refuses a repeated id", () => {
    const ds = (n: number): Door[] => Array.from({ length: n }, (_, i) => door({ id: `d${i}`, a: ZONES[i] as string, b: ZONES[i + 1] as string }));
    expect(doorProblems(ds(MAX_DOORS), zoneIds, ring, "hall")).toEqual([]);
    expect(doorProblems(ds(MAX_DOORS + 1), zoneIds, ring, "hall")).toContain("count");
    expect(doorProblems([door(), door({ a: "cellar", b: "attic" })], zoneIds, ring, "hall")).toContain("1:id_dup");
  });

  it("refuses a Zone that no route reaches, even with every door open, and counts a door as a route", () => {
    // Nothing but this one door links the cellar to the rest: it is a route, so it passes.
    expect(doorProblems([door()], zoneIds, openGround, "hall")).toEqual([]);
    // A door that joins two Zones neither of which connects to home leaves them cut off.
    const stray = door({ id: "stray", a: "garden", b: "study" });
    const problems = doorProblems([stray], zoneIds, [["hall", "cellar"], ["cellar", "attic"]], "hall");
    expect(problems).toContain("cut_off:garden");
    expect(problems).toContain("cut_off:study");
    expect(problems).toContain("cut_off:porch");
    expect(doorProblems([door()], zoneIds, ring, "moon")).toContain("home");
  });

  it("holds for any list of random doors: no door list is both accepted and broken", () => {
    const doorArb = fc.record({
      id: fc.constantFrom("a", "b", "c", "D!", "x-1", ""),
      at: fc.record({ x: fc.double({ min: -20, max: 20, noNaN: true }), z: fc.double({ min: -20, max: 20, noNaN: true }) }),
      width: fc.double({ min: 0, max: 3, noNaN: true }),
      a: fc.constantFrom(...zoneIds, "moon"),
      b: fc.constantFrom(...zoneIds, "moon"),
      lock: fc.constantFrom("knock", "heavy"),
      need: fc.constantFrom(undefined, 1, 2, 3, 4),
    }) as fc.Arbitrary<Door>;
    fc.assert(fc.property(fc.array(doorArb, { maxLength: 5 }), (ds) => {
      const ok = doorProblems(ds, zoneIds, ring, "hall").length === 0;
      if (ds.length === 0) return ok;
      if (!ok) return true;
      return ds.length <= MAX_DOORS && new Set(ds.map((d) => d.id)).size === ds.length
        && ds.every((d) => d.width >= DOOR_WIDTH_MIN && d.width <= DOOR_WIDTH_MAX && d.a !== d.b && zoneIds.includes(d.a) && zoneIds.includes(d.b)
          && (d.lock === "heavy" ? d.need === 2 || d.need === 3 : d.need === undefined));
    }), { numRuns: 300 });
  });
});

describe("doors: state (Property 2: Doors start by the puzzle setting; Property 3: A shut door closes only what lies behind it)", () => {
  const ds: Door[] = [door({ id: "one", a: "hall", b: "cellar" }), door({ id: "two", a: "cellar", b: "attic", lock: "heavy", need: 2 })];
  const passages: Passage[] = [["attic", "garden"], ["garden", "study"], ["study", "porch"]];

  it("starts every door shut with puzzles on, and open for good with puzzles off", () => {
    expect(initialDoors(ds, true).every((s) => !s.open)).toBe(true);
    const off = initialDoors(ds, false);
    expect(off.every((s) => s.open)).toBe(true);
    expect(shutDoor(off, "one", 3, false)).toEqual(off);
    expect(initialDoors([], true)).toEqual([]);
  });

  it("closes the Zones behind a shut door, and opens them as the doors open", () => {
    let st = initialDoors(ds, true);
    expect(reachableZones(zoneIds, ds, st, passages, "hall")).toEqual(["hall"]);
    st = openDoor(st, "one");
    expect(reachableZones(zoneIds, ds, st, passages, "hall")).toEqual(["hall", "cellar"]);
    st = openDoor(st, "two");
    expect(reachableZones(zoneIds, ds, st, passages, "hall")).toEqual(zoneIds);
    // Only the Zone with no other way in stays closed.
    expect(reachableZones(zoneIds, ds, initialDoors(ds, true), [["hall", "garden"], ...passages], "hall")).toEqual(["hall", "attic", "garden", "study", "porch"]);
  });

  it("says which Zones lie behind a door, and none when there is another way in", () => {
    const shut = initialDoors(ds, true);
    expect(zonesBehind("one", zoneIds, ds, shut, passages, "hall")).toEqual(["cellar"]);
    expect(zonesBehind("two", zoneIds, ds, openDoor(shut, "one"), passages, "hall")).toEqual(["attic", "garden", "study", "porch"]); // all that hangs off the attic
    expect(zonesBehind("two", zoneIds, ds, openDoor(shut, "one"), [["hall", "attic"], ...passages], "hall")).toEqual([]); // the attic has open ground in
    expect(zonesBehind("two", zoneIds, ds, openDoor(shut, "one"), [["garden", "study"], ["study", "porch"]], "hall")).toEqual(["attic"]);
    expect(zonesBehind("one", zoneIds, ds, shut, [["hall", "cellar"], ...passages], "hall")).toEqual([]); // open ground beside the door
    expect(zonesBehind("nope", zoneIds, ds, shut, passages, "hall")).toEqual([]);
  });

  it("only ever gains Zones when a door opens (monotone)", () => {
    fc.assert(fc.property(fc.array(fc.constantFrom("one", "two"), { maxLength: 4 }), (order) => {
      let st = initialDoors(ds, true);
      let before = reachableZones(zoneIds, ds, st, passages, "hall");
      for (const id of order) {
        st = openDoor(st, id);
        const after = reachableZones(zoneIds, ds, st, passages, "hall");
        if (!before.every((z) => after.includes(z))) return false;
        before = after;
      }
      return true;
    }));
  });

  it("opens by itself at the start of the Round after three wrong knocks, so a door never stays shut for good", () => {
    let st = initialDoors(ds, true);
    st = failKnock(st, "one", 2);
    expect(tickRound(st, 2).find((s) => s.id === "one")?.open).toBe(false);
    const next = tickRound(st, 3).find((s) => s.id === "one") as DoorState;
    expect(next).toMatchObject({ open: true, opensAtRound: null, autoOpenedRound: 3 });
    expect(tickRound(st, 3).find((s) => s.id === "two")?.open).toBe(false); // an untouched door stays shut
    expect(failKnock(openDoor(st, "one"), "one", 5).find((s) => s.id === "one")?.opensAtRound).toBeNull(); // an open door is not touched
  });

  it("keeps the earlier time when a door fails again", () => {
    const st = failKnock(failKnock(initialDoors(ds, true), "one", 2), "one", 4);
    expect(st.find((s) => s.id === "one")?.opensAtRound).toBe(3);
  });
});

describe("doors: the knock lock (Property 4: The lock comes from the Room seed and the door id only)", () => {
  it("gives the same level and seed for the same seed and id, and a real knock Lock from them", () => {
    fc.assert(fc.property(fc.integer(), fc.constantFrom("one", "two", "cellar-door"), (seed, id) => {
      const a = doorKnock(seed, id);
      expect(doorKnock(seed, id)).toEqual(a);
      expect(["easy", "medium", "hard"]).toContain(a.level);
      expect(Number.isInteger(a.seed) && a.seed >= 0).toBe(true);
      const lock = makeLock("knock", a.level, a.seed);
      expect(lock.kind).toBe("knock");
      expect(makeLock("knock", a.level, a.seed)).toEqual(lock);
    }));
  });

  it("depends on the door id and the Room seed, and on nothing else", () => {
    const seeds = Array.from({ length: 40 }, (_, i) => i * 7919);
    expect(new Set(seeds.map((s) => doorKnock(s, "one").seed)).size).toBeGreaterThan(30);
    expect(new Set(["one", "two", "three", "cellar-door"].map((id) => doorKnock(5, id).seed)).size).toBe(4);
    expect(new Set(seeds.map((s) => doorKnock(s, "one").level)).size).toBe(3);
  });
});

describe("doors: heavy doors (Property 5: A door never asks for more Players than are seated; Property 6: Acts count each Player once inside the window)", () => {
  const heavy = (need: number) => door({ lock: "heavy", need });

  it("asks for 1 on a knock door and for 2 or 3 on a heavy door, never more than are seated and never under 1", () => {
    expect(heavyNeed(door(), 6)).toBe(1);
    expect(heavyNeed(heavy(2), 6)).toBe(2);
    expect(heavyNeed(heavy(3), 6)).toBe(3);
    expect(heavyNeed(heavy(3), 2)).toBe(2);
    expect(heavyNeed(heavy(3), 1)).toBe(1);
    expect(heavyNeed(heavy(2), 0)).toBe(1);
    fc.assert(fc.property(fc.constantFrom(2, 3), fc.integer({ min: -3, max: 9 }), (need, seated) => {
      const n = heavyNeed(heavy(need), seated);
      return n >= 1 && n <= 3 && n <= Math.max(1, seated) && n <= need;
    }));
  });

  it("counts each Player once however often they act", () => {
    const acts: DoorAct[] = [{ seat: 1, atMs: 100 }, { seat: 1, atMs: 300 }, { seat: 1, atMs: 900 }];
    expect(actCount(acts, 1000)).toBe(1);
    expect(actsTogether(acts, 1000, 2)).toBe(false);
    expect(actsTogether([...acts, { seat: 2, atMs: 950 }], 1000, 2)).toBe(true);
  });

  it("does not count acts further apart than the window, or from the future", () => {
    expect(actsTogether([{ seat: 1, atMs: 0 }, { seat: 2, atMs: ACT_WINDOW_MS }], ACT_WINDOW_MS, 2)).toBe(false);
    expect(actsTogether([{ seat: 1, atMs: 1 }, { seat: 2, atMs: ACT_WINDOW_MS }], ACT_WINDOW_MS, 2)).toBe(true);
    expect(actsTogether([{ seat: 1, atMs: 1000 }, { seat: 2, atMs: 5000 }], 1000, 2)).toBe(false);
    expect(actsTogether([{ seat: 1, atMs: Number.NaN }, { seat: 2, atMs: 10 }], 20, 2)).toBe(false);
    expect(actsTogether([], 0, 1)).toBe(false);
  });

  it("never counts more Players than there are different seats", () => {
    fc.assert(fc.property(fc.array(fc.record({ seat: fc.integer({ min: 1, max: 6 }), atMs: fc.integer({ min: 0, max: 6000 }) }), { maxLength: 30 }), fc.integer({ min: 0, max: 6000 }), (acts, now) => {
      const n = actCount(acts, now);
      return n <= new Set(acts.map((a) => a.seat)).size && n <= acts.length;
    }));
  });
});

describe("doors: the Haunt Slam (Property 7: A Slam shuts only an open door that nobody stands behind)", () => {
  const open = (over: Partial<DoorState> = {}): DoorState => ({ id: "one", open: true, opensAtRound: null, autoOpenedRound: null, ...over });

  it("shuts a door only when it is open, nobody is behind it, and it did not just open by itself this Round", () => {
    expect(canSlam(open(), 0, 4)).toBe(true);
    expect(canSlam(open({ open: false }), 0, 4)).toBe(false);
    expect(canSlam(open(), 1, 4)).toBe(false);
    expect(canSlam(open(), -1, 4)).toBe(false);
    expect(canSlam(open({ autoOpenedRound: 4 }), 0, 4)).toBe(false);
    expect(canSlam(open({ autoOpenedRound: 3 }), 0, 4)).toBe(true);
  });

  it("lists the doors a Slam may shut, and a slammed door opens by itself next Round", () => {
    const st: DoorState[] = [open({ id: "one" }), open({ id: "two" }), open({ id: "three", open: false })];
    expect(slamTargets(st, { two: 2 }, 4)).toEqual(["one"]);
    const shut = shutDoor(st, "one", 4, true);
    expect(shut[0]).toMatchObject({ open: false, opensAtRound: 5 });
    expect(shutDoor(shut, "one", 4, true)).toEqual(shut); // already shut: nothing changes
    expect(tickRound(shut, 5)[0]).toMatchObject({ open: true, autoOpenedRound: 5 });
    expect(slamTargets(tickRound(shut, 5), {}, 5)).not.toContain("one"); // not shut again in the Round it opened
    expect(slamTargets(tickRound(shut, 5), {}, 6)).toContain("one");
  });

  it("never leaves a door shut for good: any run of Slams and ticks ends with it open", () => {
    fc.assert(fc.property(fc.array(fc.boolean(), { maxLength: 12 }), (slams) => {
      let st: DoorState[] = initialDoors([door({ id: "one" })], false);
      st = openDoor(st, "one");
      let round = 1;
      for (const slam of slams) {
        if (slam && canSlam(st[0] as DoorState, 0, round)) st = shutDoor(st, "one", round, true);
        round++;
        st = tickRound(st, round);
      }
      return (st[0] as DoorState).open;
    }));
  });
});
