import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ErrorCode } from "../errors";
import { ShellToViewerSchema } from "./events";
import { ANCHORS, GALLERY, MEMORIES, TURNSTILE_DEMO_SITE_KEY, createFakeBackend, type FakeBackend, type FakeOptions } from "./fake-api";
import type { ApiResult, PlayView } from "./api";
import { propParams } from "./prop-config";
import { isWorldId } from "./routes";

const jpeg = new Blob([new Uint8Array(100)], { type: "image/jpeg" });
const sketch = new Blob([new Uint8Array(100)], { type: "image/png" });
const at = (anchor: number) => ({ pos: [ANCHORS[anchor]!.pos[0], 0, ANCHORS[anchor]!.pos[2]] as [number, number, number], yaw: 0 });
const press = { input: { button: "look" } } as const;

const value = <T>(r: ApiResult<T>): T => {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}`);
  return r.value;
};
const code = <T>(r: ApiResult<T>): string => (r.ok ? "ok" : r.code);

/** Upload, quote, confirm: returns the new world id. */
function makeWorld(b: FakeBackend, now: number, turnstile?: string): string {
  const { imageId } = value(b.uploadPhoto(now, jpeg));
  const q = value(b.quote(now, imageId));
  return value(b.createWorld(now, { imageId, confirmToken: q.confirmToken, ...(turnstile !== undefined ? { turnstile } : {}) })).worldId;
}

describe("session, quota and Gallery", () => {
  it("starts with an empty Session, the tech.md session caps and the world switch on", () => {
    const b = createFakeBackend();
    expect(value(b.session(0))).toEqual({ ackNotice: false, flags: { worldGenEnabled: true, dayCapReached: false, totalCapReached: false, voiceEnabled: true, liveEnabled: false, partyEnabled: true } });
    expect(value(b.quota(0))).toEqual({ world: 2, image: 8, llm: 40, tts: 40, stt: 20, live: 30 });
  });

  it("remembers the acknowledged notice", () => {
    const b = createFakeBackend();
    value(b.ackNotice(0));
    expect(value(b.session(0)).ackNotice).toBe(true);
    expect(value(createFakeBackend({ ackNotice: true }).session(0)).ackNotice).toBe(true);
  });

  it("lists six Gallery worlds with usable ids, copy and thumbnails", () => {
    const list = value(createFakeBackend().gallery(0));
    expect(list).toHaveLength(6);
    expect(new Set(list.map((g) => g.id)).size).toBe(6);
    for (const g of list) {
      expect(isWorldId(g.id)).toBe(true);
      expect(g.title.length).toBeGreaterThan(0);
      expect(g.description.length).toBeGreaterThan(0);
      expect(g.thumbUrl).toMatch(/^\/demo\//);
      expect(g.attribution.length).toBeGreaterThan(0);
    }
  });

  it("hands out copies, so a screen cannot change the fixtures", () => {
    const b = createFakeBackend();
    value(b.gallery(0))[0]!.title = "changed";
    value(b.quota(0)).world = 99;
    expect(value(b.gallery(0))[0]!.title).toBe(GALLERY[0]!.title);
    expect(value(b.quota(0)).world).toBe(2);
  });
});

describe("the Zero-Quota Path", () => {
  const dead = () => createFakeBackend({
    quota: { world: 0, image: 0, llm: 0, tts: 0, stt: 0, live: 0 },
    flags: { worldGenEnabled: false, dayCapReached: true, totalCapReached: true },
  });

  it("walks a Gallery world to the end with every quota at zero and the kill switch on", () => {
    const b = dead();
    expect(value(b.gallery(0))).toHaveLength(6);
    expect(value(b.world(0, "greenhouse")).status).toBe("ready");
    const { playId, view } = value(b.playStart(0, { worldId: "greenhouse" }));
    expect(view).toMatchObject({ found: [], ended: false, ghostVisible: true });
    expect(view.anchors).toHaveLength(3);

    for (let i = 0; i < 3; i++) {
      const turn = value(b.playTurn(0, playId, { ...press, pose: at(i) }));
      expect(turn.reply.scripted).toBe(true);
      expect(turn.view.found).toHaveLength(i + 1);
      expect(turn.view.ended).toBe(i === 2);
      expect(turn.reply.text).toBe(MEMORIES[ANCHORS[i]!.id]);
    }
    expect(code(b.playTurn(0, playId, { ...press, pose: at(0) }))).toBe(ErrorCode.session_ended);
    expect(value(b.quota(0))).toEqual({ world: 0, image: 0, llm: 0, tts: 0, stt: 0, live: 0 });
  });

  it("refuses to make anything, and says why", () => {
    const b = dead();
    expect(code(b.sketchRender(0, sketch, ""))).toBe(ErrorCode.quota_image);
    const { imageId } = value(b.uploadPhoto(0, jpeg));
    const q = value(b.quote(0, imageId));
    expect(code(b.createWorld(0, { imageId, confirmToken: q.confirmToken }))).toBe(ErrorCode.world_gen_disabled);
  });
});

describe("play", () => {
  const start = () => {
    const b = createFakeBackend();
    const { playId } = value(b.playStart(0, { worldId: "attic-room" }));
    return { b, playId };
  };

  it("hints by distance when nothing is near, and never reveals a memory early", () => {
    const { b, playId } = start();
    const far = value(b.playTurn(0, playId, { ...press, pose: { pos: [30, 0, 30], yaw: 0 } }));
    const near = value(b.playTurn(0, playId, { ...press, pose: { pos: [3, 0, 6.5], yaw: 0 } }));
    const close = value(b.playTurn(0, playId, { ...press, pose: { pos: [3, 0, 4], yaw: 0 } }));
    for (const t of [far, near, close]) {
      expect(t.view.found).toEqual([]);
      for (const m of Object.values(MEMORIES)) expect(JSON.stringify(t)).not.toContain(m);
    }
    expect(new Set([far.reply.text, near.reply.text, close.reply.text]).size).toBe(3);
  });

  it("reveals a memory once, answers an echo the second time, and raises the haunt level", () => {
    const { b, playId } = start();
    const first = value(b.playTurn(0, playId, { input: { text: "listen" }, pose: at(1) }));
    expect(first.view.found).toEqual(["a2"]);
    expect(first.view.journal).toEqual([{ anchorId: "a2", text: MEMORIES.a2 }]);
    const again = value(b.playTurn(0, playId, { ...press, pose: at(1) }));
    expect(again.view.found).toEqual(["a2"]);
    expect(again.view.journal).toHaveLength(1);
    expect(again.reply.text).not.toBe(MEMORIES.a2);
    const levels = [0, 1, 2].map((i) => value(b.playTurn(0, playId, { ...press, pose: at(i) })).view.hauntLevel);
    expect(levels).toEqual([...levels].sort((x, y) => x - y));
    expect(levels[2]).toBe(1);
  });

  it("restores the same view on reload", () => {
    const { b, playId } = start();
    const turn = value(b.playTurn(0, playId, { ...press, pose: at(0) }));
    expect(value(b.playGet(0, playId))).toEqual({ worldId: "attic-room", view: turn.view });
    expect(value(b.session(0)).lastPlayId).toBe(playId);
  });

  it("treats a pose that is not finite as the origin", () => {
    const { b, playId } = start();
    const t = value(b.playTurn(0, playId, { ...press, pose: { pos: [Number.NaN, 0, Number.POSITIVE_INFINITY], yaw: 0 } }));
    expect(t.view.found).toEqual([]);
  });

  it("gives a view the Viewer accepts", () => {
    const { b, playId } = start();
    const { view } = value(b.playTurn(0, playId, { ...press, pose: at(0) }));
    const msg = ShellToViewerSchema.safeParse({ t: "apply_view", found: view.found, anchors: view.anchors, hauntLevel: view.hauntLevel, ghostVisible: view.ghostVisible });
    expect(msg.success).toBe(true);
  });

  it("does not know an unknown play session or world", () => {
    const b = createFakeBackend();
    expect(code(b.playTurn(0, "nope", { ...press, pose: at(0) }))).toBe(ErrorCode.session_not_found);
    expect(code(b.playGet(0, "nope"))).toBe(ErrorCode.session_not_found);
    expect(code(b.playStart(0, { worldId: "nope" }))).toBe(ErrorCode.world_not_found);
  });
});

describe("making a place", () => {
  it("runs a world through the stages on the injected clock", () => {
    const b = createFakeBackend({ stageMs: { queued: 1000, generating: 4000, ingesting: 2000 } });
    const id = makeWorld(b, 10_000);
    const status = (t: number) => value(b.world(t, id)).status;
    expect([10_000, 10_999, 11_000, 14_999, 15_000, 16_999, 17_000, 99_000].map(status)).toEqual([
      "queued", "queued", "generating", "generating", "ingesting", "ingesting", "ready", "ready",
    ]);
    expect(value(b.session(0)).lastWorldId).toBe(id);
    expect(value(b.quota(0)).world).toBe(1);
  });

  it("cannot play a world that is not ready yet, and plays it when it is", () => {
    const b = createFakeBackend();
    const id = makeWorld(b, 0);
    expect(code(b.playStart(1000, { worldId: id }))).toBe(ErrorCode.world_not_found);
    expect(code(b.playStart(9500, { worldId: id }))).toBe("ok");
  });

  it("uses a Confirm Token once, for its own image only", () => {
    const b = createFakeBackend();
    const { imageId } = value(b.uploadPhoto(0, jpeg));
    const other = value(b.uploadPhoto(0, jpeg)).imageId;
    const q = value(b.quote(0, imageId));
    expect(code(b.createWorld(0, { imageId: other, confirmToken: q.confirmToken }))).toBe(ErrorCode.bad_confirm);
    expect(code(b.createWorld(0, { imageId, confirmToken: "made-up" }))).toBe(ErrorCode.bad_confirm);
    expect(code(b.createWorld(0, { imageId, confirmToken: q.confirmToken }))).toBe("ok");
    expect(code(b.createWorld(0, { imageId, confirmToken: q.confirmToken }))).toBe(ErrorCode.bad_confirm);
    expect(value(b.quota(0)).world).toBe(1);
  });

  it("lets a token run out after 30 minutes", () => {
    const b = createFakeBackend();
    const { imageId } = value(b.uploadPhoto(0, jpeg));
    const q = value(b.quote(0, imageId));
    expect(code(b.createWorld(30 * 60_000 + 1, { imageId, confirmToken: q.confirmToken }))).toBe(ErrorCode.confirm_expired);
  });

  it("asks for the Turnstile result when the quote said it was needed", () => {
    const b = createFakeBackend({ needsTurnstile: true });
    const { imageId } = value(b.uploadPhoto(0, jpeg));
    const q = value(b.quote(0, imageId));
    expect(q.needsTurnstile).toBe(true);
    expect(q.turnstileSiteKey).toBe(TURNSTILE_DEMO_SITE_KEY);
    expect(code(b.createWorld(0, { imageId, confirmToken: q.confirmToken }))).toBe(ErrorCode.turnstile_failed);
    expect(code(b.createWorld(0, { imageId, confirmToken: q.confirmToken, turnstile: "cf" }))).toBe("ok");
  });

  it("gives no site key when no check is needed", () => {
    const b = createFakeBackend();
    const { imageId } = value(b.uploadPhoto(0, jpeg));
    const q = value(b.quote(0, imageId));
    expect(q.needsTurnstile).toBe(false);
    expect("turnstileSiteKey" in q).toBe(false);
  });

  it("stops at each limit with its own code", () => {
    const cases: [FakeOptions, string][] = [
      [{ flags: { worldGenEnabled: false } }, ErrorCode.world_gen_disabled],
      [{ flags: { totalCapReached: true } }, ErrorCode.quota_total],
      [{ flags: { dayCapReached: true } }, ErrorCode.quota_day],
      [{ quota: { world: 0 } }, ErrorCode.quota_session],
    ];
    for (const [options, expected] of cases) {
      const b = createFakeBackend(options);
      const { imageId } = value(b.uploadPhoto(0, jpeg));
      const q = value(b.quote(0, imageId));
      expect(code(b.createWorld(0, { imageId, confirmToken: q.confirmToken })), expected).toBe(expected);
    }
  });

  it("returns the world quota once when a world fails, with the typed reason", () => {
    const b = createFakeBackend({ worldOutcome: "failed", stageMs: { queued: 100, generating: 100, ingesting: 100 } });
    const id = makeWorld(b, 0);
    expect(value(b.quota(0)).world).toBe(1);
    expect(value(b.world(250, id))).toMatchObject({
      status: "failed", failure: { code: ErrorCode.upstream_rejected, quotaReturned: true, retryAllowed: false },
    });
    expect(value(b.world(900, id)).status).toBe("failed");
    expect(value(b.quota(0)).world).toBe(2);
  });

  it("charges two images for a sketch and gives two candidates the visitor can pick and check", () => {
    const b = createFakeBackend();
    const r = value(b.sketchRender(0, sketch, "a kitchen"));
    expect(r.candidates).toHaveLength(2);
    expect(r.quota.image).toBe(6);
    expect(new Set(r.candidates.map((c) => c.imageId)).size).toBe(2);
    const pick = r.candidates[0]!.imageId;
    expect(value(b.sketchSelect(0, pick))).toEqual({ imageId: pick });
    expect(value(b.placeBrief(0, pick))).toEqual({ brief: "A quiet room, lit from one side.", safe: true });
    expect(value(b.quote(0, pick)).imageUrl).toContain(pick);
    expect(code(b.sketchSelect(0, "nope"))).toBe(ErrorCode.upload_rejected);
    expect(code(b.quote(0, "nope"))).toBe(ErrorCode.upload_rejected);
  });

  it("checks uploads by type and size", () => {
    const b = createFakeBackend();
    expect(code(b.uploadPhoto(0, new Blob(["x"], { type: "image/gif" })))).toBe(ErrorCode.upload_bad_type);
    expect(code(b.uploadPhoto(0, new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "image/png" })))).toBe(ErrorCode.upload_too_large);
    expect(code(b.uploadPhoto(0, new Blob([new Uint8Array(10 * 1024 * 1024)], { type: "image/webp" })))).toBe("ok");
  });

  it("deletes only the visitor's own world, and forgets its plays", () => {
    const b = createFakeBackend({ stageMs: { queued: 0, generating: 0, ingesting: 0 } });
    const id = makeWorld(b, 0);
    const { playId } = value(b.playStart(0, { worldId: id }));
    expect(code(b.deleteWorld(0, "greenhouse"))).toBe(ErrorCode.world_not_found);
    expect(code(b.deleteWorld(0, "nope"))).toBe(ErrorCode.world_not_found);
    expect(code(b.deleteWorld(0, id))).toBe("ok");
    expect(code(b.world(0, id))).toBe(ErrorCode.world_not_found);
    expect(code(b.playGet(0, playId))).toBe(ErrorCode.session_not_found);
    const s = value(b.session(0));
    expect("lastWorldId" in s || "lastPlayId" in s).toBe(false);
  });
});

describe("the Preset Ghosts", () => {
  it("lists six, each with a name and a sprite on this origin, and can be made to fail once", () => {
    const b = createFakeBackend();
    const list = value(b.ghostPresets(0));
    expect(list).toHaveLength(6);
    expect(new Set(list.map((g) => g.id)).size).toBe(6);
    for (const g of list) {
      expect(g.name.length).toBeGreaterThan(0);
      expect(g.spriteUrl).toMatch(/^\/demo\/ghosts\/[a-z-]+\.svg$/);
    }
    list[0]!.name = "changed";
    expect(value(b.ghostPresets(0))[0]!.name).not.toBe("changed");
    b.failNext("ghostPresets", ErrorCode.rate_limited);
    expect(code(b.ghostPresets(0))).toBe(ErrorCode.rate_limited);
    expect(value(b.ghostPresets(0))).toHaveLength(6);
  });
});

describe("the sky", () => {
  it("searches cities, at most five, with positions already rounded", () => {
    const b = createFakeBackend();
    const all = value(b.searchPlaces(0, "li"));
    expect(all.length).toBeGreaterThan(0);
    expect(all.length).toBeLessThanOrEqual(5);
    for (const m of all) {
      expect(m.lat).toBe(Math.round(m.lat * 100) / 100);
      expect(m.lon).toBe(Math.round(m.lon * 100) / 100);
    }
    expect(value(b.searchPlaces(0, "KYOTO"))).toHaveLength(1);
    expect(value(b.searchPlaces(0, "zzzz"))).toEqual([]);
  });

  it("refuses a query that is too short or too long, and answers conditions_disabled when the feature is off", () => {
    const b = createFakeBackend();
    for (const q of ["", "a", " ", "x".repeat(61)]) expect(code(b.searchPlaces(0, q)), JSON.stringify(q)).toBe(ErrorCode.bad_place);
    expect(code(createFakeBackend({ conditionsEnabled: false }).searchPlaces(0, "lisbon"))).toBe(ErrorCode.conditions_disabled);
  });

  it("freezes the choice once at play start and carries the atmosphere in every view", () => {
    const b = createFakeBackend();
    const { playId, view } = value(b.playStart(0, { worldId: "attic-room", conditions: { hostHour: 19, place: { lat: 49.61, lon: 6.13, label: "Luxembourg" } } }));
    expect(view.atmosphere).toMatchObject({ timeOfDay: "dusk" });
    const turn = value(b.playTurn(0, playId, { ...press, pose: at(0) }));
    expect(turn.view.atmosphere).toEqual(view.atmosphere);
    expect(value(b.playGet(0, playId)).view.atmosphere).toEqual(view.atmosphere);
  });

  it("uses a Memory Day's time of day, and the normal look with no choice or with conditions off", () => {
    const b = createFakeBackend();
    const memory = value(b.playStart(0, { worldId: "attic-room", conditions: { hostHour: 12, memoryDay: { date: "1987-06-14", timeOfDay: "night" } } }));
    expect(memory.view.atmosphere?.timeOfDay).toBe("night");
    expect(value(b.playStart(0, { worldId: "attic-room" })).view.atmosphere).toBeNull();
    const off = createFakeBackend({ conditionsEnabled: false });
    expect(value(off.playStart(0, { worldId: "attic-room", conditions: { hostHour: 12 } })).view.atmosphere).toBeNull();
  });

  it("makes an Atmosphere the Viewer accepts, with no place in it", () => {
    const b = createFakeBackend();
    const { view } = value(b.playStart(0, { worldId: "attic-room", conditions: { hostHour: 3, place: { lat: 49.61, lon: 6.13 } } }));
    const msg = ShellToViewerSchema.safeParse({ t: "set_atmosphere", atmosphere: view.atmosphere });
    expect(msg.success).toBe(true);
    expect(JSON.stringify(view.atmosphere)).not.toMatch(/49\.6|6\.13|lat|lon/);
  });
});

describe("the ghost's voice", () => {
  const start = (options = {}) => {
    const b = createFakeBackend(options);
    const { playId } = value(b.playStart(0, { worldId: "attic-room" }));
    return { b, playId };
  };
  const turn = (b: FakeBackend, playId: string) => value(b.playTurn(0, playId, { ...press, pose: at(0) }));

  it("names the line to speak in the reply, and speaks it for one tts unit", () => {
    const { b, playId } = start();
    const reply = turn(b, playId).reply;
    expect(reply.voice?.lineId).toBeTruthy();
    const spoken = value(b.speak(0, { playId, lineId: reply.voice!.lineId }));
    expect(spoken.audio.size).toBeGreaterThan(0);
    expect(value(b.quota(0)).tts).toBe(39);
  });

  it("refuses a line the server does not hold, an unknown play and a spent speech meter, quietly with voice_unavailable", () => {
    const { b, playId } = start({ quota: { tts: 1 } });
    const { lineId } = turn(b, playId).reply.voice!;
    expect(code(b.speak(0, { playId, lineId: "made-up" }))).toBe(ErrorCode.voice_unavailable);
    expect(code(b.speak(0, { playId: "nope", lineId }))).toBe(ErrorCode.session_not_found);
    expect(code(b.speak(0, { playId, lineId }))).toBe("ok");
    expect(code(b.speak(0, { playId, lineId }))).toBe(ErrorCode.voice_unavailable);
  });

  it("makes no voice at all when the voice switch is off, and the game still goes on", () => {
    const { b, playId } = start({ flags: { voiceEnabled: false } });
    const reply = turn(b, playId).reply;
    expect(reply.voice).toBeUndefined();
    expect(code(b.speak(0, { playId, lineId: "line-demo-play-1-1" }))).toBe(ErrorCode.voice_unavailable);
    expect(code(b.listen(0, new Blob([new Uint8Array(10)])))).toBe(ErrorCode.voice_unavailable);
  });

  it("hears a held-button clip as a transcript for one stt unit, and refuses a clip that is empty, too long or has no meter", () => {
    const b = createFakeBackend({ quota: { stt: 1 } });
    expect(code(b.listen(0, new Blob([])))).toBe(ErrorCode.clip_not_heard);
    expect(code(b.listen(0, new Blob([new Uint8Array(400_001)])))).toBe(ErrorCode.clip_too_long);
    expect(value(b.listen(0, new Blob([new Uint8Array(1000)])))).toEqual({ transcript: "look" });
    expect(value(b.quota(0)).stt).toBe(0);
    expect(code(b.listen(0, new Blob([new Uint8Array(1000)])))).toBe(ErrorCode.voice_unavailable);
  });
});

describe("forced failures", () => {
  it("fails the next call of a method once, with the code asked for", () => {
    const b = createFakeBackend();
    b.failNext("gallery", ErrorCode.rate_limited);
    expect(code(b.gallery(0))).toBe(ErrorCode.rate_limited);
    expect(code(b.gallery(0))).toBe("ok");
    b.failNext("placeBrief", ErrorCode.unsafe_image);
    const { imageId } = value(b.uploadPhoto(0, jpeg));
    expect(code(b.placeBrief(0, imageId))).toBe(ErrorCode.unsafe_image);
  });
});

describe("determinism", () => {
  it("gives identical results for identical calls", () => {
    const run = () => {
      const b = createFakeBackend();
      const id = makeWorld(b, 5);
      return JSON.stringify([b.world(5000, id), b.world(20_000, id), b.quota(0), b.session(0), b.gallery(0)]);
    };
    expect(run()).toBe(run());
  });
});

describe("any order of calls", () => {
  type Op = (b: FakeBackend, s: { images: string[]; tokens: [string, string][]; worlds: string[]; plays: string[] }, t: number) => void;
  const ops: fc.Arbitrary<Op> = fc.oneof(
    fc.constant<Op>((b, s, t) => { const r = b.uploadPhoto(t, jpeg); if (r.ok) s.images.push(r.value.imageId); }),
    fc.constant<Op>((b, s, t) => { const r = b.sketchRender(t, sketch, ""); if (r.ok) s.images.push(...r.value.candidates.map((c) => c.imageId)); }),
    fc.constant<Op>((b, s, t) => { const i = s.images.at(-1); if (i) { const r = b.quote(t, i); if (r.ok) s.tokens.push([i, r.value.confirmToken]); } }),
    fc.constant<Op>((b, s, t) => { const k = s.tokens.at(-1); if (k) { const r = b.createWorld(t, { imageId: k[0], confirmToken: k[1] }); if (r.ok) s.worlds.push(r.value.worldId); } }),
    fc.constant<Op>((b, s, t) => { const w = s.worlds.at(-1) ?? "greenhouse"; const r = b.playStart(t, { worldId: w }); if (r.ok) s.plays.push(r.value.playId); }),
    fc.integer({ min: 0, max: 2 }).map<Op>((a) => (b, s, t) => { const p = s.plays.at(-1); if (p) b.playTurn(t, p, { ...press, pose: at(a) }); }),
    fc.constant<Op>((b, s, t) => { const w = s.worlds.pop(); if (w) b.deleteWorld(t, w); }),
    fc.constant<Op>((b, _s, t) => { b.world(t, "greenhouse"); }),
  );

  it("never throws, never goes below zero quota and keeps every play view consistent", () => {
    fc.assert(
      fc.property(fc.array(ops, { maxLength: 40 }), fc.array(fc.integer({ min: 0, max: 20_000 }), { minLength: 40, maxLength: 40 }), (steps, times) => {
        const b = createFakeBackend({ stageMs: { queued: 100, generating: 100, ingesting: 100 } });
        const s = { images: [] as string[], tokens: [] as [string, string][], worlds: [] as string[], plays: [] as string[] };
        let clock = 0;
        steps.forEach((op, i) => {
          clock += times[i] ?? 0;
          op(b, s, clock);
        });
        const q = value(b.quota(clock));
        if (Object.values(q).some((n) => n < 0)) return false;
        return s.plays.every((id) => {
          const r = b.playGet(clock, id);
          if (!r.ok) return r.code === ErrorCode.session_not_found; // its world was deleted
          const v: PlayView = r.value.view;
          return (
            new Set(v.found).size === v.found.length &&
            v.found.every((f) => ["a1", "a2", "a3"].includes(f)) &&
            v.journal.length === v.found.length &&
            v.ended === (v.found.length === 3) &&
            v.hauntLevel >= 0 && v.hauntLevel <= 1
          );
        });
      }),
      propParams(),
    );
  });
});
