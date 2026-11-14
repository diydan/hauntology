import { SESSION_TTL_SEC, verifySession } from "@hauntology/shared/session-cookie";
import { describe, expect, it } from "vitest";
import { createApp, type AppOptions } from "../app";
import type { Bindings } from "./env";
import { flagsFrom } from "./flags";
import { SESSION_COOKIE, forgetWorld, requireSession, setLastPlay, setLastWorld } from "./session";

const SECRET = "test-secret-0123456789abcdef-test";
const ORIGIN = "http://app.test";
const NOW_MS = 1_800_000_000_000;
const ENV: Bindings = { HMAC_SECRET: SECRET };

function setup(options: AppOptions = {}) {
  const clock = { ms: NOW_MS };
  let n = 0;
  const app = createApp({ now: () => clock.ms, randomBytes: (len) => Uint8Array.from({ length: len }, (_, i) => (++n * 7 + i) % 256), ...options });
  // Test-only routes that use the helpers the real routes will call.
  app.post("/api/test/world", (c) => { setLastWorld(c, "w-1"); setLastPlay(c, "p-1"); return c.body(null, 204); });
  app.post("/api/test/forget", (c) => { forgetWorld(c, "w-1"); return c.body(null, 204); });
  app.get("/api/test/needs-session", requireSession(), (c) => c.json({ ok: true }));
  const call = (path: string, init: RequestInit & { cookie?: string; origin?: string | null } = {}, env: Bindings = ENV, base = ORIGIN) => {
    const { cookie, origin, ...rest } = init;
    const headers = new Headers(rest.headers);
    if (cookie !== undefined) headers.set("Cookie", cookie);
    const method = rest.method ?? "GET";
    if (origin === undefined && method !== "GET") headers.set("Origin", base);
    else if (origin) headers.set("Origin", origin);
    return app.request(`${base}${path}`, { ...rest, headers }, env);
  };
  return { app, call, clock };
}

const setCookie = (res: Response): string | null => res.headers.get("Set-Cookie");
const cookiePair = (res: Response): string => (setCookie(res) as string).split(";")[0] as string;
const cookieValue = (res: Response): string => cookiePair(res).slice(SESSION_COOKIE.length + 1);
const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

describe("GET /api/session", () => {
  it("gives a new Session an empty record and a cookie that is HttpOnly, SameSite=Lax and a week long", async () => {
    const { call } = setup();
    const res = await call("/api/session");
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ackNotice: false, flags: { worldGenEnabled: true, dayCapReached: false, totalCapReached: false, voiceEnabled: true, liveEnabled: false, partyEnabled: true } });
    const sc = setCookie(res) as string;
    expect(sc).toContain(`${SESSION_COOKIE}=`);
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/SameSite=Lax/i);
    expect(sc).toMatch(/Path=\//);
    expect(sc).toContain(`Max-Age=${SESSION_TTL_SEC}`);
    expect(sc).not.toMatch(/Secure/i);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("marks the cookie Secure on https", async () => {
    const { call } = setup();
    const res = await call("/api/session", {}, ENV, "https://app.test");
    expect(setCookie(res)).toMatch(/Secure/i);
  });

  it("keeps the same Session, and writes no new cookie, on the next request", async () => {
    const { call } = setup();
    const first = await call("/api/session");
    const second = await call("/api/session", { cookie: cookiePair(first) });
    expect(second.status).toBe(200);
    expect(setCookie(second)).toBeNull();
  });

  it("never puts the session id or the secret in the body", async () => {
    const { call } = setup();
    const first = await call("/api/session");
    const state = await verifySession(cookieValue(first), SECRET, NOW_MS / 1000);
    const body = JSON.stringify(await json(await call("/api/session", { cookie: cookiePair(first) })));
    expect(body).not.toContain(state!.sid);
    expect(body).not.toContain(SECRET);
  });

  it("gives two visitors two different Sessions", async () => {
    const { call } = setup();
    const a = await verifySession(cookieValue(await call("/api/session")), SECRET, NOW_MS / 1000);
    const b = await verifySession(cookieValue(await call("/api/session")), SECRET, NOW_MS / 1000);
    expect(a!.sid).not.toBe(b!.sid);
  });
});

describe("POST /api/session/ack-notice", () => {
  it("remembers the acknowledged notice in the cookie", async () => {
    const { call } = setup();
    const start = await call("/api/session");
    const ack = await call("/api/session/ack-notice", { method: "POST", cookie: cookiePair(start) });
    expect(ack.status).toBe(204);
    expect(await ack.text()).toBe("");
    const after = await call("/api/session", { cookie: cookiePair(ack) });
    expect((await json(after)).ackNotice).toBe(true);
  });

  it("works for a visitor with no cookie yet, and gives them a Session", async () => {
    const { call } = setup();
    const ack = await call("/api/session/ack-notice", { method: "POST" });
    expect(ack.status).toBe(204);
    expect((await json(await call("/api/session", { cookie: cookiePair(ack) }))).ackNotice).toBe(true);
  });
});

describe("origin check", () => {
  it("refuses a state-changing request with no, null or another Origin, and sets no cookie", async () => {
    const { call } = setup();
    for (const origin of [null, "null", "http://evil.test", "http://app.test/", "https://app.test", "http://app.test:8080"]) {
      const res = await call("/api/session/ack-notice", { method: "POST", origin });
      expect(res.status, String(origin)).toBe(403);
      expect(await json(res)).toEqual({ ok: false, code: "bad_origin" });
      expect(setCookie(res), String(origin)).toBeNull();
    }
  });

  it("does not check GET, HEAD or OPTIONS", async () => {
    const { call } = setup();
    expect((await call("/api/session", { origin: "http://evil.test" })).status).toBe(200);
    expect((await call("/api/session", { method: "HEAD" })).status).toBe(200);
    expect((await call("/api/session", { method: "OPTIONS" })).status).not.toBe(403);
  });

  it("allows a listed development origin and nothing near it", async () => {
    const { call } = setup();
    const env = { ...ENV, ALLOWED_ORIGINS: "http://localhost:5173, http://127.0.0.1:5173" };
    expect((await call("/api/session/ack-notice", { method: "POST", origin: "http://localhost:5173" }, env)).status).toBe(204);
    expect((await call("/api/session/ack-notice", { method: "POST", origin: "http://localhost:5174" }, env)).status).toBe(403);
  });
});

describe("the Session cookie", () => {
  it("carries the last world and play ids between requests, and forgets them on delete", async () => {
    const { call } = setup();
    const start = await call("/api/session");
    const set = await call("/api/test/world", { method: "POST", cookie: cookiePair(start) });
    expect(await json(await call("/api/session", { cookie: cookiePair(set) }))).toMatchObject({ lastWorldId: "w-1", lastPlayId: "p-1" });
    const gone = await call("/api/test/forget", { method: "POST", cookie: cookiePair(set) });
    const record = await json(await call("/api/session", { cookie: cookiePair(gone) }));
    expect("lastWorldId" in record || "lastPlayId" in record).toBe(false);
  });

  it("treats a forged, re-signed or edited cookie as a new Session", async () => {
    const { call } = setup();
    const set = await call("/api/test/world", { method: "POST" });
    const value = cookieValue(set);
    const [v, payload, mac] = value.split(".") as [string, string, string];
    const edited = `${v}.${payload}.${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`;
    for (const bad of [edited, `${v}.${payload}`, "garbage", "v1.e30.AAAA"]) {
      const res = await call("/api/session", { cookie: `${SESSION_COOKIE}=${bad}` });
      expect(res.status).toBe(200);
      expect(setCookie(res), bad).not.toBeNull(); // a new Session was issued
      const record = await json(res);
      expect("lastWorldId" in record, bad).toBe(false);
    }
  });

  it("treats a cookie signed with another secret as a new Session", async () => {
    const a = setup();
    const set = await a.call("/api/test/world", { method: "POST" });
    const other = setup();
    const res = await other.call("/api/session", { cookie: cookiePair(set) }, { HMAC_SECRET: "another-secret-0123456789abcdef" });
    expect("lastWorldId" in (await json(res))).toBe(false);
  });

  it("treats an expired cookie as a new Session", async () => {
    const { call, clock } = setup();
    const set = await call("/api/test/world", { method: "POST" });
    clock.ms += SESSION_TTL_SEC * 1000 + 1000;
    const res = await call("/api/session", { cookie: cookiePair(set) });
    expect("lastWorldId" in (await json(res))).toBe(false);
    expect(setCookie(res)).not.toBeNull();
  });

  it("is renewed once it is past half its life, and not before", async () => {
    const { call, clock } = setup();
    const set = await call("/api/test/world", { method: "POST" });
    clock.ms += (SESSION_TTL_SEC / 2 - 60) * 1000;
    expect(setCookie(await call("/api/session", { cookie: cookiePair(set) }))).toBeNull();
    clock.ms += 120 * 1000;
    const renewed = await call("/api/session", { cookie: cookiePair(set) });
    expect(setCookie(renewed)).not.toBeNull();
    const state = await verifySession(cookieValue(renewed), SECRET, clock.ms / 1000);
    expect(state?.exp).toBe(clock.ms / 1000 + SESSION_TTL_SEC);
    expect(state?.lastWorldId).toBe("w-1");
  });

  it("fails with a server error, and no cookie, when the secret is missing or short", async () => {
    const { call } = setup();
    for (const env of [{}, { HMAC_SECRET: "short" }]) {
      const res = await call("/api/session", {}, env);
      expect(res.status).toBe(500);
      expect(setCookie(res)).toBeNull();
    }
  });
});

describe("requireSession", () => {
  it("answers session_expired to a request with no valid Session, and lets a valid one through", async () => {
    const { call } = setup();
    const none = await call("/api/test/needs-session");
    expect(none.status).toBe(401);
    expect(await json(none)).toEqual({ ok: false, code: "session_expired" });
    const start = await call("/api/session");
    expect((await call("/api/test/needs-session", { cookie: cookiePair(start) })).status).toBe(200);
  });
});

describe("flags", () => {
  it("reports the world switch from WORLD_GEN_ENABLED", async () => {
    const { call } = setup();
    for (const [value, expected] of [["false", false], ["FALSE", false], ["0", false], [" off ", false], ["true", true], ["1", true], ["", true]] as const) {
      const res = await call("/api/session", {}, { ...ENV, WORLD_GEN_ENABLED: value });
      expect(((await json(res)).flags as { worldGenEnabled: boolean }).worldGenEnabled, JSON.stringify(value)).toBe(expected);
    }
  });

  it("reports what SpendGuard says once it is wired in", async () => {
    const { call } = setup({ spend: () => ({ dayCapReached: true, totalCapReached: false, killed: true }) });
    expect((await json(await call("/api/session"))).flags).toEqual({ worldGenEnabled: false, dayCapReached: true, totalCapReached: false, voiceEnabled: true, liveEnabled: false, partyEnabled: true });
  });

  it("reports the voice switches: voice on unless VOICE_ENABLED says off, live off unless VOICE_LIVE_ENABLED says on", () => {
    for (const [value, expected] of [["false", false], ["0", false], [" OFF ", false], ["true", true], ["", true]] as const) {
      expect(flagsFrom({ VOICE_ENABLED: value }).voiceEnabled, JSON.stringify(value)).toBe(expected);
    }
    for (const [value, expected] of [["true", true], ["1", true], ["ON", true], ["false", false], ["", false], ["yes", false]] as const) {
      expect(flagsFrom({ VOICE_LIVE_ENABLED: value }).liveEnabled, JSON.stringify(value)).toBe(expected);
    }
    expect(flagsFrom(undefined)).toMatchObject({ voiceEnabled: true, liveEnabled: false, partyEnabled: true });
  });

  it("reports whether Party Rooms may be made: on unless PARTY_ENABLED says off", () => {
    for (const [value, expected] of [["false", false], ["0", false], [" OFF ", false], ["true", true], ["", true], ["no", true]] as const) {
      expect(flagsFrom({ PARTY_ENABLED: value }).partyEnabled, JSON.stringify(value)).toBe(expected);
    }
    expect(flagsFrom(undefined).partyEnabled).toBe(true);
    expect(flagsFrom({ PARTY_ENABLED: "false" })).toMatchObject({ worldGenEnabled: true, voiceEnabled: true, partyEnabled: false });
  });

  it("flagsFrom treats a missing environment as everything on", () => {
    expect(flagsFrom(undefined)).toEqual({ worldGenEnabled: true, dayCapReached: false, totalCapReached: false, voiceEnabled: true, liveEnabled: false, partyEnabled: true });
    expect(flagsFrom({ WORLD_GEN_ENABLED: "off" }, { dayCapReached: false, totalCapReached: true, killed: false })).toEqual({
      worldGenEnabled: false, dayCapReached: false, totalCapReached: true, voiceEnabled: true, liveEnabled: false, partyEnabled: true,
    });
  });
});
