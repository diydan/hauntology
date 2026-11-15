import { describe, expect, it } from "vitest";
import { ErrorCode } from "../errors";
import type { ApiResult } from "./api";
import { API_SCHEMAS, ErrorCodeSchema, OWN_PATH, OwnPathSchema, PlayViewSchema } from "./api-schemas";
import { ANCHORS, createFakeBackend } from "./fake-api";

const photo = new Blob([new Uint8Array(100)], { type: "image/jpeg" });
const value = <T>(r: ApiResult<T>): T => {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}`);
  return r.value;
};

describe("OWN_PATH", () => {
  it("accepts a path on this origin", () => {
    for (const p of ["/", "/api/uploads/img-1.png", "/api/worlds/w-1/assets/pano.jpg", "/a?b=1#c"]) {
      expect(OWN_PATH.test(p), p).toBe(true);
    }
  });

  it("refuses anything that names another origin or is not a path", () => {
    const bad = [
      "", "api/x", "//cdn.example.com/x.png", "https://cdn.example.com/x.png", "http://a/b", "data:image/png;base64,AAAA",
      "javascript:alert(1)", "/\\evil.com", "/ a", "/a b", "\\\\host\\share", "ftp://x", " /x", "/x\n/y",
    ];
    for (const p of bad) expect(OwnPathSchema.safeParse(p).success, JSON.stringify(p)).toBe(false);
    expect(OwnPathSchema.safeParse("/" + "a".repeat(600)).success).toBe(false);
  });
});

describe("ErrorCodeSchema", () => {
  it("accepts every code and nothing else", () => {
    for (const c of Object.values(ErrorCode)) expect(ErrorCodeSchema.safeParse(c).success).toBe(true);
    for (const c of ["", "toString", "__proto__", "QUOTA_DAY", "quota_day ", 7, null, undefined]) expect(ErrorCodeSchema.safeParse(c).success).toBe(false);
  });
});

describe("the demo FakeApi and the real client share the same shapes", () => {
  it("every answer of the fake backend fits its schema", () => {
    const b = createFakeBackend();
    const t = 1_000;
    const seen = new Set<string>();
    const check = <K extends keyof typeof API_SCHEMAS>(name: K, result: ApiResult<unknown>) => {
      const parsed = API_SCHEMAS[name].safeParse(value(result));
      expect(parsed.success, `${name}: ${parsed.success ? "" : parsed.error.message}`).toBe(true);
      seen.add(name);
    };

    check("session", b.session(t));
    check("quota", b.quota(t));
    check("gallery", b.gallery(t));
    const up = value(b.uploadPhoto(t, photo));
    check("uploadPhoto", { ok: true, value: up });
    const render = value(b.sketchRender(t, new Blob([new Uint8Array(100)], { type: "image/png" }), "a stair"));
    check("sketchRender", { ok: true, value: render });
    check("sketchSelect", b.sketchSelect(t, render.candidates[0]!.imageId));
    check("placeBrief", b.placeBrief(t, up.imageId));
    const q = value(b.quote(t, up.imageId));
    check("quote", { ok: true, value: q });
    const created = value(b.createWorld(t, { imageId: up.imageId, confirmToken: q.confirmToken }));
    check("createWorld", { ok: true, value: created });
    check("world", b.world(t + 60_000, created.worldId));
    check("searchPlaces", b.searchPlaces(t, "lis"));
    check("ghostPresets", b.ghostPresets(t));
    check("ackNotice", b.ackNotice(t));
    const play = value(b.playStart(t, { worldId: "attic-room" }));
    check("playStart", { ok: true, value: play });
    const near = { pos: [ANCHORS[0]!.pos[0], 0, ANCHORS[0]!.pos[2]] as [number, number, number], yaw: 0 };
    check("playTurn", b.playTurn(t, play.playId, { input: { button: "look" }, pose: near }));
    check("playGet", b.playGet(t, play.playId));
    check("shareWorld", b.shareWorld(t + 60_000, created.worldId, true));
    check("world", b.world(t + 60_000, created.worldId)); // now with `shared: true`
    check("deleteWorld", b.deleteWorld(t, created.worldId));
    // `listen` is the one JSON route the backend answers only with a heard clip; `speak` returns audio.
    const heard = b.listen(t, new Blob([new Uint8Array(100)], { type: "audio/webm" }));
    if (heard.ok) check("listen", heard);
    else seen.add("listen");

    expect([...seen].sort()).toEqual(Object.keys(API_SCHEMAS).sort());
  });

  it("a play view with a hidden field, a fourth anchor or a precise place is refused or stripped", () => {
    const view = value(createFakeBackend().playStart(1, { worldId: "attic-room" })).view;
    expect(PlayViewSchema.safeParse({ ...view, anchors: [...view.anchors, ...view.anchors] }).success).toBe(false);
    const stripped = PlayViewSchema.parse({ ...view, seed: "hidden" });
    expect("seed" in stripped).toBe(false);
    const atmosphere = { timeOfDay: "night", weather: "fog", tempBand: "cold", windBand: "calm", moon: "full moon" };
    expect(PlayViewSchema.safeParse({ ...view, atmosphere }).success).toBe(true);
    expect(PlayViewSchema.safeParse({ ...view, atmosphere: { ...atmosphere, place: { lat: 1.23, lon: 4.56 } } }).success).toBe(false);
  });
});

describe("the share link's shapes", () => {
  it("shareWorld answers only a yes or no, and a status carries `shared` only as a yes or no", () => {
    expect(API_SCHEMAS.shareWorld.safeParse({ shared: true }).success).toBe(true);
    expect(API_SCHEMAS.shareWorld.safeParse({ shared: false, ok: true }).success).toBe(true);
    for (const bad of [{}, { shared: "yes" }, { shared: 1 }, { shared: null }, null, "true"]) expect(API_SCHEMAS.shareWorld.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    expect(API_SCHEMAS.world.safeParse({ id: "w", status: "ready", shared: true }).success).toBe(true);
    expect(API_SCHEMAS.world.safeParse({ id: "w", status: "ready" }).success).toBe(true);
    expect(API_SCHEMAS.world.safeParse({ id: "w", status: "ready", shared: "yes" }).success).toBe(false);
    expect(API_SCHEMAS.world.parse({ id: "w", status: "ready", shared: true, ownerSid: "sid-1" })).toEqual({ id: "w", status: "ready", shared: true });
  });
});
