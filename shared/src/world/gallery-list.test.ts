import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GalleryItemSchema } from "../app/api-schemas";
import { ATTRIBUTION_MAX, DESCRIPTION_MAX, GALLERY_LIST_MAX, attributionOf, descriptionOf, galleryItemOf, galleryList } from "./gallery-list";
import type { WorldManifest } from "./manifest";

const manifest = (over: Partial<WorldManifest> = {}): WorldManifest => ({
  id: "blue-kitchen",
  title: "The blue kitchen",
  createdAt: 1_794_700_800_000,
  source: "gallery",
  assets: { splat: [{ path: "splat-500k.spz", bytes: 1000, lod: "500k" }], thumb: { path: "thumb.jpg", bytes: 300 } },
  orientation: { upFix: [1, 0, 0, 0], scale: 1 },
  spawn: { position: [0, 2, 0], yaw: 0 },
  floorY: 0.4,
  bounds: { min: [-5, 0.4, -5], max: [5, 4, 5] },
  brief: "A narrow kitchen with a blue door and a kettle on the stove.",
  attribution: { credit: "Photo by A. Person", licence: "CC BY 4.0", url: "https://example.com/p/kitchen" },
  ...over,
});

describe("galleryItemOf", () => {
  it("gives the shell's item: id, title, the brief as the description, the thumbnail's own path, and credit and licence in one line", () => {
    expect(galleryItemOf(manifest())).toEqual({
      id: "blue-kitchen",
      title: "The blue kitchen",
      description: "A narrow kitchen with a blue door and a kettle on the stove.",
      thumbUrl: "/api/worlds/blue-kitchen/assets/thumb.jpg",
      attribution: "Photo by A. Person · CC BY 4.0",
    });
    expect(GalleryItemSchema.safeParse(galleryItemOf(manifest())).success).toBe(true);
  });

  it("points at the thumbnail the manifest names, whatever its name", () => {
    const item = galleryItemOf(manifest({ assets: { splat: [{ path: "splat-500k.spz", bytes: 1 }], thumb: { path: "thumb.webp", bytes: 3 } } }));
    expect(item?.thumbUrl).toBe("/api/worlds/blue-kitchen/assets/thumb.webp");
  });

  it("leaves out a world with no thumbnail or no credit, because the list shows both", () => {
    const { thumb: _t, ...noThumb } = manifest().assets;
    expect(galleryItemOf(manifest({ assets: noThumb }))).toBeNull();
    const { attribution: _a, ...noCredit } = manifest();
    expect(galleryItemOf(noCredit as WorldManifest)).toBeNull();
  });

  it("never sends the source address, the pose, the files' sizes or the preset", () => {
    const item = galleryItemOf(manifest({ ghostPreset: "wistful-cook" })) as Record<string, unknown>;
    expect(Object.keys(item).sort()).toEqual(["attribution", "description", "id", "thumbUrl", "title"]);
    expect(JSON.stringify(item)).not.toMatch(/example\.com|wistful|bytes|spawn/);
  });
});

describe("descriptionOf", () => {
  it("is the cleaned brief: white space collapsed, invisible characters gone", () => {
    expect(descriptionOf("  A   kitchen.  ")).toBe("A kitchen.");
    expect(descriptionOf("A\u200b kitchen\u202e.")).toBe("A kitchen .");
    expect(descriptionOf("")).toBe("");
  });

  it("is at most 80 words and 600 characters, the shell's limit, cut at a word end", () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`);
    const d = descriptionOf(words.join(" "));
    expect(d.split(" ")).toHaveLength(80);
    expect(d.length).toBeLessThanOrEqual(600);
    const long = Array.from({ length: 70 }, () => "abcdefghi").join(" ");
    const cut = descriptionOf(long);
    expect(cut.length).toBeLessThanOrEqual(600);
    expect(long.startsWith(cut)).toBe(true);
    expect(/abcdefghi$/.test(cut)).toBe(true);
    expect(descriptionOf("x".repeat(700)).length).toBeLessThanOrEqual(600);
    expect(DESCRIPTION_MAX).toBe(600);
    expect(ATTRIBUTION_MAX).toBe(300);
    expect(GALLERY_LIST_MAX).toBe(50);
  });
});

describe("attributionOf", () => {
  it("joins credit and licence with a middle dot", () => {
    expect(attributionOf("Self-made", "CC0")).toBe("Self-made · CC0");
  });

  it("is at most 300 characters, shortens the credit with an ellipsis, and keeps the licence whole", () => {
    const a = attributionOf("c".repeat(200), "l".repeat(100));
    expect(a.length).toBeLessThanOrEqual(ATTRIBUTION_MAX);
    expect(a.endsWith(` · ${"l".repeat(100)}`)).toBe(true);
    expect(a).toContain("…");
    const exactly = attributionOf("c".repeat(197), "l".repeat(100));
    expect(exactly.length).toBe(300);
    expect(exactly).not.toContain("…");
    expect(attributionOf("c".repeat(198), "l".repeat(100))).toContain("…");
  });

  it("Property: the line is always one the shell accepts and always ends with the whole licence", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 200 }), fc.string({ minLength: 1, maxLength: 100 }), (credit, licence) => {
        const a = attributionOf(credit, licence);
        expect(a.length).toBeLessThanOrEqual(ATTRIBUTION_MAX);
        expect(a.endsWith(` · ${licence}`)).toBe(true);
      }),
      { numRuns: 300, seed: 9201 },
    );
  });
});

describe("galleryList", () => {
  it("is sorted by id, holds only worlds that can be shown, and is at most 50", () => {
    const ids = ["c-world", "a-world", "b-world"];
    expect(galleryList(ids.map((id) => manifest({ id }))).map((i) => i.id)).toEqual(["a-world", "b-world", "c-world"]);
    const { thumb: _t, ...noThumb } = manifest().assets;
    expect(galleryList([manifest({ id: "ok-one" }), manifest({ id: "no-thumb", assets: noThumb })]).map((i) => i.id)).toEqual(["ok-one"]);
    const many = Array.from({ length: 60 }, (_, i) => manifest({ id: `w-${String(i).padStart(3, "0")}` }));
    const list = galleryList(many);
    expect(list).toHaveLength(GALLERY_LIST_MAX);
    expect(list[0]!.id).toBe("w-000");
    expect(list.at(-1)!.id).toBe("w-049");
    expect(galleryList([])).toEqual([]);
  });

  it("Property: every item fits the shell's schema, whatever the title, brief and credit", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), fc.string({ maxLength: 2000 }), fc.string({ minLength: 1, maxLength: 200 }), fc.string({ minLength: 1, maxLength: 100 }), (title, brief, credit, licence) => {
        const item = galleryItemOf(manifest({ title, brief, attribution: { credit, licence } }));
        expect(item).not.toBeNull();
        expect(GalleryItemSchema.safeParse(item).success).toBe(true);
      }),
      { numRuns: 300, seed: 9202 },
    );
  });
});
