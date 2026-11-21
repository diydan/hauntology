import { describe, expect, it } from "vitest";
import { PRESET_PROFILES } from "@hauntology/shared/creator/presets";
import { randomTraits } from "@hauntology/shared/creator/traits";
import { makeJpeg } from "@hauntology/shared/world/upload-kit";
import type { SelfieReport } from "@hauntology/shared/party/selfie";
import { createCreator } from "../creator/service";
import { MemoryCreatorStore } from "../creator/store";
import type { PhotoVetAnswer, PhotoVetter, SelfieVetAnswer } from "../guarded/workersai/photo-vet";
import type { EditAnswer, PortraitEditor } from "../guarded/workersai/selfie-edit";
import type { TextGuard } from "../guarded/workersai/guard";
import { DEFAULT_CAPS, MemorySpendGuard } from "../worlds/fakes";
import { MemoryRoomSpendStore, RoomBudget } from "./budget";
import { contributeDetail, contributeSelfie, contributeZoneName, ghostKey, intakePhoto, presetFor, promptsFor, skipPrompt, suspectPortraits, suspectSprite, type ContributeDeps, type PhotoStore, type SelfieDeps } from "./contribute";
import { pngWithSubject } from "./test-kit";

const NOW = 1_800_000_000_000;
const SCOPE = "room-ABCD";
const jpeg = (w = 800, h = 600): Uint8Array => makeJpeg({ width: w, height: h });

function world(caps = { images: 12, models: 60 }) {
  const ledger = new MemorySpendGuard({ ...DEFAULT_CAPS, image: { session: 99, day: 999 }, llm: { session: 99, day: 999 } }, () => NOW);
  const store = new MemoryRoomSpendStore();
  const budget = new RoomBudget(ledger, SCOPE, caps, store);
  const base: ContributeDeps = { budget, scope: SCOPE, now: () => NOW, random: (n) => new Uint8Array(n).fill(9) };
  return { ledger, store, budget, base };
}
class MemoryPhotos implements PhotoStore {
  files = new Map<string, { bytes: Uint8Array; meta: unknown }>();
  async put(id: string, bytes: Uint8Array, meta: unknown): Promise<void> { this.files.set(id, { bytes, meta }); }
  async deleteRoom(): Promise<void> { this.files.clear(); }
}
const vetter = (photo: PhotoVetAnswer | (() => PhotoVetAnswer), selfie: SelfieVetAnswer = { ok: true, verdict: { kind: "ok" } }) => {
  const calls = { photo: 0, selfie: 0 };
  const v: PhotoVetter = { vetPhoto: async () => { calls.photo++; return typeof photo === "function" ? photo() : photo; }, vetSelfie: async () => { calls.selfie++; return selfie; } };
  return { v, calls };
};
const shrinker = { shrink: async () => ({ ok: true as const, image: new Uint8Array([7, 7]), contentType: "image/jpeg" as const }) };

describe("photo intake (party-mode 5.1, 5.1a)", () => {
  it("validates, shrinks, checks and stores a photo privately for the Room, charging one model unit", async () => {
    const w = world(); const photos = new MemoryPhotos(); const { v, calls } = vetter({ ok: true, verdict: { kind: "ok" } });
    const r = await intakePhoto({ ...w.base, vetter: v, shrinker, photos }, { seat: 3, bytes: jpeg(), declaredType: "image/jpeg", promptId: "mug" });
    expect(r).toMatchObject({ ok: true, status: "accepted" });
    if (!r.ok) return;
    expect(photos.files.get(r.photoId)?.bytes).toEqual(new Uint8Array([7, 7]));
    expect(photos.files.get(r.photoId)?.meta).toMatchObject({ room: SCOPE, seat: 3, promptId: "mug", contentType: "image/jpeg" });
    expect([calls.photo, w.store.spend]).toEqual([1, { images: 0, models: 1 }]);
  });
  it("rejects a person in the photo with photo_rejected:person_visible, and unsafe content with photo_rejected:unsafe, storing nothing", async () => {
    for (const [kind, reason] of [["person_visible", "person_visible"], ["unsafe", "unsafe"]] as const) {
      const w = world(); const photos = new MemoryPhotos();
      const r = await intakePhoto({ ...w.base, vetter: vetter({ ok: true, verdict: { kind } }).v, shrinker, photos }, { seat: 1, bytes: jpeg(), declaredType: "image/jpeg" });
      expect(r).toEqual({ ok: false, code: "photo_rejected", reason });
      expect(photos.files.size).toBe(0);
    }
  });
  it("fails closed: no vetter, a failed call, an unreadable verdict or a refused reservation all say moderation_unavailable or a quota, and store nothing", async () => {
    const photos = new MemoryPhotos();
    const input = { seat: 1, bytes: jpeg(), declaredType: "image/jpeg" };
    expect(await intakePhoto({ ...world().base, vetter: null, shrinker, photos }, input)).toEqual({ ok: false, code: "moderation_unavailable" });
    const failed = world();
    expect(await intakePhoto({ ...failed.base, vetter: vetter({ ok: false, kind: "failed" }).v, shrinker, photos }, input)).toEqual({ ok: false, code: "moderation_unavailable" });
    expect(failed.store.spend.models).toBe(0); // not charged: the unit came back
    const odd = world();
    expect(await intakePhoto({ ...odd.base, vetter: vetter({ ok: true, verdict: { kind: "unusable" } }).v, shrinker, photos }, input)).toEqual({ ok: false, code: "moderation_unavailable" });
    expect(odd.store.spend.models).toBe(1); // charged: the service answered
    const capped = world({ images: 12, models: 0 }); const c = vetter({ ok: true, verdict: { kind: "ok" } });
    expect(await intakePhoto({ ...capped.base, vetter: c.v, shrinker, photos }, input)).toEqual({ ok: false, code: "quota_model" });
    expect(c.calls.photo).toBe(0);
    expect(photos.files.size).toBe(0);
  });
  it("applies the world-pipeline upload rules before anything is spent", async () => {
    const w = world(); const c = vetter({ ok: true, verdict: { kind: "ok" } }); const photos = new MemoryPhotos();
    const deps = { ...w.base, vetter: c.v, shrinker, photos };
    expect(await intakePhoto(deps, { seat: 1, bytes: jpeg(), declaredType: "image/gif" })).toEqual({ ok: false, code: "upload_bad_type" });
    expect(await intakePhoto(deps, { seat: 1, bytes: jpeg(200, 200), declaredType: "image/jpeg" })).toEqual({ ok: false, code: "upload_too_small" });
    expect(await intakePhoto(deps, { seat: 1, bytes: new Uint8Array([1, 2, 3, 4]), declaredType: "image/jpeg" })).toMatchObject({ ok: false, code: "upload_bad_magic" });
    expect([c.calls.photo, w.store.spend.models]).toEqual([0, 0]);
  });
  it("says photo_unavailable when the picture cannot be shrunk or stored, and still never blocks anything else", async () => {
    const w = world(); const { v } = vetter({ ok: true, verdict: { kind: "ok" } });
    const input = { seat: 1, bytes: jpeg(), declaredType: "image/jpeg" };
    expect(await intakePhoto({ ...w.base, vetter: v, shrinker: null, photos: new MemoryPhotos() }, input)).toEqual({ ok: false, code: "photo_unavailable" });
    expect(await intakePhoto({ ...w.base, vetter: v, shrinker: { shrink: async () => ({ ok: false as const }) }, photos: new MemoryPhotos() }, input)).toEqual({ ok: false, code: "photo_unavailable" });
    const broken: PhotoStore = { put: async () => { throw new Error("r2 down"); }, deleteRoom: async () => undefined };
    expect(await intakePhoto({ ...w.base, vetter: v, shrinker, photos: broken }, input)).toEqual({ ok: false, code: "photo_unavailable" });
  });
  it("offers three prompts a round and allows exactly three skips, then says prompt_skips_used", () => {
    const first = promptsFor(42, 2, 0)!;
    expect(first.prompts).toHaveLength(3);
    expect(first.prompts.every((p) => p.tip.endsWith("No people or faces."))).toBe(true);
    let round = 0; const seen = new Set(first.prompts.map((p) => p.id));
    for (let i = 0; i < 3; i++) { const r = skipPrompt(42, 2, round); if ("ok" in r) throw new Error("skip should work"); round = r.round; for (const p of r.prompts) { expect(seen.has(p.id)).toBe(false); seen.add(p.id); } }
    expect(round).toBe(3);
    expect(skipPrompt(42, 2, 3)).toEqual({ ok: false, code: "prompt_skips_used" });
    expect(seen.size).toBe(12);
  });
});

const guardOf = (verdict: "safe" | "unsafe" | "unusable" | "throws" | "fails") => {
  const calls: string[] = [];
  const g: TextGuard = { check: async (t) => { calls.push(t); if (verdict === "throws") throw new Error("x"); if (verdict === "fails") return { ok: false, kind: "failed" }; return { ok: true, verdict: verdict === "safe" ? { kind: "safe" } : verdict === "unsafe" ? { kind: "unsafe", categories: ["S1"] } : { kind: "unusable" } }; } };
  return { g, calls };
};

describe("Zone names and Suspect details (party-mode 5.3, 10.3)", () => {
  it("cleans a Zone name, checks it with Llama Guard on the Room's model meter, and returns the cleaned text", async () => {
    const w = world(); const { g, calls } = guardOf("safe");
    expect(await contributeZoneName({ ...w.base, guard: g }, "  The <b>Old</b>   Mill  ")).toEqual({ ok: true, name: "The b Old /b Mill" });
    expect(calls).toEqual(["The b Old /b Mill"]);
    expect(w.store.spend.models).toBe(1);
  });
  it("refuses a name that is too short or long or not text without any call, and an unsafe one with name_unsafe", async () => {
    const w = world(); const { g, calls } = guardOf("safe");
    for (const raw of ["", "ab", "x".repeat(25), 42, null, "<>"]) expect(await contributeZoneName({ ...w.base, guard: g }, raw)).toEqual({ ok: false, code: "name_invalid" });
    expect(calls).toHaveLength(0);
    expect(await contributeZoneName({ ...w.base, guard: guardOf("unsafe").g }, "The Mill")).toEqual({ ok: false, code: "name_unsafe" });
  });
  it("fails closed with moderation_unavailable when there is no guard, it throws, fails or cannot be read, and with quota_model at the Room cap", async () => {
    for (const guard of [null, guardOf("throws").g, guardOf("fails").g, guardOf("unusable").g]) {
      const w = world();
      expect(await contributeZoneName({ ...w.base, guard }, "The Mill")).toEqual({ ok: false, code: "moderation_unavailable" });
    }
    expect(await contributeZoneName({ ...world({ images: 12, models: 0 }).base, guard: guardOf("safe").g }, "The Mill")).toEqual({ ok: false, code: "quota_model" });
  });
  it("cleans a detail (no markup, no URLs, 140 characters), needs no call when it is empty, and refuses an unsafe one", async () => {
    const w = world(); const { g, calls } = guardOf("safe");
    expect(await contributeDetail({ ...w.base, guard: g }, "")).toEqual({ ok: true, detail: "" });
    expect(await contributeDetail({ ...w.base, guard: g }, undefined)).toEqual({ ok: true, detail: "" });
    expect(calls).toHaveLength(0);
    const r = await contributeDetail({ ...w.base, guard: g }, `loves <i>tea</i> see http://evil.example ${"a".repeat(300)}`);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.detail).not.toMatch(/[<>]|http/); expect(r.detail.length).toBeLessThanOrEqual(140); }
    expect(await contributeDetail({ ...world().base, guard: guardOf("unsafe").g }, "something rude")).toEqual({ ok: false, code: "name_unsafe" });
    expect(await contributeDetail({ ...world().base, guard: null }, "something")).toEqual({ ok: false, code: "moderation_unavailable" });
  });
});

describe("the Suspect flow (party-mode 5.2)", () => {
  const traits = { ...randomTraits(4), detail: "kept the lighthouse stairs swept" };
  function suspectWorld(over: { portraitFails?: boolean; cutBad?: boolean; caps?: { images: number; models: number } } = {}) {
    const w = world(over.caps); const cstore = new MemoryCreatorStore();
    const calls = { portraits: 0 };
    const creator = createCreator({
      guard: w.budget, store: cstore, now: () => NOW, random: (n) => new Uint8Array(n).fill(7), briefFor: async () => "A narrow kitchen.",
      portraitist: { render: async () => { calls.portraits++; return over.portraitFails ? { ok: false, kind: "failed" } : { ok: true, image: pngWithSubject(520, 640, 0.1) }; } },
      moderator: guardOf("safe").g,
      cutter: { cut: async () => ({ ok: true, image: over.cutBad ? pngWithSubject(40, 60, 0, false) : pngWithSubject(40, 60, 0.25) }) },
    });
    return { ...w, cstore, creator, calls, deps: { ...w.base, creator, store: cstore, guard: guardOf("safe").g } };
  }
  it("makes candidates and a Sprite charged to the Room, with the Lodger Voice the Player picked (Mark when none)", async () => {
    const s = suspectWorld();
    const p = await suspectPortraits(s.deps, 2, traits);
    if (p.fallback) throw new Error(`unexpected fallback ${p.reason}`);
    expect(p.candidates).toHaveLength(2);
    expect(s.store.spend.images).toBe(1);
    const made = await suspectSprite(s.deps, 2, p.candidates[0]!.candidateId, "lighter");
    expect(made).toMatchObject({ ok: true, fallback: false });
    expect(made.profile.lodgerVoice).toBe("chloe");
    expect(made.profile.spriteUrl).toBe(`/api/ghosts/sprite/${encodeURIComponent(ghostKey(SCOPE, 2))}`);
    expect((await s.cstore.readProfile(ghostKey(SCOPE, 2)))?.lodgerVoice).toBe("chloe");
    const p2 = await suspectPortraits(s.deps, 3, traits);
    if (p2.fallback) throw new Error("fallback");
    expect((await suspectSprite(s.deps, 3, p2.candidates[0]!.candidateId)).profile.lodgerVoice).toBe("mark");
  });
  it("falls back to a Preset for the seat on any failure, with the reason: bad traits, a failed portrait, the Room cap, a refused cut-out, no creator", async () => {
    const ids = PRESET_PROFILES.map((p) => p.id);
    const bad = await suspectPortraits(suspectWorld().deps, 4, { epoch: "nope" });
    expect(bad).toMatchObject({ ok: true, fallback: true, reason: "trait_invalid" });
    expect(ids).toContain((bad as { profile: { id: string } }).profile.id);
    expect(await suspectPortraits(suspectWorld({ portraitFails: true }).deps, 4, traits)).toMatchObject({ fallback: true, reason: "portrait_failed" });
    expect(await suspectPortraits(suspectWorld({ caps: { images: 0, models: 60 } }).deps, 4, traits)).toMatchObject({ fallback: true, reason: "quota_image" });
    const cut = suspectWorld({ cutBad: true });
    const p = await suspectPortraits(cut.deps, 4, traits);
    if (p.fallback) throw new Error("fallback");
    expect(await suspectSprite(cut.deps, 4, p.candidates[0]!.candidateId)).toMatchObject({ ok: true, fallback: true, reason: "sprite_invalid" });
    expect(await suspectSprite({ ...cut.deps, creator: null }, 4, "x")).toMatchObject({ fallback: true, reason: "creator_unavailable" });
    expect(await suspectSprite(cut.deps, 4, "no-such-candidate")).toMatchObject({ fallback: true, reason: "candidate_missing" });
  });
  it("gives each seat a stable Preset, and different seats different Presets", () => {
    expect(presetFor(3)).toBe(presetFor(3));
    expect(new Set([1, 2, 3, 4, 5, 6].map((s) => presetFor(s).id)).size).toBe(Math.min(6, PRESET_PROFILES.length));
  });
});

const GOOD: SelfieReport = { faces: 1, faceAreaShare: 0.3, blur: 0.1, brightness: 0.6 };
describe("the selfie ghost (party-mode 5.5)", () => {
  const traits = randomTraits(9);
  function selfieWorld(o: { editor?: PortraitEditor | null; vet?: SelfieVetAnswer; cutBad?: boolean; caps?: { images: number; models: number }; style?: boolean } = {}) {
    const w = world(o.caps); const store = new MemoryCreatorStore();
    const editCalls: unknown[] = []; const holder = { ref: null as Uint8Array | null, clearCount: 0 };
    const editor: PortraitEditor | null = o.editor === undefined ? { edit: async (r): Promise<EditAnswer> => { editCalls.push(r); return { ok: true, image: pngWithSubject(512, 512, 0.1) }; } } : o.editor;
    const v = vetter({ ok: true, verdict: { kind: "ok" } }, o.vet);
    const deps: SelfieDeps = { ...w.base, vetter: v.v, editor, store, holder,
      cutter: { cut: async () => ({ ok: true, image: o.cutBad ? pngWithSubject(40, 60, 0, false) : pngWithSubject(40, 60, 0.25) }) },
      styleRef: async () => (o.style === false ? null : { bytes: new Uint8Array([5]), contentType: "image/png" }) };
    const input = (over: Record<string, unknown> = {}) => ({ seat: 2, settings: { selfies: true }, player: { selfieYes: true, selfieMade: false }, bytes: jpeg(), declaredType: "image/jpeg", report: GOOD, traits, ...over });
    return { ...w, store: w.store, creatorStore: store, deps, editCalls, holder, v, input };
  }
  it("is refused unless the Master's switch is on, the seat said yes and none was made, with nothing spent and the bytes zeroed", async () => {
    for (const over of [{ settings: { selfies: false } }, { player: { selfieYes: false, selfieMade: false } }, { player: { selfieYes: true, selfieMade: true } }]) {
      const s = selfieWorld(); const bytes = jpeg(); const r = await contributeSelfie(s.deps, s.input({ ...over, bytes }));
      expect(r).toEqual({ ok: false, code: "selfie_not_allowed" });
      expect(bytes.every((b) => b === 0)).toBe(true);
      expect([s.v.calls.selfie, s.editCalls.length, s.store.spend]).toEqual([0, 0, { images: 0, models: 0 }]);
    }
  });
  it("refuses a frame the browser's own report says is bad, before any call", async () => {
    const s = selfieWorld();
    expect(await contributeSelfie(s.deps, s.input({ report: { ...GOOD, faces: 2 } }))).toEqual({ ok: false, code: "selfie_unusable", reason: "many_faces" });
    expect(await contributeSelfie(s.deps, s.input({ report: { ...GOOD, brightness: 0.05 } }))).toEqual({ ok: false, code: "selfie_unusable", reason: "dark" });
    expect([s.v.calls.selfie, s.editCalls.length]).toEqual([0, 0]);
  });
  it("makes a ghost: vision check, one edit with the fixed prompt and style reference, a cut-out, charges one image unit, saves only the ghost, and zeroes the selfie", async () => {
    const s = selfieWorld();
    const bytes = jpeg();
    const r = await contributeSelfie(s.deps, s.input({ bytes, pick: "lighter" }));
    expect(r).toMatchObject({ ok: true, fallback: false });
    if (!r.ok) return;
    expect(r.profile.lodgerVoice).toBe("chloe");
    expect(s.editCalls).toHaveLength(1);
    const sent = s.editCalls[0] as { prompt: string; options: unknown; selfie: Uint8Array };
    expect(sent.prompt).toMatch(/^the same person as image 1/);
    expect(sent.options).toEqual({ aspect_ratio: "1:1", resolution: "1K", output_format: "png" });
    expect(s.store.spend).toEqual({ images: 1, models: 1 });
    expect((await s.creatorStore.readSprite(ghostKey(SCOPE, 2)))?.byteLength).toBeGreaterThan(0);
    // the selfie was never stored and every copy this service held is zeroed
    expect(s.holder).toEqual({ ref: null, clearCount: 1 });
    expect(sent.selfie.every((b) => b === 0)).toBe(true);
    expect(bytes.every((b) => b === 0)).toBe(true);
    for (const [, p] of s.creatorStore.profiles) expect(JSON.stringify(p)).not.toMatch(/selfie/i);
    expect(s.creatorStore.candidates.size).toBe(0);
  });
  it("retries the edit and cut-out once, then falls back to a Preset; each edit costs one image unit and a failed one is given back", async () => {
    const s = selfieWorld({ cutBad: true });
    const r = await contributeSelfie(s.deps, s.input());
    expect(r).toMatchObject({ ok: true, fallback: true, reason: "sprite_invalid" });
    expect(s.editCalls).toHaveLength(2);
    expect(s.store.spend.images).toBe(0);
    expect(s.holder.clearCount).toBe(1);
  });
  it("gives a Preset, with no error screen, for each failure: no editor, no style reference, an unsafe or unreadable verdict, the Room's image cap, a throwing editor", async () => {
    const reason = async (o: Parameters<typeof selfieWorld>[0]) => { const s = selfieWorld(o); const r = await contributeSelfie(s.deps, s.input()); return { r, s }; };
    expect((await reason({ editor: null })).r).toMatchObject({ ok: true, fallback: true, reason: "selfie_unavailable" });
    expect((await reason({ style: false })).r).toMatchObject({ fallback: true, reason: "selfie_unavailable" });
    expect((await reason({ vet: { ok: true, verdict: { kind: "unsafe" } } })).r).toMatchObject({ fallback: true, reason: "selfie_unsafe" });
    expect((await reason({ vet: { ok: true, verdict: { kind: "many_faces" } } })).r).toMatchObject({ fallback: true, reason: "selfie_many_faces" });
    expect((await reason({ vet: { ok: false, kind: "failed" } })).r).toMatchObject({ fallback: true, reason: "moderation_unavailable" });
    const capped = await reason({ caps: { images: 0, models: 60 } });
    expect(capped.r).toMatchObject({ fallback: true, reason: "quota_image" });
    expect(capped.s.editCalls).toHaveLength(0);
    const boom = await reason({ editor: { edit: async () => { throw new Error("boom"); } } });
    expect(boom.r).toMatchObject({ fallback: true, reason: "sprite_invalid" });
    for (const x of [capped, boom]) expect(x.s.holder.clearCount).toBe(1);
  });
});
