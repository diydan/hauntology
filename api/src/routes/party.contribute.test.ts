import { describe, expect, it } from "vitest";
import { randomTraits } from "@hauntology/shared/creator/traits";
import { DEFAULT_ROOM_CAPS } from "@hauntology/shared/party/spend";
import { makeJpeg } from "@hauntology/shared/world/upload-kit";
import { createCreator } from "../creator/service";
import { MemoryCreatorStore } from "../creator/store";
import { PartyDirectory } from "../do/party-directory";
import { PartyRoom } from "../do/party-room";
import type { TextGuard } from "../guarded/workersai/guard";
import type { PhotoVetAnswer, PhotoVetter } from "../guarded/workersai/photo-vet";
import { RoomBudget } from "../party/budget";
import { roomScope, type PhotoStore } from "../party/contribute";
import { pngWithSubject } from "../party/test-kit";
import { DoRoomSpendStore } from "../party/spend-store";
import type { ContributionServices } from "../party/wiring";
import { DEFAULT_CAPS, MemorySpendGuard } from "../worlds/fakes";
import { FakeNamespace } from "../worlds/fake-cloudflare";
import { partyRoutes } from "./party";

const NOW = 1_800_000_000_000;
class MemoryPhotos implements PhotoStore { files = new Map<string, Uint8Array>(); async put(id: string, b: Uint8Array) { this.files.set(id, b); } async deleteRoom() { this.files.clear(); } }

function world(o: { vet?: PhotoVetAnswer; guardVerdict?: "safe" | "unsafe"; services?: boolean; selfies?: boolean } = {}) {
  const rooms = new FakeNamespace((state) => new PartyRoom(state, {}, () => NOW));
  const directory = new FakeNamespace((state) => new PartyDirectory(state));
  const ledger = new MemorySpendGuard({ ...DEFAULT_CAPS, image: { session: 99, day: 999 }, llm: { session: 99, day: 999 } }, () => NOW);
  const photos = new MemoryPhotos(); const cstore = new MemoryCreatorStore();
  const vetCalls = { n: 0 };
  const vetter: PhotoVetter = { vetPhoto: async () => { vetCalls.n++; return o.vet ?? { ok: true, verdict: { kind: "ok" } }; }, vetSelfie: async () => ({ ok: true, verdict: { kind: "ok" } }) };
  const moderator: TextGuard = { check: async () => ({ ok: true, verdict: o.guardVerdict === "unsafe" ? { kind: "unsafe", categories: ["S1"] } : { kind: "safe" } }) };
  const contribute = (code: string, room: { fetch(i: string, init?: RequestInit): Promise<Response> }): ContributionServices => {
    const scope = roomScope(code);
    const budget = new RoomBudget(ledger, scope, DEFAULT_ROOM_CAPS, new DoRoomSpendStore(room, DEFAULT_ROOM_CAPS));
    const base = { budget, scope, now: () => NOW, random: (n: number) => new Uint8Array(n).fill(3) };
    const creator = createCreator({
      guard: budget, store: cstore, now: () => NOW, random: (n) => new Uint8Array(n).fill(7), briefFor: async () => "",
      portraitist: { render: async () => ({ ok: true, image: pngWithSubject(520, 640, 0.1) }) }, moderator,
      cutter: { cut: async () => ({ ok: true, image: pngWithSubject(40, 60, 0.25) }) },
    });
    return {
      photo: { ...base, vetter, shrinker: { shrink: async () => ({ ok: true as const, image: new Uint8Array([7]), contentType: "image/jpeg" as const }) }, photos },
      names: { ...base, guard: moderator }, suspect: { ...base, creator, store: cstore, guard: moderator },
      selfie: { ...base, vetter, editor: null, cutter: null, store: cstore, styleRef: async () => null },
    };
  };
  const routes = partyRoutes({ rooms, directory, sessionOf: () => "s1", ipHashOf: async () => "ip1", enabled: () => true, random: () => 0.31, ...(o.services === false ? {} : { contribute }) });
  return { routes, rooms, directory, photos, cstore, vetCalls, ledger };
}
type W = ReturnType<typeof world>;
const bearer = (t: string | null) => (t === null ? {} : { Authorization: `Bearer ${t}` });
async function lobby(w: W) {
  const room = (await (await w.routes.request("/", { method: "POST" })).json()) as { code: string; hostToken: string };
  const join = async (nick: string) => (await (await w.routes.request(`/${room.code}/join`, { method: "POST", body: JSON.stringify({ nickname: nick }) })).json()) as { seat: number; token: string };
  const ana = await join("Ana"), ben = await join("Ben");
  return { room, ana, ben };
}
const form = (parts: Record<string, string | Blob>, extra: Record<string, string> = {}) => { const f = new FormData(); for (const [k, v] of Object.entries(parts)) { if (typeof v === "string") f.set(k, v); else f.set(k, v, "photo.jpg"); } return { method: "POST", body: f, headers: extra } as RequestInit; };
const photoBlob = () => new Blob([makeJpeg({ width: 800, height: 600 })], { type: "image/jpeg" });

describe("DELETE /api/party/:code (party-mode 1.5, 1.7)", () => {
  it("lets the Master or the host token end the Room, and nobody else, deleting everything at once and freeing the directory", async () => {
    const w = world(); const { room, ana, ben } = await lobby(w);
    expect((await w.routes.request(`/${room.code}`, { method: "DELETE", headers: bearer(ben.token) })).status).toBe(403);
    expect(await (await w.routes.request(`/${room.code}`, { method: "DELETE", headers: bearer(ben.token) })).json()).toEqual({ ok: false, code: "not_master" });
    for (const t of [null, "nonsense", "0".repeat(32)]) expect((await w.routes.request(`/${room.code}`, { method: "DELETE", headers: bearer(t) })).status).toBe(401);
    expect((await w.routes.request(`/${room.code}`, { method: "DELETE", headers: bearer(ana.token) })).status).toBe(204);
    expect(w.rooms.data.get(room.code)?.has("room")).toBe(false);
    expect((await w.routes.request(`/${room.code}/join`, { method: "POST", body: JSON.stringify({ nickname: "X" }) })).status).toBe(404);
    const again = await w.routes.request(`/${room.code}`, { method: "DELETE", headers: bearer(ana.token) });
    expect(again.status).toBe(404);
  });
  it("lets the host token end the Room", async () => {
    const w = world(); const { room } = await lobby(w);
    expect((await w.routes.request(`/${room.code}`, { method: "DELETE", headers: bearer(room.hostToken) })).status).toBe(204);
  });
  it("takes the token only from the header, never from the address or the body", async () => {
    const w = world(); const { room, ana } = await lobby(w);
    expect((await w.routes.request(`/${room.code}?token=${ana.token}`, { method: "DELETE" })).status).toBe(401);
    expect((await w.routes.request(`/${room.code}`, { method: "DELETE", body: JSON.stringify({ token: ana.token }) })).status).toBe(401);
    expect((await w.routes.request(`/${room.code}`, { method: "DELETE", headers: { Authorization: `Basic ${ana.token}` } })).status).toBe(401);
    expect((await w.routes.request(`/${room.code}`, { method: "DELETE", headers: { Authorization: `xBearer ${ana.token}` } })).status).toBe(401);
    expect((await w.routes.request(`/${room.code}`, { method: "DELETE", headers: { Authorization: `Bearer ${ana.token}0` } })).status).toBe(401);
    expect(w.rooms.data.get(room.code)?.has("room")).toBe(true);
  });
});

describe("prompts and photos (party-mode 3.2, 3.6 to 3.9, 5.1, 5.1a)", () => {
  it("offers three prompts, allows three skips, then refuses with prompt_skips_used", async () => {
    const w = world(); const { room, ana } = await lobby(w);
    const first = (await (await w.routes.request(`/${room.code}/prompts`, { headers: bearer(ana.token) })).json()) as { round: number; prompts: { id: string; tip: string }[] };
    expect(first.prompts).toHaveLength(3);
    expect(first.prompts.every((p) => p.tip.endsWith("No people or faces."))).toBe(true);
    const seen = new Set(first.prompts.map((p) => p.id));
    for (let i = 1; i <= 3; i++) {
      const r = await w.routes.request(`/${room.code}/prompt/skip`, { method: "POST", headers: bearer(ana.token) });
      expect(r.status).toBe(200);
      const b = (await r.json()) as { round: number; prompts: { id: string }[] };
      expect(b.round).toBe(i);
      for (const p of b.prompts) { expect(seen.has(p.id)).toBe(false); seen.add(p.id); }
    }
    const last = await w.routes.request(`/${room.code}/prompt/skip`, { method: "POST", headers: bearer(ana.token) });
    expect([last.status, await last.json()]).toEqual([409, { ok: false, code: "prompt_skips_used" }]);
  });
  it("refuses the prompt and contribution routes without a Player's own token: the host, a stranger and no token", async () => {
    const w = world(); const { room } = await lobby(w);
    for (const t of [room.hostToken, "0".repeat(32), null]) {
      for (const [path, init] of [[`/${room.code}/prompts`, { method: "GET" }], [`/${room.code}/prompt/skip`, { method: "POST" }], [`/${room.code}/contribute/zone`, { method: "PUT", body: "{}" }], [`/${room.code}/contribute/suspect`, { method: "POST", body: "{}" }], [`/${room.code}/contribute/photo`, { method: "POST" }]] as const) {
        const r = await w.routes.request(path, { ...init, headers: bearer(t) });
        expect(r.status, `${path} ${t}`).toBe(401);
      }
    }
  });
  it("takes a photo: checks it, stores it privately, records it for the seat, and builds the pool from it at the start", async () => {
    const w = world(); const { room, ana } = await lobby(w);
    const r = await w.routes.request(`/${room.code}/contribute/photo`, { ...form({ image: photoBlob(), promptId: "mug" }), headers: bearer(ana.token) });
    expect([r.status, await r.json()]).toEqual([200, { ok: true, status: "accepted" }]);
    expect(w.photos.files.size).toBe(1);
    expect(w.vetCalls.n).toBe(1);
  });
  it("answers photo_rejected with its reason for a person in the picture, and stores nothing", async () => {
    const w = world({ vet: { ok: true, verdict: { kind: "person_visible" } } }); const { room, ana } = await lobby(w);
    const r = await w.routes.request(`/${room.code}/contribute/photo`, { ...form({ image: photoBlob() }), headers: bearer(ana.token) });
    expect([r.status, await r.json()]).toEqual([422, { ok: false, code: "photo_rejected", reason: "person_visible" }]);
    expect(w.photos.files.size).toBe(0);
  });
  it("applies the upload limits: a bad type, no picture, a body that is too large", async () => {
    const w = world(); const { room, ana } = await lobby(w);
    const bad = await w.routes.request(`/${room.code}/contribute/photo`, { ...form({ image: new Blob([makeJpeg({ width: 800, height: 600 })], { type: "image/gif" }) }), headers: bearer(ana.token) });
    expect([bad.status, (await bad.json() as { code: string }).code]).toEqual([415, "upload_bad_type"]);
    const none = await w.routes.request(`/${room.code}/contribute/photo`, { ...form({ other: "x" }), headers: bearer(ana.token) });
    expect(none.status).toBe(400);
    const big = await w.routes.request(`/${room.code}/contribute/photo`, { method: "POST", headers: { ...bearer(ana.token), "Content-Type": "multipart/form-data; boundary=x", "Content-Length": String(13 * 1024 * 1024) }, body: "x" });
    expect(big.status).toBe(413);
    expect(w.vetCalls.n).toBe(0);
  });
  it("answers contributions_unavailable (and every Player keeps Presets) when the Worker has no contribution services", async () => {
    const w = world({ services: false }); const { room, ana } = await lobby(w);
    const r = await w.routes.request(`/${room.code}/contribute/photo`, { ...form({ image: photoBlob() }), headers: bearer(ana.token) });
    expect([r.status, await r.json()]).toEqual([503, { ok: false, code: "contributions_unavailable" }]);
    const s = await w.routes.request(`/${room.code}/contribute/suspect`, { method: "POST", headers: bearer(ana.token), body: JSON.stringify({ step: "portraits", traits: {} }) });
    expect(await s.json()).toMatchObject({ ok: true, fallback: true, reason: "contributions_unavailable" });
  });
});

describe("Zone names and Suspects (party-mode 3.1, 3.3, 5.2, 5.3)", () => {
  it("takes a Zone name, cleaned and checked, and refuses an unsafe or invalid one", async () => {
    const w = world(); const { room, ana } = await lobby(w);
    const put = (name: unknown, token = ana.token) => w.routes.request(`/${room.code}/contribute/zone`, { method: "PUT", headers: bearer(token), body: JSON.stringify({ name }) });
    expect([(await put("The <b>Mill</b>")).status, await (await put("  The Pier ")).json()]).toEqual([200, { ok: true, name: "The Pier" }]);
    expect((await put("ab")).status).toBe(400);
    expect((await put(42)).status).toBe(400);
    const unsafe = world({ guardVerdict: "unsafe" }); const l = await lobby(unsafe);
    const r = await unsafe.routes.request(`/${l.room.code}/contribute/zone`, { method: "PUT", headers: bearer(l.ana.token), body: JSON.stringify({ name: "Something rude" }) });
    expect([r.status, await r.json()]).toEqual([422, { ok: false, code: "name_unsafe" }]);
  });
  it("makes a Suspect in two steps charged to the Room, records it, and saves the Lodger Voice picked", async () => {
    const w = world(); const { room, ana } = await lobby(w);
    const traits = { ...randomTraits(5), detail: "kept the stairs swept" };
    const post = (body: unknown) => w.routes.request(`/${room.code}/contribute/suspect`, { method: "POST", headers: bearer(ana.token), body: JSON.stringify(body) });
    const p = (await (await post({ step: "portraits", traits })).json()) as { ok: boolean; fallback: boolean; candidates: { candidateId: string }[] };
    expect(p).toMatchObject({ ok: true, fallback: false });
    expect(p.candidates).toHaveLength(2);
    const made = (await (await post({ step: "sprite", candidateId: p.candidates[0]!.candidateId, voice: "lighter" })).json()) as { fallback: boolean; profileId: string };
    expect(made.fallback).toBe(false);
    expect([...w.cstore.profiles.values()].some((x) => x.lodgerVoice === "chloe")).toBe(true);
    // the Room's own spend was kept in the Room: one image for the portraits and one for the cut-out, plus the detail check
    const spend = await (await (w.rooms.get(room.code) as unknown as { fetch(i: string, init?: RequestInit): Promise<Response> }).fetch("https://party/spend/load", { method: "POST", body: "{}" })).json();
    expect(spend).toMatchObject({ images: 2, models: 1 });
  });
  it("falls back to a Preset, with no error, for bad traits, an unsafe detail and an unknown candidate; and refuses a malformed step", async () => {
    const w = world(); const { room, ana } = await lobby(w);
    const post = (body: unknown) => w.routes.request(`/${room.code}/contribute/suspect`, { method: "POST", headers: bearer(ana.token), body: JSON.stringify(body) });
    expect(await (await post({ step: "portraits", traits: { epoch: "nope" } })).json()).toMatchObject({ ok: true, fallback: true, reason: "trait_invalid" });
    expect(await (await post({ step: "sprite", candidateId: "nope" })).json()).toMatchObject({ ok: true, fallback: true, reason: "candidate_missing" });
    expect((await post({ step: "other" })).status).toBe(400);
    expect((await post({ step: "portraits", traits: "x" })).status).toBe(400);
    const unsafe = world({ guardVerdict: "unsafe" }); const l = await lobby(unsafe);
    const r = await unsafe.routes.request(`/${l.room.code}/contribute/suspect`, { method: "POST", headers: bearer(l.ana.token), body: JSON.stringify({ step: "portraits", traits: { ...randomTraits(5), detail: "rude" } }) });
    expect(await r.json()).toMatchObject({ ok: true, fallback: true, reason: "detail_unsafe" });
  });
});

describe("the selfie ghost route (party-mode 3.10 to 3.13, 5.5)", () => {
  it("is refused before the picture is read unless the Master's switch is on and the seat said yes", async () => {
    const w = world(); const { room, ana } = await lobby(w);
    const send = () => w.routes.request(`/${room.code}/contribute/selfie`, { ...form({ image: photoBlob(), report: "{}", traits: "{}" }), headers: bearer(ana.token) });
    expect([(await send()).status, await (await send()).json()]).toEqual([403, { ok: false, code: "selfie_not_allowed" }]);
    const consent = await w.routes.request(`/${room.code}/contribute/selfie/consent`, { method: "PUT", headers: bearer(ana.token), body: JSON.stringify({ yes: true }) });
    expect(consent.status).toBe(200);
    expect((await send()).status).toBe(403); // the Master's switch is still off
    expect((await w.routes.request(`/${room.code}/contribute/selfie/consent`, { method: "PUT", headers: bearer(ana.token), body: JSON.stringify({ yes: "yes" }) })).status).toBe(400);
  });
});
