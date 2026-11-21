import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { PublicDoor } from "./doors";
import { doorChanges, doorMarkers, doorStates, doorWords } from "./door-markers";

const zones = [{ id: "hall", name: "the Hall" }, { id: "lib", name: "the Library" }, { id: "cellar", name: "the Cellar" }];
const door = (over: Partial<PublicDoor> = {}): PublicDoor => ({ id: "d1", at: { x: 2, z: 3 }, width: 1, a: "hall", b: "lib", lock: "knock", open: false, need: 0, have: 0, ...over });

describe("door markers for the TV (knock-door 8.2, 8.4)", () => {
  it("makes no marker for a world with no doors", () => {
    expect(doorMarkers([], zones)).toEqual([]);
    expect(doorMarkers(undefined, zones)).toEqual([]);
    expect(doorMarkers(null, zones)).toEqual([]);
  });
  it("says each door's state in words, shut or open", () => {
    const [m, n] = doorMarkers([door(), door({ id: "d2", a: "lib", b: "cellar", at: { x: 8, z: 9 }, open: true })], zones);
    expect(m!.label).toBe("The door between the Hall and the Library: shut");
    expect(n!.label).toBe("The door between the Library and the Cellar: open");
    expect(m!.open).toBe(false);
    expect(n!.open).toBe(true);
  });
  it("spreads the markers over the picture with a margin, and centres a lone door", () => {
    const [a, b] = doorMarkers([door({ at: { x: 0, z: 0 } }), door({ id: "d2", at: { x: 10, z: 4 } })], zones);
    expect([a!.xPct, a!.yPct, b!.xPct, b!.yPct]).toEqual([10, 10, 90, 90]);
    expect(doorMarkers([door()], zones)[0]).toMatchObject({ xPct: 50, yPct: 50 });
  });
  it("counts a Player within 1.5 m as at the door, and none otherwise", () => {
    const d = door({ at: { x: 2, z: 3 } });
    expect(doorMarkers([d], zones, [{ x: 3.4, z: 3 }])[0]!.atDoor).toBe(true);
    expect(doorMarkers([d], zones, [{ x: 3.6, z: 3 }])[0]!.atDoor).toBe(false);
    expect(doorMarkers([d], zones)[0]!.atDoor).toBe(false);
  });
  it("is quiet on the first look, and says a door opened or shut once", () => {
    const shut = [door()];
    const open = [door({ open: true })];
    expect(doorChanges(null, shut, zones)).toEqual([]);
    expect(doorChanges(doorStates(shut), shut, zones)).toEqual([]);
    expect(doorChanges(doorStates(shut), open, zones)).toEqual([{ id: "d1", open: true, words: "The door between the Hall and the Library opened." }]);
    expect(doorChanges(doorStates(open), shut, zones)).toEqual([{ id: "d1", open: false, words: "The door between the Hall and the Library shut." }]);
    expect(doorChanges(new Map(), open, zones)).toEqual([]); // a door not seen before is not a change
  });
  it("never puts a lock, pattern, need or act count in the words", () => {
    fc.assert(
      fc.property(fc.constantFrom("knock", "heavy", "tap"), fc.nat(5), fc.boolean(), (lock, have, open) => {
        const d = door({ lock: lock as PublicDoor["lock"], have, need: 3, open });
        const text = [doorWords(d, zones), ...doorMarkers([d], zones).map((m) => m.label), ...doorChanges(new Map([["d1", !open]]), [d], zones).map((c) => c.words)].join(" ");
        expect(text).not.toMatch(/knock|heavy|tap|\d/i);
      }),
    );
  });
  it("names an unknown Zone as 'a room' instead of its id", () => {
    expect(doorWords({ a: "ghost-id", b: "lib" }, zones)).toBe("the door between a room and the Library");
  });
});
