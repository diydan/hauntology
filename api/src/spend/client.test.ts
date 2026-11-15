import { describe, expect, it } from "vitest";
import { SpendGuard } from "../do/spend-guard";
import { FakeNamespace } from "../worlds/fake-cloudflare";
import { SpendGuardClient } from "./client";

const T0 = Date.UTC(2026, 10, 15, 12, 0, 0);
const req = (sessionId = "sid-a", meter: "world" | "image" = "world") => ({ meter, sessionId, ipHash: "ip-a", now: 0 });

const real = (env: Record<string, string> = {}) => {
  const ns = new FakeNamespace((state) => new SpendGuard(state, env, () => T0));
  return { ns, client: new SpendGuardClient(ns) };
};
/** A namespace whose one object answers with `answer`. */
const answering = (answer: () => Promise<Response> | Response) => new SpendGuardClient({ idFromName: (n) => n, get: () => ({ fetch: async () => answer() }) });
const throwing = () => new SpendGuardClient({ idFromName: (n) => n, get: () => ({ fetch: async () => { throw new Error("down"); } }) });

describe("SpendGuardClient over the Durable Object", () => {
  it("talks to the one object named global", async () => {
    const { ns, client } = real();
    await client.reserve(req());
    await client.remaining("sid-a", "ip-a");
    expect(new Set(ns.asked)).toEqual(new Set(["global"]));
  });

  it("reserves, commits, releases and reports what is left", async () => {
    const { client } = real();
    const r = await client.reserve(req());
    expect(r).toMatchObject({ ok: true, ticket: { meter: "world", sessionId: "sid-a", issuedAt: T0 } });
    if (!r.ok) throw new Error("unreachable");
    expect((await client.remaining("sid-a", "ip-a")).world).toBe(1);
    await client.release(r.ticket);
    expect((await client.remaining("sid-a", "ip-a")).world).toBe(2);
    const second = await client.reserve(req());
    if (!second.ok) throw new Error("unreachable");
    await client.commit(second.ticket);
    await client.release(second.ticket);
    expect((await client.remaining("sid-a", "ip-a")).world).toBe(1);
  });

  it("passes the reasons for a refusal on", async () => {
    const { client } = real({ WORLD_SESSION_CAP: "1" });
    await client.reserve(req());
    expect(await client.reserve(req())).toEqual({ ok: false, reason: "session" });
  });

  it("sets the kill switch and reads the status", async () => {
    const { client } = real();
    expect(await client.status()).toEqual({ dayCapReached: false, totalCapReached: false, killed: false });
    await client.setKill(true);
    expect((await client.status()).killed).toBe(true);
    expect(await client.reserve(req())).toEqual({ ok: false, reason: "killed" });
  });

  it("does not send its own time", async () => {
    let body = "";
    const client = answering(() => new Response(JSON.stringify({ ok: false, reason: "day" })));
    const ns = { idFromName: (n: string) => n, get: () => ({ fetch: async (_u: string, init?: RequestInit) => { body = String(init?.body); return new Response(JSON.stringify({ ok: false, reason: "day" })); } }) };
    await new SpendGuardClient(ns).reserve(req());
    expect(JSON.parse(body)).toEqual({ meter: "world", sessionId: "sid-a", ipHash: "ip-a" });
    expect(await client.reserve(req())).toEqual({ ok: false, reason: "day" });
  });
});

describe("SpendGuardClient fails closed", () => {
  const ticket = { id: "t-1", meter: "world" as const, sessionId: "sid-a", issuedAt: T0 };

  it("refuses a reserve when the object is down, errors, or answers with something unexpected", async () => {
    const answers: (() => Promise<Response> | Response)[] = [
      () => { throw new Error("down"); },
      () => new Response("boom", { status: 500 }),
      () => new Response("not json"),
      () => new Response("{}"),
      () => new Response(JSON.stringify({ ok: true })),
      () => new Response(JSON.stringify({ ok: true, ticket: { id: 5, meter: "world", sessionId: "s", issuedAt: 1 } })),
      () => new Response(JSON.stringify({ ok: true, ticket: { id: "t", meter: "nope", sessionId: "s", issuedAt: 1 } })),
      () => new Response(JSON.stringify({ ok: true, ticket: { id: "t", meter: "world", sessionId: "s", issuedAt: "x" } })),
      () => new Response(JSON.stringify({ ok: false, reason: "weird" })),
      () => new Response(JSON.stringify({ ok: false })),
      () => new Response(JSON.stringify({ ok: true, ticket: { id: "t", meter: "world", sessionId: "s", issuedAt: 1 } }), { status: 500 }),
      () => new Response(JSON.stringify({ ok: false, reason: "day" }), { status: 500 }),
    ];
    for (const a of answers) expect(await answering(a).reserve(req())).toEqual({ ok: false, reason: "killed" });
    expect(await throwing().reserve(req())).toEqual({ ok: false, reason: "killed" });
  });

  it("reports no places left when it cannot tell", async () => {
    const none = { world: 0, image: 0, llm: 0, tts: 0, stt: 0, live: 0 };
    expect(await throwing().remaining("s", "i")).toEqual(none);
    expect(await answering(() => new Response("x", { status: 500 })).remaining("s", "i")).toEqual(none);
    expect(await answering(() => new Response("{}")).remaining("s", "i")).toEqual(none);
    for (const bad of [{ world: -1 }, { world: 1.5 }, { world: "2" }, { world: 2_000_000 }]) {
      const full: Record<string, unknown> = { world: 1, image: 1, llm: 1, tts: 1, stt: 1, live: 1 };
      Object.assign(full, bad);
      expect(await answering(() => new Response(JSON.stringify(full))).remaining("s", "i")).toEqual(none);
    }
    const ok = { world: 1, image: 2, llm: 3, tts: 4, stt: 5, live: 6 };
    expect(await answering(() => new Response(JSON.stringify(ok))).remaining("s", "i")).toEqual(ok);
  });

  it("reads the status as closed when it cannot tell", async () => {
    const closed = { dayCapReached: true, totalCapReached: true, killed: true };
    expect(await throwing().status()).toEqual(closed);
    expect(await answering(() => new Response("x", { status: 500 })).status()).toEqual(closed);
    expect(await answering(() => new Response("{}")).status()).toEqual(closed);
    expect(await answering(() => new Response(JSON.stringify({ dayCapReached: false, totalCapReached: false, killed: "no" }))).status()).toEqual(closed);
    expect(await answering(() => new Response(JSON.stringify({ dayCapReached: false, totalCapReached: false, killed: false }))).status()).toEqual({ dayCapReached: false, totalCapReached: false, killed: false });
  });

  it("drops a commit or release it cannot deliver, and does not throw", async () => {
    await expect(throwing().commit(ticket)).resolves.toBeUndefined();
    await expect(throwing().release(ticket)).resolves.toBeUndefined();
  });

  it("throws when the kill switch cannot be set, so the operator knows", async () => {
    await expect(answering(() => new Response(null, { status: 500 })).setKill(true)).rejects.toThrow(/kill switch/);
  });
});

describe("SpendGuardClient in strict mode", () => {
  const ticket = { id: "t-1", meter: "world" as const, sessionId: "sid-a", issuedAt: T0 };
  const strict = (fetcher: () => Promise<Response> | Response) => new SpendGuardClient({ idFromName: (n) => n, get: () => ({ fetch: async () => fetcher() }) }, { strict: true });

  it("throws when a commit or release is refused or cannot be delivered, so the job can try again", async () => {
    for (const bad of [() => new Response(null, { status: 500 }), () => { throw new Error("down"); }]) {
      await expect(strict(bad).commit(ticket)).rejects.toThrow();
      await expect(strict(bad).release(ticket)).rejects.toThrow();
    }
  });

  it("does not throw when they are delivered", async () => {
    await expect(strict(() => new Response(null, { status: 204 })).commit(ticket)).resolves.toBeUndefined();
    await expect(strict(() => new Response(null, { status: 204 })).release(ticket)).resolves.toBeUndefined();
  });

  it("is not the default: the plain client drops what it cannot deliver", async () => {
    const plain = new SpendGuardClient({ idFromName: (n) => n, get: () => ({ fetch: async () => new Response(null, { status: 500 }) }) });
    await expect(plain.commit(ticket)).resolves.toBeUndefined();
    await expect(plain.release(ticket)).resolves.toBeUndefined();
  });
});
