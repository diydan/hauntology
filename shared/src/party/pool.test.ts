import { describe, expect, it } from "vitest";
import { framedPhotos } from "./pool";


describe("framedPhotos (party-mode 8.4)", () => {
  const zones = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `z${n}`, name: `n${n}`, contributedBy: n === 2 ? 4 : null }));
  it("frames a photo near the Zone its contributor named, and fills the next free Zones with the rest, one photo a Zone", () => {
    const r = framedPhotos({ zones, photos: [{ photoId: "a", seat: 1 }, { photoId: "b", seat: 4 }, { photoId: "c", seat: 2 }] });
    expect(r).toEqual([{ zone: "z1", photoId: "a" }, { zone: "z2", photoId: "b" }, { zone: "z3", photoId: "c" }]);
  });
  it("frames nothing with no photo, and never more photos than Zones", () => {
    expect(framedPhotos({ zones, photos: [] })).toEqual([]);
    const many = Array.from({ length: 8 }, (_, i) => ({ photoId: `p${i}`, seat: (i % 6) + 1 }));
    expect(framedPhotos({ zones, photos: many })).toHaveLength(6);
  });
});
