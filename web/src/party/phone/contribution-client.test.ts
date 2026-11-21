import { describe, expect, it } from "vitest";
import { contributionClient } from "./contribution-client";
import type { PortDeps } from "./socket-port";

const TOKEN = "0123456789abcdef0123456789abcdef";
function rig(answer: { status?: number; body?: unknown; throws?: boolean } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const deps = { fetch: async (url: string, init: RequestInit = {}) => { calls.push({ url, init }); if (answer.throws) throw new Error("offline"); return { ok: (answer.status ?? 200) < 400, status: answer.status ?? 200, json: async () => answer.body }; } } as unknown as PortDeps;
  return { api: contributionClient(deps, "K7M2", TOKEN), calls };
}
const header = (c: { init: RequestInit }, name: string): string | undefined => (c.init.headers as Record<string, string>)[name];

describe("contributionClient (party-mode 9.8)", () => {
  it("sends the token only in the Authorization header, with the Room Code in the path, and never in the body or address", async () => {
    const r = rig({ body: { ok: true, round: 0, prompts: [] } });
    await r.api.prompts();
    await r.api.skip();
    await r.api.zoneName("The blue stairs");
    for (const c of r.calls) { expect(header(c, "Authorization")).toBe(`Bearer ${TOKEN}`); expect(c.url).not.toContain(TOKEN); expect(String(c.init.body ?? "")).not.toContain(TOKEN); }
    expect(r.calls.map((c) => [c.init.method, c.url])).toEqual([["GET", "/api/party/K7M2/prompts"], ["POST", "/api/party/K7M2/prompt/skip"], ["PUT", "/api/party/K7M2/contribute/zone"]]);
  });
  it("reads the three prompts, and says unreachable for a failed call or a body it cannot read", async () => {
    const prompts = [{ id: "p1", text: "A doorway", tip: "tip", source: "take_now" }];
    expect(await rig({ body: { ok: true, round: 1, prompts } }).api.prompts()).toEqual({ ok: true, value: { round: 1, prompts } });
    expect(await rig({ throws: true }).api.prompts()).toEqual({ ok: false, code: "unreachable" });
    expect(await rig({ body: "nonsense" }).api.prompts()).toEqual({ ok: false, code: "unreachable" });
    expect(await rig({ body: { ok: true } }).api.prompts()).toEqual({ ok: false, code: "unreachable" });
  });
  it("hands back the Room's own refusal with its reason", async () => {
    expect(await rig({ status: 422, body: { ok: false, code: "photo_rejected", reason: "person_visible" } }).api.uploadPhoto(new Blob(["x"], { type: "image/png" }), "p1")).toEqual({ ok: false, code: "photo_rejected", reason: "person_visible" });
    expect(await rig({ status: 409, body: { ok: false, code: "prompt_skips_used" } }).api.skip()).toEqual({ ok: false, code: "prompt_skips_used" });
    expect(await rig({ status: 403, body: { ok: false, code: "game_started" } }).api.zoneName("x")).toEqual({ ok: false, code: "game_started" });
  });
  it("uploads a photo as a multipart image with its prompt id, and a Zone name as JSON", async () => {
    const r = rig({ body: { ok: true, status: "accepted" } });
    expect(await r.api.uploadPhoto(new Blob(["x"], { type: "image/png" }), "p3")).toEqual({ ok: true, value: { status: "accepted" } });
    const form = r.calls[0]!.init.body as FormData;
    expect(form.get("promptId")).toBe("p3");
    expect(form.get("image")).toBeInstanceOf(Blob);
    expect(header(r.calls[0]!, "Content-Type")).toBeUndefined(); // the browser adds the multipart boundary
    const z = rig({ body: { ok: true, name: "Blue stairs" } });
    expect(await z.api.zoneName("blue stairs")).toEqual({ ok: true, value: { name: "Blue stairs" } });
    expect(JSON.parse(z.calls[0]!.init.body as string)).toEqual({ name: "blue stairs" });
  });
  it("makes a Suspect in two steps: portraits, then one sprite with the voice pick; and reads a ready-made fallback", async () => {
    const a = rig({ body: { ok: true, fallback: false, candidates: [{ candidateId: "c1", imageUrl: "/x.png" }] } });
    const traits = { epoch: "victorian", temperament: "gentle", relation: "resident", palette: "moonlight", translucency: 50, accessories: [], voice: "soft" };
    expect(await a.api.suspectPortraits(traits)).toEqual({ ok: true, value: { fallback: false, candidates: [{ candidateId: "c1", imageUrl: "/x.png" }] } });
    expect(JSON.parse(a.calls[0]!.init.body as string)).toEqual({ step: "portraits", traits });
    const b = rig({ body: { ok: true, fallback: true, reason: "unsafe", profileId: "preset-3" } });
    expect(await b.api.suspectPortraits(traits)).toEqual({ ok: true, value: { fallback: true, profileId: "preset-3", reason: "unsafe" } });
    const c = rig({ body: { ok: true, fallback: false, profileId: "ghost-9" } });
    expect(await c.api.suspectSprite("c1", "lighter")).toEqual({ ok: true, value: { fallback: false, profileId: "ghost-9" } });
    expect(JSON.parse(c.calls[0]!.init.body as string)).toEqual({ step: "sprite", candidateId: "c1", voice: "lighter" });
  });
});
