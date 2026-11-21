import { ENHANCE_VIEWS_MAX, singlePrompt } from "@hauntology/shared/world/enhance";
import { makeJpeg, makePng } from "@hauntology/shared/world/upload-kit";
import type { SpendGuard } from "@hauntology/shared/world/spend";
import { describe, expect, it } from "vitest";
import { NoTicketError } from "../guarded/ticket";
import { outpaintPrompt, outpaintView, type Outpainter } from "../guarded/workersai/outpaint";
import { enhancePrompt, type EnhanceDeps } from "./enhance";
import { DEFAULT_CAPS, MemorySpendGuard } from "./fakes";
import type { RenderAnswer } from "./ports";

const PHOTO = makeJpeg({ width: 1200, height: 900 });
const original = { image: PHOTO, contentType: "image/jpeg" };
const GOOD = makePng({ width: 1200, height: 900 });

/** An outpainter that answers from a function of the call number (1-based) and counts calls. */
class FakeOutpainter implements Outpainter {
  calls = 0;
  readonly seen: Parameters<Outpainter["extend"]>[0][] = [];
  constructor(private readonly answer: (n: number) => RenderAnswer | "throw" = () => ({ ok: true, image: GOOD })) {}
  async extend(req: Parameters<Outpainter["extend"]>[0]): Promise<RenderAnswer> {
    this.calls += 1;
    this.seen.push(req);
    const a = this.answer(this.calls);
    if (a === "throw") throw new Error("model down");
    return a;
  }
}

/** Units of the `image` meter a Session has used, from what is left of its cap. */
const usedImages = async (g: SpendGuard): Promise<number> => DEFAULT_CAPS.image.session - (await g.remaining("s1", "ip1")).image;

function deps(over: Partial<EnhanceDeps> & { outpainter: Outpainter }): EnhanceDeps & { guard: MemorySpendGuard } {
  const guard = (over.guard as MemorySpendGuard | undefined) ?? new MemorySpendGuard();
  return { enabled: true, views: 2, sessionId: "s1", ipHash: "ip1", now: () => Date.now(), seed: 100, ...over, guard };
}

describe("Enhance: the switch (Requirement 11.2)", () => {
  it("is off when not enabled: no reservation, no model call, the original alone", async () => {
    const out = new FakeOutpainter();
    const d = deps({ enabled: false, outpainter: out });
    const r = await enhancePrompt(d, original);
    expect(r).toEqual({ prompt: singlePrompt(PHOTO, "image/jpeg"), enhanced: false, fallback: "disabled", unitsUsed: 0 });
    expect(out.calls).toBe(0);
    expect(d.guard.reserveCalls).toEqual([]);
  });
  it("is off for a value that is not exactly true", async () => {
    const out = new FakeOutpainter();
    const r = await enhancePrompt(deps({ enabled: "yes" as never, outpainter: out }), original);
    expect(r.enhanced).toBe(false);
    expect(out.calls).toBe(0);
  });
});

describe("Enhance: the main path (Requirement 11.1)", () => {
  it("asks for each planned view in turn, with its own seed, and builds one multi-image prompt in azimuth order", async () => {
    const out = new FakeOutpainter();
    const d = deps({ outpainter: out, views: 3 });
    const r = await enhancePrompt(d, original);
    expect(r.enhanced).toBe(true);
    expect(r.unitsUsed).toBe(3);
    expect(out.calls).toBe(3);
    expect(out.seen.map((s) => s.seed)).toEqual([100, 101, 102]);
    expect(out.seen.every((s) => s.photo === PHOTO && s.width === 1200 && s.height === 900)).toBe(true);
    expect(r.prompt.kind).toBe("multi-image");
    if (r.prompt.kind !== "multi-image") return;
    const az = r.prompt.images.map((i) => i.azimuthDeg);
    expect(az).toEqual([...az].sort((a, b) => a - b));
    expect(new Set(az).size).toBe(4);
    expect(az).toContain(0);
    expect(r.prompt.images.find((i) => i.azimuthDeg === 0)!.image).toBe(PHOTO);
    expect(await usedImages(d.guard)).toBe(3);
  });
});

describe("Property 14 (second half): any failure at any step gives the single-image prompt with the original photo (Requirement 11.3)", () => {
  // Feature: world-pipeline, Property 14: Enhance plans overlap and fall back
  // Validates: Requirements 11.3
  const KINDS = ["quota", "refused", "throws", "bad_picture", "not_an_image", "guard_throws", "reserve_throws"] as const;
  for (const kind of KINDS) {
    for (let at = 1; at <= ENHANCE_VIEWS_MAX; at++) {
      it(`${kind} at view ${at} of ${ENHANCE_VIEWS_MAX}`, async () => {
        const out = new FakeOutpainter((n) => {
          if (n !== at) return { ok: true, image: GOOD };
          if (kind === "refused") return { ok: false, kind: "failed" };
          if (kind === "throws") return "throw";
          if (kind === "bad_picture") return { ok: true, image: new Uint8Array([0, 1, 2, 3]) };
          if (kind === "not_an_image") return { ok: true, image: new Uint8Array(0) };
          return { ok: true, image: GOOD };
        });
        const real = new MemorySpendGuard();
        let reserves = 0;
        const guard: SpendGuard = {
          reserve: async (req) => {
            reserves += 1;
            if (reserves === at && kind === "quota") return { ok: false, reason: "session" };
            if (reserves === at && kind === "reserve_throws") throw new Error("guard down");
            return real.reserve(req);
          },
          commit: async (t) => { if (kind === "guard_throws") throw new Error("commit down"); await real.commit(t); },
          release: async (t) => { if (kind === "guard_throws") throw new Error("release down"); await real.release(t); },
          remaining: (s, i) => real.remaining(s, i),
        };
        const logs: unknown[] = [];
        const r = await enhancePrompt({ ...deps({ outpainter: out, views: ENHANCE_VIEWS_MAX, guard: real }), guard, log: (e, f) => { logs.push([e, f]); } }, original);
        if (kind === "guard_throws") {
          // A commit that fails does not stop the work: every view was made, so this is the main path with a noisy guard.
          expect(r.enhanced).toBe(true);
          return;
        }
        expect(r.enhanced).toBe(false);
        expect(r.prompt).toEqual(singlePrompt(PHOTO, "image/jpeg"));
        expect(r.prompt.kind === "single" && r.prompt.image).toBe(PHOTO);
        expect(out.calls).toBeLessThanOrEqual(at); // nothing is asked after the step that failed
        expect(logs).toHaveLength(1);
        expect(JSON.stringify(logs)).not.toMatch(/1200|900|image\/|ip1|s1/);
        // Units: a view that was refused or threw gives its unit back; one that answered (even badly) keeps it.
        const expectedUsed = kind === "quota" || kind === "reserve_throws" ? at - 1 : kind === "refused" || kind === "throws" ? at - 1 : at;
        expect(r.unitsUsed).toBe(expectedUsed);
        expect(await usedImages(real)).toBe(expectedUsed);
      });
    }
  }

  it("falls back for a photo that is not a picture, or whose size the plan refuses, or when the Session has no image units, without a call", async () => {
    const out = new FakeOutpainter();
    expect((await enhancePrompt(deps({ outpainter: out }), { image: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" })).fallback).toBe("bad_photo");
    expect((await enhancePrompt(deps({ outpainter: out }), { image: makeJpeg({ width: 100, height: 100 }), contentType: "image/jpeg" })).fallback).toBe("bad_size");
    const g = new MemorySpendGuard({ ...DEFAULT_CAPS, image: { session: 0, day: 150 } });
    const r = await enhancePrompt(deps({ outpainter: out, guard: g }), original);
    expect(r).toMatchObject({ enhanced: false, fallback: "quota", unitsUsed: 0 });
    expect(out.calls).toBe(0);
  });

  it("stops asking once the Session's image quota is used up, keeps no half set, and uses the original alone", async () => {
    const out = new FakeOutpainter();
    const g = new MemorySpendGuard({ ...DEFAULT_CAPS, image: { session: 2, day: 150 } });
    const r = await enhancePrompt(deps({ outpainter: out, guard: g, views: 4 }), original);
    expect(r).toEqual({ prompt: singlePrompt(PHOTO, "image/jpeg"), enhanced: false, fallback: "quota", unitsUsed: 2 });
    expect(out.calls).toBe(2);
    expect((await g.remaining("s1", "ip1")).image).toBe(0);
  });
});

describe("the guarded door", () => {
  const view = { azimuthDeg: 35, shift: 0.5, overlap: 0.5, fill: { side: "right" as const, fraction: 0.5 } };
  const req = { photo: PHOTO, contentType: "image/jpeg", view, seed: 1, width: 1200, height: 900 };
  it("refuses a call with no Ticket, or a Ticket of another meter, before the model is reached", () => {
    const out = new FakeOutpainter();
    expect(() => outpaintView(out, null as never, req)).toThrow(NoTicketError);
    expect(() => outpaintView(out, { id: "t", meter: "world", sessionId: "s", issuedAt: 0 }, req)).toThrow(NoTicketError);
    expect(out.calls).toBe(0);
    void outpaintView(out, { id: "t", meter: "image", sessionId: "s", issuedAt: 0 }, req);
    expect(out.calls).toBe(1);
  });
  it("words the request without any living artist or title, and says which edge and which way", () => {
    const p = outpaintPrompt(view);
    expect(p).toMatch(/right edge/);
    expect(p).toMatch(/to the right/);
    expect(p).toMatch(/No people/);
    expect(outpaintPrompt({ ...view, azimuthDeg: -35, shift: -0.5, fill: { side: "left", fraction: 0.5 } })).toMatch(/left edge.*to the left/);
  });
});
