import { describe, expect, it } from "vitest";
import draft from "../../fixtures/gallery/draft-entries.json";
import { PRESET_PROFILES } from "../creator/presets";
import { mentionsRealWorld } from "../conditions/real-world-terms";
import { cleanBrief } from "./brief";
import { GALLERY_ID, GALLERY_MIN_WORLDS, GalleryWorldPlanSchema } from "./gallery";

/**
 * The authored half of the Gallery (world-pipeline 9.1, ghost-engine 7): six places, each with its Place Brief and the Preset Ghost that haunts it. The files and the hand-tuned
 * pose of each are not here (they need a generated world); this test holds what can be checked now, so a brief that the app would cut, a ghost that does not exist or a place no one
 * is paired with cannot reach the plan.
 */
type Entry = { id: string; title: string; ghostPreset: string; brief: string; picture: string; anchorSpots: string[] };
const entries = draft.entries as Entry[];

describe("the six drafted Gallery Worlds", () => {
  it("are at least the six the requirement asks for, with distinct ids the manifest accepts", () => {
    expect(entries.length).toBeGreaterThanOrEqual(GALLERY_MIN_WORLDS);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
    for (const e of entries) expect(e.id, e.id).toMatch(GALLERY_ID);
  });
  it("pair each place with one Preset Ghost that exists, and use every Preset Ghost once", () => {
    const names = PRESET_PROFILES.map((p) => p.persona.name);
    expect(entries.map((e) => e.ghostPreset).sort()).toEqual([...names].sort());
  });
  it("have a Place Brief the app would keep whole (80 words, 600 characters), with no digit, markup or link", () => {
    for (const e of entries) {
      expect(cleanBrief(e.brief), e.id).toBe(e.brief);
      expect(e.brief, e.id).not.toMatch(/[\d<>`*#\[\]{}]|https?:|www\./i);
      expect(e.brief.split(/\s+/).length, e.id).toBeGreaterThanOrEqual(12);
    }
  });
  it("mention no news, crime, death or real event, in the brief, the title or the guidance (the ghost's own rule)", () => {
    for (const e of entries) for (const text of [e.brief, e.title, e.picture, ...e.anchorSpots]) expect(mentionsRealWorld(text), `${e.id}: ${text}`).toBe(false);
  });
  it("have a title that reads plainly, a picture direction and exactly three anchor spots", () => {
    for (const e of entries) {
      expect(e.title.length, e.id).toBeGreaterThan(4);
      expect(e.title.length, e.id).toBeLessThanOrEqual(60);
      expect(e.picture.length, e.id).toBeGreaterThan(40);
      expect(e.anchorSpots, e.id).toHaveLength(3);
      expect(new Set(e.anchorSpots).size, e.id).toBe(3);
    }
  });
  it("fit the plan's own schema once files, attribution and the day are added (so no draft field is a trap)", () => {
    for (const e of entries) {
      const plan = GalleryWorldPlanSchema.safeParse({
        id: e.id, title: e.title, brief: e.brief, ghostPreset: e.ghostPreset, attribution: { credit: "Your own picture", licence: "To fill in" },
        files: { splat: [{ file: "a.spz" }], thumb: "t.jpg" },
      });
      expect(plan.success, `${e.id}: ${plan.success ? "" : JSON.stringify(plan.error.issues)}`).toBe(true);
    }
  });
});
