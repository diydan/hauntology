import { describe, expect, it } from "vitest";
import { zonePlacesFromGround } from "./zone-places";
import type { AnchorGround } from "../../app/viewer/types";

const ground = (floor: boolean): AnchorGround => ({ sampler: () => (floor ? 0 : null), spawn: [0, 1, 0], bounds: { min: [-20, 0, -20], max: [20, 5, 20] } });
const ids = ["z1", "z2", "z3", "z4", "z5", "z6"];

describe("zonePlacesFromGround (party-mode 8.4)", () => {
  it("gives each Zone id a place, the same places for the same world", () => {
    const a = zonePlacesFromGround(ground(true), ids, "attic");
    expect(Object.keys(a)).toEqual(ids);
    expect(zonePlacesFromGround(ground(true), ids, "attic")).toEqual(a);
    expect(zonePlacesFromGround(ground(true), ids, "cellar")).not.toEqual(a);
  });
  it("falls back to the ring on a world with no floor, and gives nothing for more ids than places", () => {
    expect(Object.keys(zonePlacesFromGround(ground(false), ids, "attic"))).toEqual(ids);
    expect(zonePlacesFromGround(ground(true), [...ids, "z7"], "attic")).toEqual({});
  });
});
