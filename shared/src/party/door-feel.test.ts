import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { REACH, doorFeel, feel, type PhonePlace } from "./door-feel";

const phone = (x: number, y: number, facing: number): PhonePlace => ({ x, y, facing });
const src = { x: 0, y: 0 };

describe("what a phone feels from a source (puzzles 25.4; knock-door 8.3)", () => {
  it("within 2.5 m and facing it: a buzz, the picture shakes, the sound is full", () => {
    expect(feel(src, phone(2, 0, 180))).toMatchObject({ level: "strong", buzz: true, picture: true, sound: 1 }); // at x = 2, looking west at the source
  });
  it("within 6 m and facing it: no buzz, the picture shakes, the sound is half", () => {
    expect(feel(src, phone(5, 0, 180))).toMatchObject({ level: "soft", buzz: false, picture: true, sound: 0.5 });
  });
  it("facing away (more than 100 degrees off): a faint sound only", () => {
    expect(feel(src, phone(2, 0, 0))).toMatchObject({ level: "faint", buzz: false, picture: false, sound: 0.2 });
    expect(feel(src, phone(2, 0, 180 + 100.5))).toMatchObject({ level: "faint" });
    expect(feel(src, phone(2, 0, 180 + 99))).toMatchObject({ level: "strong" });
  });
  it("beyond 6 m: nothing, whichever way it faces", () => {
    for (const facing of [0, 90, 180, 270]) expect(feel(src, phone(6.01, 0, facing))).toMatchObject({ level: "none", buzz: false, picture: false, sound: 0 });
    expect(REACH).toEqual({ near: 2.5, far: 6 });
  });
  it("takes the edges as inside: exactly 2.5 m is near and exactly 6 m is far", () => {
    expect(feel(src, phone(2.5, 0, 180)).level).toBe("strong");
    expect(feel(src, phone(6, 0, 180)).level).toBe("soft");
  });
  it("only a buzz when near and facing; the sound never grows with distance", () => {
    fc.assert(fc.property(fc.double({ min: -9, max: 9, noNaN: true }), fc.double({ min: -9, max: 9, noNaN: true }), fc.double({ min: -720, max: 720, noNaN: true }), (x, y, facing) => {
      const f = feel(src, phone(x, y, facing));
      expect(f.buzz).toBe(f.level === "strong");
      expect(f.picture).toBe(f.level === "strong" || f.level === "soft");
      expect(f.sound).toBe(f.level === "strong" ? 1 : f.level === "soft" ? 0.5 : f.level === "faint" ? 0.2 : 0);
    }));
  });
  it("gives the same answer as the lab's `feel` (tools/playtest/js/shake-core.js) for any places", async () => {
    const nodePath = "../../../tools/playtest/js/shake-core.js";
    const lab = (await import(/* @vite-ignore */ nodePath)) as { feel: (a: { x: number; y: number }, b: PhonePlace) => unknown };
    fc.assert(fc.property(fc.double({ min: -12, max: 12, noNaN: true }), fc.double({ min: -12, max: 12, noNaN: true }), fc.double({ min: -12, max: 12, noNaN: true }), fc.double({ min: -12, max: 12, noNaN: true }), fc.double({ min: -540, max: 540, noNaN: true }), (sx, sy, px, py, facing) => {
      expect(feel({ x: sx, y: sy }, phone(px, py, facing))).toEqual(lab.feel({ x: sx, y: sy }, phone(px, py, facing)));
    }));
  });
});

describe("what a phone feels when a door changes (knock-door 8.3, Requirement 2.4)", () => {
  const door = { at: { x: 1, z: 2 } };
  it("takes the door's place on the plan as the source (the plan's z is the floor plan's y)", () => {
    expect(doorFeel(door, phone(1, 3, 270))).toMatchObject({ level: "strong", buzz: true }); // a metre south of the door, looking north (270)
    expect(doorFeel(door, phone(1, 3, 90))).toMatchObject({ level: "faint" });
  });
  it("measures along the plan's z, not x: the same phone is far from a door by z and out of reach by x", () => {
    expect(doorFeel(door, phone(1, 7.5, 270))).toMatchObject({ level: "soft", meters: 5.5 }); // 5.5 m from (1, 2); 6.5 m if x were used as y
  });
  it("shakes no picture with reduced motion, and keeps the sound", () => {
    const f = doorFeel(door, phone(1, 3, 270), { reducedMotion: true });
    expect(f).toMatchObject({ level: "strong", buzz: true, picture: false, sound: 1 });
  });
  it("buzzes nothing where the phone cannot buzz, and the picture and sound carry the same meaning", () => {
    expect(doorFeel(door, phone(1, 3, 270), { canBuzz: false })).toMatchObject({ level: "strong", buzz: false, picture: true, sound: 1 });
  });
  it("is nothing for a phone that does not know where it is (the sentence in the live region still says it)", () => {
    expect(doorFeel(door, null)).toEqual({ level: "none", meters: Number.POSITIVE_INFINITY, buzz: false, picture: false, sound: 0 });
  });
});
