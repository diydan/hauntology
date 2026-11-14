import { describe, expect, it } from "vitest";
import { guardRoute, isWorldId, pathFor, resolveRoute } from "./routes";
import { SCREEN_IDS, type FlowState, type Route } from "./types";

const W = "w-AbCdEfGhIjKlMnOpQrSt12";
const OTHER = "other_world_0123456789abc";

describe("resolveRoute", () => {
  it("maps the route table", () => {
    expect(resolveRoute("/")).toEqual({ screen: "home" });
    expect(resolveRoute("/gallery")).toEqual({ screen: "gallery" });
    expect(resolveRoute("/create")).toEqual({ screen: "create" });
    expect(resolveRoute("/confirm")).toEqual({ screen: "confirm" });
    expect(resolveRoute("/expired")).toEqual({ screen: "expired" });
    expect(resolveRoute(`/haunt/${W}`)).toEqual({ screen: "haunt", worldId: W });
    expect(resolveRoute(`/play/${W}`)).toEqual({ screen: "play", worldId: W });
    expect(resolveRoute(`/end/${W}`)).toEqual({ screen: "end", worldId: W });
  });

  it("ignores a query string and a fragment, and allows one trailing slash", () => {
    expect(resolveRoute("/gallery?demo=1")).toEqual({ screen: "gallery" });
    expect(resolveRoute("/?debug=1")).toEqual({ screen: "home" });
    expect(resolveRoute("/#top")).toEqual({ screen: "home" });
    expect(resolveRoute("/gallery/")).toEqual({ screen: "gallery" });
    expect(resolveRoute(`/play/${W}/?x=1#y`)).toEqual({ screen: "play", worldId: W });
  });

  it("gives not_found for everything else", () => {
    const bad = [
      "", "gallery", "gallery/", "//", "///", "/gallery//", "//gallery", "/gallery/x", "/Gallery", "/GALLERY",
      "/haunt", "/haunt/", `/haunt/${W}/extra`, `/haunt//${W}`, "/play/..", "/play/.", "/play/a%20b", "/play/%2e%2e",
      "/play/a.b", "/play/ä", `/play/${"a".repeat(65)}`, "/constructor", "/__proto__", "/toString",
      "/hasOwnProperty", "/api/quota", "/index.html", "/not-found", "/gallery%20", "/ gallery", "http://x/gallery",
      "\n/gallery", "/gallery\n", "/gallery\n/",
    ];
    for (const p of bad) expect(resolveRoute(p), JSON.stringify(p)).toEqual({ screen: "not_found" });
  });

  it("returns a fresh object each time", () => {
    const a = resolveRoute("/nope");
    a.worldId = "mutated";
    expect(resolveRoute("/nope")).toEqual({ screen: "not_found" });
  });
});

describe("pathFor", () => {
  it("is the canonical path of each route and round-trips", () => {
    const routes: Route[] = [
      ...SCREEN_IDS.filter((s) => s !== "haunt" && s !== "play" && s !== "end").map((screen): Route => ({ screen })),
      { screen: "haunt", worldId: W }, { screen: "play", worldId: W }, { screen: "end", worldId: W },
    ];
    for (const r of routes) expect(resolveRoute(pathFor(r))).toEqual(r);
    expect(pathFor({ screen: "play", worldId: W })).toBe(`/play/${W}`);
    expect(pathFor({ screen: "home" })).toBe("/");
  });

  it("gives the not-found path when a world route has no valid world id", () => {
    for (const worldId of [undefined, "", "a b", "a/b", "..", "x".repeat(65)]) {
      for (const screen of ["haunt", "play", "end"] as const) {
        const route: Route = worldId === undefined ? { screen } : { screen, worldId };
        expect(pathFor(route)).toBe("/not-found");
        expect(resolveRoute(pathFor(route))).toEqual({ screen: "not_found" });
      }
    }
  });
});

describe("isWorldId", () => {
  it("accepts 1 to 64 URL-safe characters only", () => {
    expect(isWorldId("a")).toBe(true);
    expect(isWorldId("kitchen-1987_b")).toBe(true);
    expect(isWorldId("a".repeat(64))).toBe(true);
    for (const s of ["", "a".repeat(65), "a b", "a/b", "a.b", "a%20", "ä", "a\n", "\na"]) expect(isWorldId(s), JSON.stringify(s)).toBe(false);
  });
});

const flow = (over: Partial<FlowState> = {}): FlowState => ({ ghostReady: false, noticeAcked: false, playEnded: false, ...over });
const GALLERY: Route = { screen: "gallery" };

describe("guardRoute", () => {
  it("always allows home, gallery, create, not_found and expired", () => {
    for (const screen of ["home", "gallery", "create", "not_found", "expired"] as const) {
      expect(guardRoute({ screen }, flow())).toEqual({ allow: true });
    }
  });

  it("sends confirm without a picked image to create", () => {
    expect(guardRoute({ screen: "confirm" }, flow())).toEqual({ allow: false, redirect: { screen: "create" } });
    expect(guardRoute({ screen: "confirm" }, flow({ pickedImageId: "img12345" }))).toEqual({ allow: true });
  });

  it("sends haunt, play and end for an unknown world to the gallery", () => {
    for (const screen of ["haunt", "play", "end"] as const) {
      const all = flow({ ghostReady: true, playEnded: true });
      expect(guardRoute({ screen, worldId: W }, all)).toEqual({ allow: false, redirect: GALLERY });
      expect(guardRoute({ screen, worldId: W }, { ...all, worldId: OTHER })).toEqual({ allow: false, redirect: GALLERY });
      expect(guardRoute({ screen }, { ...all, worldId: W })).toEqual({ allow: false, redirect: GALLERY });
    }
  });

  it("lets haunt through for the known world", () => {
    expect(guardRoute({ screen: "haunt", worldId: W }, flow({ worldId: W }))).toEqual({ allow: true });
  });

  it("sends play without a ghost to haunt for the same world", () => {
    expect(guardRoute({ screen: "play", worldId: W }, flow({ worldId: W }))).toEqual({
      allow: false,
      redirect: { screen: "haunt", worldId: W },
    });
    expect(guardRoute({ screen: "play", worldId: W }, flow({ worldId: W, ghostReady: true }))).toEqual({ allow: true });
  });

  it("sends end before the play has ended to play, or to where play would send the visitor", () => {
    const end: Route = { screen: "end", worldId: W };
    expect(guardRoute(end, flow({ worldId: W, ghostReady: true }))).toEqual({
      allow: false,
      redirect: { screen: "play", worldId: W },
    });
    expect(guardRoute(end, flow({ worldId: W }))).toEqual({ allow: false, redirect: { screen: "haunt", worldId: W } });
    expect(guardRoute(end, flow())).toEqual({ allow: false, redirect: GALLERY });
    expect(guardRoute(end, flow({ worldId: W, ghostReady: true, playEnded: true }))).toEqual({ allow: true });
  });

  it("never redirects to a route that redirects again, for every small flow state and route", () => {
    const routes: Route[] = [
      { screen: "home" }, { screen: "gallery" }, { screen: "create" }, { screen: "confirm" },
      { screen: "not_found" }, { screen: "expired" },
      ...(["haunt", "play", "end"] as const).flatMap((screen): Route[] => [
        { screen }, { screen, worldId: W }, { screen, worldId: OTHER },
      ]),
    ];
    let redirects = 0;
    for (const picked of [undefined, "img12345"]) {
      for (const worldId of [undefined, W, OTHER]) {
        for (const ghostReady of [false, true]) {
          for (const noticeAcked of [false, true]) {
            for (const playEnded of [false, true]) {
              const f: FlowState = {
                ghostReady, noticeAcked, playEnded,
                ...(picked !== undefined ? { pickedImageId: picked } : {}),
                ...(worldId !== undefined ? { worldId } : {}),
              };
              for (const r of routes) {
                const g = guardRoute(r, f);
                if (g.allow) continue;
                redirects++;
                expect(guardRoute(g.redirect, f), JSON.stringify({ r, f })).toEqual({ allow: true });
              }
            }
          }
        }
      }
    }
    expect(redirects).toBeGreaterThan(100);
  });

  it("allows play only with the known world and a ready ghost, and end only after the play ended", () => {
    for (const worldId of [undefined, W, OTHER]) {
      for (const ghostReady of [false, true]) {
        for (const playEnded of [false, true]) {
          const f = flow({ ghostReady, playEnded, ...(worldId !== undefined ? { worldId } : {}) });
          expect(guardRoute({ screen: "play", worldId: W }, f).allow).toBe(worldId === W && ghostReady);
          expect(guardRoute({ screen: "end", worldId: W }, f).allow).toBe(worldId === W && playEnded);
        }
      }
    }
  });
});
