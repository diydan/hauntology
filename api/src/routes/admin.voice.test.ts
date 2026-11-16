import { VoiceWindowStore, type VoiceWindowStatus } from "@hauntology/shared/voice/window";
import { MapKv } from "@hauntology/shared/world/map-kv";
import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createLogger } from "../log";
import type { VoiceWindowAdmin } from "../voice/window";
import { SECRET } from "../worlds/test-kit";
import type { AdminSpend } from "./admin";

// `POST /admin/voice` and the `voice` part of `GET /admin/status`: the operator opens the voice window for some minutes and some lines, and it closes by itself.

const TOKEN = "t0ken-abcdefghijklmnopqrstuvwxyz-0123456789";
const ORIGIN = "http://app.test";
const T0 = 1_800_000_000_000;
const auth = (token = TOKEN) => ({ Authorization: `Bearer ${token}` });

const spend: AdminSpend = { statusStrict: async () => ({ killed: false, dayCapReached: false, totalCapReached: false }), setKill: async () => {} };

/** The window over the real store, on a clock the test moves; `down` makes it fail the way an unreachable object does. */
function windowOver(clock: { t: number }, behaviour: { down: boolean }): VoiceWindowAdmin {
  const store = new VoiceWindowStore(new MapKv());
  const guard = <T,>(run: () => Promise<T>): Promise<T> => (behaviour.down ? Promise.reject(new Error("unreachable")) : run());
  return {
    status: () => guard(() => store.status(clock.t)),
    open: (minutes, cap) => guard(() => store.open({ minutes, cap }, clock.t)),
    close: () => guard(() => store.close(clock.t)),
  };
}

function setup(opts: { voice?: boolean } = {}) {
  const clock = { t: T0 };
  const behaviour = { down: false };
  const logged: string[] = [];
  const log = createLogger((l) => logged.push(l), () => clock.t);
  const app = createApp({ admin: { token: TOKEN, spend, worldGenAvailable: true, log, ...(opts.voice === false ? {} : { voice: windowOver(clock, behaviour) }) }, spend: async () => spend.statusStrict() });
  const send = async (path: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
    const res = await app.request(`${ORIGIN}${path}`, { method: init.method ?? "GET", headers: init.headers ?? {}, ...(init.body !== undefined ? { body: init.body } : {}) }, { HMAC_SECRET: SECRET });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, text, json };
  };
  const voice = (body: unknown, token = TOKEN) => send("/admin/voice", { method: "POST", headers: auth(token), body: typeof body === "string" ? body : JSON.stringify(body) });
  return { clock, behaviour, logged, send, voice, status: () => send("/admin/status", { headers: auth() }) };
}

describe("GET /admin/status", () => {
  it("carries the voice window: closed at first, with nothing used", async () => {
    const t = setup();
    const r = await t.status();
    expect(r.status).toBe(200);
    expect(r.json.voice).toEqual({ open: false, until: null, remainingMinutes: 0, cap: 0, used: 0, remainingLines: 0 });
    expect(r.json).toMatchObject({ worldGen: "open", killed: false }); // what it already said, unchanged
  });
  it("has no voice at all when the Worker cannot serve the voice", async () => {
    const t = setup({ voice: false });
    const r = await t.status();
    expect("voice" in r.json).toBe(false);
  });
  it("answers 502, like the rest of the status, when the window cannot be read, and never reads it as closed", async () => {
    const t = setup();
    t.behaviour.down = true;
    const r = await t.status();
    expect([r.status, r.json]).toEqual([502, { ok: false, code: "spend_guard_unavailable" }]);
  });
});

describe("POST /admin/voice", () => {
  it("opens an hour and 200 lines for `{}`, and reports the window in minutes and as a time the operator can read", async () => {
    const t = setup();
    const r = await t.voice({});
    expect(r.status).toBe(200);
    expect(r.json.voice).toEqual({ open: true, until: new Date(T0 + 60 * 60_000).toISOString(), remainingMinutes: 60, cap: 200, used: 0, remainingLines: 200 });
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });
  it("opens the minutes and lines it is given, and the status shows the same afterwards", async () => {
    const t = setup();
    await t.voice({ minutes: 90, cap: 40 });
    expect((await t.status()).json.voice).toMatchObject({ open: true, remainingMinutes: 90, cap: 40, remainingLines: 40 });
  });
  it("counts the minutes left down, rounded up to the minute", async () => {
    const t = setup();
    await t.voice({ minutes: 10 });
    t.clock.t += 4 * 60_000 + 30_000;
    expect((await t.status()).json.voice.remainingMinutes).toBe(6);
  });
  it("is closed by itself when the time is up", async () => {
    const t = setup();
    await t.voice({ minutes: 10 });
    t.clock.t += 10 * 60_000;
    expect((await t.status()).json.voice).toMatchObject({ open: false, until: null });
  });
  it("closes at once for minutes 0", async () => {
    const t = setup();
    await t.voice({ minutes: 30 });
    const r = await t.voice({ minutes: 0 });
    expect(r.status).toBe(200);
    expect(r.json.voice.open).toBe(false);
  });
  it("replaces an open window, with a count of none", async () => {
    const t = setup();
    await t.voice({ minutes: 30, cap: 5 });
    await t.voice({ minutes: 120, cap: 9 });
    expect((await t.status()).json.voice).toMatchObject({ remainingMinutes: 120, cap: 9, used: 0 });
  });
  it("needs the token: none, a wrong one, or a Basic one is 401 and opens nothing", async () => {
    const t = setup();
    for (const headers of [{}, auth("wrong"), { Authorization: `Basic ${TOKEN}` }]) {
      const r = await t.send("/admin/voice", { method: "POST", headers, body: "{}" });
      expect(r.status, JSON.stringify(headers)).toBe(401);
    }
    expect((await t.status()).json.voice.open).toBe(false);
  });
  it("refuses an empty body, which would otherwise open a window by accident, and text that is not JSON", async () => {
    const t = setup();
    expect((await t.voice("")).status).toBe(400);
    expect((await t.voice("open please")).status).toBe(400);
    expect((await t.status()).json.voice.open).toBe(false);
  });
  it("refuses what it does not accept, with a reason and no change: a typo, numbers out of range, text for a number, a cap on a close", async () => {
    const t = setup();
    const bad: unknown[] = [{ minute: 60 }, { minutes: 481 }, { minutes: -1 }, { minutes: 1.5 }, { minutes: "60" }, { minutes: 10, cap: 0 }, { minutes: 10, cap: 1001 }, { minutes: 0, cap: 5 }, [], "x", 7, null];
    for (const body of bad) {
      const r = await t.voice(JSON.stringify(body));
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.json.code).toBe("bad_request");
    }
    expect((await t.voice({ minute: 60 })).json.message).toMatch(/unknown field/);
    expect((await t.status()).json.voice.open).toBe(false);
  });
  it("refuses a body that is too large, with 413", async () => {
    const t = setup();
    expect((await t.voice(JSON.stringify({ minutes: 5, pad: "x".repeat(2_000) }))).status).toBe(413);
  });
  it("answers 502, and says nothing was opened, when the window cannot be reached, so a failure never looks like success", async () => {
    const t = setup();
    t.behaviour.down = true;
    const r = await t.voice({ minutes: 30 });
    expect([r.status, r.json]).toEqual([502, { ok: false, code: "spend_guard_unavailable" }]);
    expect(t.logged.filter((l) => l.includes("admin.voice"))).toEqual([]); // nothing happened, so nothing is logged as done
  });
  it("is not there when the Worker cannot serve the voice", async () => {
    const t = setup({ voice: false });
    expect((await t.voice({})).status).toBe(404);
  });
  it("only takes POST", async () => {
    const t = setup();
    expect((await t.send("/admin/voice", { method: "GET", headers: auth() })).status).toBe(404);
    expect((await t.send("/admin/voice", { method: "DELETE", headers: auth() })).status).toBe(404);
  });
  it("writes one counter line for each change, with the minutes and lines and never the token", async () => {
    const t = setup();
    await t.voice({ minutes: 30, cap: 50 });
    await t.voice({ minutes: 0 });
    await t.voice({ minutes: 481 }); // refused: not logged
    const rows = t.logged.map((l) => JSON.parse(l)).filter((l) => l.event === "admin.voice").map((l) => [l.on, l.minutes, l.cap]);
    expect(rows).toEqual([[true, 30, 50], [false, 0, 0]]);
    expect(t.logged.join("\n")).not.toContain(TOKEN);
  });
  it("leaves the kill switch's own answer as it was, with the voice added", async () => {
    const t = setup();
    await t.voice({ minutes: 30 });
    const r = await t.send("/admin/kill", { method: "POST", headers: auth(), body: JSON.stringify({ on: false }) });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ worldGen: "open", killed: false, voice: { open: true } });
  });
});

describe("the window as a type", () => {
  it("is what the store gives, so the route needs nothing the store lacks", () => {
    const s: VoiceWindowStatus = { open: false, until: null, remainingMs: 0, cap: 0, used: 0, remainingLines: 0 };
    expect(Object.keys(s).sort()).toEqual(["cap", "open", "remainingLines", "remainingMs", "until", "used"]);
  });
});
