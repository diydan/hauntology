import { describe, expect, it } from "vitest";
import { loadWorldChoices, MAX_WORLD_CHOICES } from "./worlds";

const b = (r: number) => ({ min: [-r, 0, -r], max: [r, 3, r] });
const rig = (gallery: unknown, manifests: Record<string, unknown>, galleryOk = true) => async (url: string) => {
  if (url === "/api/gallery") return { ok: galleryOk, json: async () => gallery };
  const id = decodeURIComponent(url.replace("/api/worlds/", ""));
  if (!(id in manifests)) throw new Error("down");
  return { ok: manifests[id] !== null, json: async () => manifests[id] };
};

describe("loadWorldChoices (party-mode 9.10)", () => {
  it("lists the Gallery's worlds with the walk radius of each manifest's bounds", async () => {
    const out = await loadWorldChoices(rig([{ id: "kitchen", title: "The kitchen" }, { id: "closet", title: "" }], { kitchen: { manifest: { bounds: b(10) } }, closet: { manifest: { bounds: b(3) } } }));
    expect(out.map((w) => [w.id, w.name, w.authoredZones])).toEqual([["kitchen", "The kitchen", false], ["closet", "closet", false]]);
    expect(out[0]!.walkRadius).toBeGreaterThan(out[1]!.walkRadius);
    expect(out[0]!.walkRadius).toBeGreaterThanOrEqual(7);
  });
  it("leaves out a world that will not load, has no bounds, or has a nonsense id, and gives an empty list for a failed or odd Gallery", async () => {
    const out = await loadWorldChoices(rig([{ id: "ok", title: "Ok" }, { id: "down", title: "x" }, { id: "nobounds", title: "x" }, { id: "gone", title: "x" }, { id: 5 }, { id: "x".repeat(80) }], { ok: { manifest: { bounds: b(9) } }, nobounds: { manifest: {} }, gone: null }));
    expect(out.map((w) => w.id)).toEqual(["ok"]);
    expect(await loadWorldChoices(rig([], {}, false))).toEqual([]);
    expect(await loadWorldChoices(rig({ not: "a list" }, {}))).toEqual([]);
    expect(await loadWorldChoices(async () => { throw new Error("offline"); })).toEqual([]);
  });
  it("asks for at most twelve worlds", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `w${i}`, title: `W${i}` }));
    const manifests = Object.fromEntries(many.map((m) => [m.id, { manifest: { bounds: b(8) } }]));
    expect(await loadWorldChoices(rig(many, manifests))).toHaveLength(MAX_WORLD_CHOICES);
  });
});
