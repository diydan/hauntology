import { describe, expect, it } from "vitest";
import { fakeState } from "../worlds/fake-cloudflare";
import { SpendGuard } from "./spend-guard";

const T0 = Date.UTC(2026, 10, 15, 12, 0, 0);
const TTL = 30 * 60_000;

function setup(env: Record<string, string> = {}) {
  const parts = fakeState();
  const clock = { t: T0 };
  let n = 0;
  const guard = new SpendGuard(parts.state, env, () => clock.t, () => Uint8Array.from({ length: 16 }, (_, i) => (i === 0 ? ++n : i)));
  const post = async (path: string, body?: unknown, method = "POST") => {
    const res = await guard.fetch(new Request(`https://spend-guard${path}`, { method, ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) }));
    const text = await res.text();
    return { status: res.status, json: text === "" ? null : (JSON.parse(text) as unknown) };
  };
  const reserve = (over: Record<string, unknown> = {}) => post("/reserve", { meter: "world", sessionId: "sid-a", ipHash: "ip-a", ...over });
  return { guard, parts, clock, post, reserve };
}

describe("SpendGuard Durable Object", () => {
  it("reserves, says what is left, commits and releases", async () => {
    const t = setup();
    const r = await t.reserve();
    expect(r.status).toBe(200);
    const ticket = (r.json as { ok: true; ticket: { id: string; meter: string; sessionId: string; issuedAt: number } }).ticket;
    expect(ticket).toMatchObject({ meter: "world", sessionId: "sid-a", issuedAt: T0 });
    expect((await t.post("/remaining", { sessionId: "sid-a", ipHash: "ip-a" })).json).toMatchObject({ world: 1, image: 8, llm: 40, tts: 40, stt: 20, live: 30 });
    expect((await t.post("/release", { id: ticket.id })).status).toBe(204);
    expect(((await t.post("/remaining", { sessionId: "sid-a", ipHash: "ip-a" })).json as { world: number }).world).toBe(2);
    const second = (await t.reserve()).json as { ticket: { id: string } };
    expect((await t.post("/commit", { id: second.ticket.id })).status).toBe(204);
    await t.post("/release", { id: second.ticket.id });
    expect(((await t.post("/remaining", { sessionId: "sid-a", ipHash: "ip-a" })).json as { world: number }).world).toBe(1);
  });

  it("refuses at the caps it reads from its variables", async () => {
    const t = setup({ WORLD_SESSION_CAP: "1" });
    await t.reserve();
    expect((await t.reserve()).json).toEqual({ ok: false, reason: "session" });
    expect((await t.reserve({ sessionId: "sid-b" })).json).toMatchObject({ ok: true });
  });

  it("uses its own clock: the request cannot name the time", async () => {
    const t = setup();
    const r = await t.reserve({ now: 1 });
    expect((r.json as { ticket: { issuedAt: number } }).ticket.issuedAt).toBe(T0);
  });

  it("says its status, and the kill switch stops worlds only", async () => {
    const t = setup();
    expect((await t.post("/status", undefined, "GET")).json).toEqual({ dayCapReached: false, totalCapReached: false, killed: false });
    expect((await t.post("/kill", { on: true })).status).toBe(204);
    expect((await t.post("/status", undefined, "GET")).json).toMatchObject({ killed: true });
    expect((await t.reserve()).json).toEqual({ ok: false, reason: "killed" });
    expect((await t.reserve({ meter: "image" })).json).toMatchObject({ ok: true });
    await t.post("/kill", { on: false });
    expect((await t.reserve()).json).toMatchObject({ ok: true });
  });

  it("says the day cap is reached in its status", async () => {
    const t = setup({ WORLD_DAY_CAP: "1" });
    await t.reserve();
    expect((await t.post("/status", undefined, "GET")).json).toMatchObject({ dayCapReached: true, totalCapReached: false });
  });

  it("refuses a body that does not fit, and changes nothing", async () => {
    const t = setup();
    const bad: [string, unknown][] = [
      ["/reserve", {}], ["/reserve", { meter: "nope", sessionId: "s", ipHash: "i" }], ["/reserve", { meter: "world", sessionId: 7, ipHash: "i" }],
      ["/reserve", { meter: "world", sessionId: "s", ipHash: null }], ["/reserve", { meter: "world", sessionId: "a:b", ipHash: "i" }],
      ["/reserve", []], ["/reserve", "text"], ["/reserve", "{not json"],
      ["/commit", {}], ["/commit", { id: 5 }], ["/release", {}], ["/remaining", { sessionId: "s" }], ["/remaining", { sessionId: "", ipHash: "i" }], ["/kill", {}], ["/kill", { on: "yes" }],
    ];
    for (const [path, body] of bad) expect((await t.post(path, body)).status, `${path} ${JSON.stringify(body)}`).toBe(400);
    expect(t.parts.data.size).toBe(0);
  });

  it("answers only its own addresses and methods", async () => {
    const t = setup();
    expect((await t.post("/other", {})).status).toBe(404);
    expect((await t.post("/reserve", undefined, "GET")).status).toBe(404);
    expect((await t.post("/reserve", {}, "PUT")).status).toBe(405);
    expect((await t.post("/status", {}, "POST")).status).toBe(404);
  });

  it("sets the alarm for the oldest reservation and does not move it later", async () => {
    const t = setup();
    expect(t.parts.alarm.at).toBeNull();
    await t.reserve();
    expect(t.parts.alarm.at).toBe(T0 + TTL);
    t.clock.t = T0 + 5 * 60_000;
    await t.reserve({ sessionId: "sid-b" });
    expect(t.parts.alarm.at).toBe(T0 + TTL); // the first is still the oldest
    expect(t.parts.alarm.sets).toEqual([T0 + TTL]);
  });

  it("moves the alarm earlier when an older reservation turns up (the clock went back)", async () => {
    const t = setup();
    t.clock.t = T0 + 10 * 60_000;
    await t.reserve();
    expect(t.parts.alarm.at).toBe(T0 + 10 * 60_000 + TTL);
    t.clock.t = T0;
    await t.reserve({ sessionId: "sid-b" });
    expect(t.parts.alarm.at).toBe(T0 + TTL);
  });

  it("on the alarm, releases what ran out and sets the alarm for the next one", async () => {
    const t = setup({ WORLD_SESSION_CAP: "1" });
    await t.reserve();
    t.clock.t = T0 + 10 * 60_000;
    await t.reserve({ sessionId: "sid-b" });
    t.clock.t = T0 + TTL;
    t.parts.alarm.at = null; // the runtime clears an alarm as its handler starts
    await t.guard.alarm();
    // sid-a's reservation is released: it can reserve again; sid-b's is still held.
    expect(((await t.post("/remaining", { sessionId: "sid-a", ipHash: "ip-a" })).json as { world: number }).world).toBe(1);
    expect(((await t.post("/remaining", { sessionId: "sid-b", ipHash: "ip-b" })).json as { world: number }).world).toBe(0);
    expect(t.parts.alarm.at).toBe(T0 + 10 * 60_000 + TTL);
  });

  it("does not set an alarm when nothing is waiting", async () => {
    const t = setup();
    const r = (await t.reserve()).json as { ticket: { id: string } };
    await t.post("/commit", { id: r.ticket.id });
    t.parts.alarm.at = null;
    t.parts.alarm.sets.length = 0;
    t.clock.t = T0 + 5 * 60 * 60_000;
    await t.guard.alarm();
    expect(t.parts.alarm.sets).toEqual([]);
  });

  it("keeps its counts across a restart, because they are in storage", async () => {
    const t = setup({ WORLD_SESSION_CAP: "1" });
    await t.reserve();
    const again = new SpendGuard(t.parts.state, { WORLD_SESSION_CAP: "1" }, () => T0);
    const res = await again.fetch(new Request("https://spend-guard/reserve", { method: "POST", body: JSON.stringify({ meter: "world", sessionId: "sid-a", ipHash: "ip-a" }) }));
    expect(await res.json()).toEqual({ ok: false, reason: "session" });
  });
});
