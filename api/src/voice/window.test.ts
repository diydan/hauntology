import type { ReserveResult, SpendTicket } from "@hauntology/shared/world/spend";
import { describe, expect, it } from "vitest";
import { SpendGuard } from "../do/spend-guard";
import { SpendGuardClient } from "../spend/client";
import type { JobNamespaceLike } from "../worlds/cloudflare-store";
import { FakeNamespace } from "../worlds/fake-cloudflare";
import { SpendGuardVoiceWindow, windowedSpend } from "./window";

const T0 = 1_800_000_000_000;
const MIN = 60_000;

/** The real `SpendGuard` object over fake storage, with a clock the test moves. */
function setup(env: Record<string, string> = {}) {
  const clock = { t: T0 };
  const ns = new FakeNamespace((state) => new SpendGuard(state, env, () => clock.t));
  return { clock, ns, window: new SpendGuardVoiceWindow(ns), guard: new SpendGuardClient(ns, { strict: true }), stub: () => ns.get(ns.idFromName("global")) };
}
/** A namespace whose objects answer one request at a time, in the order they came. */
function oneAtATime(ns: JobNamespaceLike): JobNamespaceLike {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    idFromName: (name) => ns.idFromName(name),
    get: (id) => {
      const stub = ns.get(id);
      return {
        fetch: (input, init) => {
          const run = tail.then(() => stub.fetch(input, init));
          tail = run.catch(() => undefined);
          return run;
        },
      };
    },
  };
}
const ask = (s: ReturnType<typeof setup>, path: string, method = "POST", body: unknown = {}) =>
  s.stub().fetch(`https://spend-guard${path}`, { method, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });

describe("the voice window in the SpendGuard object", () => {
  it("is closed until it is opened", async () => {
    const s = setup();
    expect(await s.window.status()).toEqual({ open: false, until: null, remainingMs: 0, cap: 0, used: 0, remainingLines: 0 });
    expect(await s.window.isOpen()).toBe(false);
    expect(await s.window.take()).toEqual({ ok: false, reason: "closed" });
  });
  it("opens for the minutes and lines given, by the object's own clock", async () => {
    const s = setup();
    expect(await s.window.open(30, 5)).toEqual({ open: true, until: T0 + 30 * MIN, remainingMs: 30 * MIN, cap: 5, used: 0, remainingLines: 5 });
    expect(await s.window.isOpen()).toBe(true);
  });
  it("closes by itself when the time is up, with no timer and no cron", async () => {
    const s = setup();
    await s.window.open(10, 5);
    s.clock.t = T0 + 10 * MIN - 1;
    expect(await s.window.isOpen()).toBe(true);
    s.clock.t = T0 + 10 * MIN;
    expect(await s.window.isOpen()).toBe(false);
    expect(await s.window.take()).toEqual({ ok: false, reason: "closed" });
  });
  it("hands out its lines one by one, says cap when they are spent, and takes a line back", async () => {
    const s = setup();
    await s.window.open(60, 2);
    const a = await s.window.take();
    const b = await s.window.take();
    expect([a.ok, b.ok]).toEqual([true, true]);
    expect(await s.window.take()).toEqual({ ok: false, reason: "cap" });
    expect(await s.window.isOpen()).toBe(true); // lines spent is not closed: cached audio still plays
    if (a.ok) await s.window.give(a.id);
    expect((await s.window.status()).used).toBe(1);
  });
  it("closes at once, and opens a new window with a count of none", async () => {
    const s = setup();
    await s.window.open(60, 1);
    await s.window.take();
    expect((await s.window.close()).open).toBe(false);
    expect((await s.window.open(60, 4)).used).toBe(0);
  });
  it("keeps the window across instances of the object: it is in storage", async () => {
    const s = setup();
    await s.window.open(60, 3);
    const again = new SpendGuardVoiceWindow(s.ns);
    expect((await again.status()).cap).toBe(3);
  });
  it("does not touch the ledger: the same object still answers status and quota", async () => {
    const s = setup();
    await s.window.open(60, 3);
    expect(await s.guard.statusStrict()).toEqual({ dayCapReached: false, totalCapReached: false, killed: false });
  });
});

describe("the object's addresses for the window", () => {
  it("refuses a body it does not accept with a 400 and changes nothing", async () => {
    const s = setup();
    await s.window.open(30, 5);
    for (const body of [{ minute: 5 }, { minutes: 0 }, { minutes: 481 }, { cap: 0 }, { minutes: "60" }, { minutes: 10, cap: 1001 }, [], "x"]) {
      expect((await ask(s, "/voice-window/open", "POST", body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await s.window.status()).toMatchObject({ open: true, cap: 5, remainingMs: 30 * MIN });
  });
  it("opens with the defaults for an empty body: an hour and 200 lines", async () => {
    const s = setup();
    const res = await ask(s, "/voice-window/open", "POST", {});
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ open: true, cap: 200, remainingMs: 60 * MIN });
  });
  it("refuses a give that has no whole-number id", async () => {
    const s = setup();
    for (const body of [{}, { id: "1" }, { id: 1.5 }, { id: null }]) expect((await ask(s, "/voice-window/give", "POST", body)).status, JSON.stringify(body)).toBe(400);
    expect((await ask(s, "/voice-window/give", "POST", { id: 1 })).status).toBe(204);
  });
  it("answers GET only for the status, POST only for the rest, and nothing for an address it does not have", async () => {
    const s = setup();
    expect((await ask(s, "/voice-window", "GET")).status).toBe(200);
    expect((await ask(s, "/voice-window/take", "GET")).status).toBe(404);
    expect((await ask(s, "/voice-window/open", "GET")).status).toBe(404);
    expect((await ask(s, "/voice-window", "DELETE")).status).toBe(405);
    expect((await ask(s, "/voice-window/nope", "POST", {})).status).toBe(404);
  });
});

describe("SpendGuardVoiceWindow fails closed", () => {
  const fake = (fetch: () => Promise<Response>) => new SpendGuardVoiceWindow({ idFromName: (n) => n, get: () => ({ fetch }) });
  const json = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });

  it("reads an object that cannot be reached as closed, with no line to take, and does not throw", async () => {
    const w = fake(async () => { throw new Error("unreachable"); });
    expect(await w.isOpen()).toBe(false);
    expect(await w.take()).toEqual({ ok: false, reason: "closed" });
    await expect(w.give(1)).resolves.toBeUndefined();
  });
  it("reads an error answer, or an answer that does not fit, as closed", async () => {
    for (const make of [json({ open: true }, 500), json({ open: "yes", remainingMs: 1, cap: 1, used: 0, remainingLines: 1, until: 5 }), json({ open: true, until: "soon", remainingMs: 1, cap: 1, used: 0, remainingLines: 1 }), json(null), json("open"), async () => new Response("not json")]) {
      expect(await fake(make).isOpen()).toBe(false);
    }
    for (const make of [json({ ok: true }, 500), json({ ok: true, id: "x" }), json({ ok: true, id: 1.5 }), json({}), json(null), async () => new Response("no")]) {
      expect(await fake(make).take()).toEqual({ ok: false, reason: "closed" });
    }
  });
  it("keeps cap as cap, and anything else it does not know as closed", async () => {
    expect(await fake(json({ ok: false, reason: "cap" })).take()).toEqual({ ok: false, reason: "cap" });
    expect(await fake(json({ ok: false, reason: "weird" })).take()).toEqual({ ok: false, reason: "closed" });
  });
  it("throws for the operator, so a failure never looks like a closed window", async () => {
    const w = fake(async () => { throw new Error("unreachable"); });
    await expect(w.status()).rejects.toThrow();
    await expect(w.open(5, 5)).rejects.toThrow();
    await expect(w.close()).rejects.toThrow();
    await expect(fake(json({}, 502)).status()).rejects.toThrow(/refused/);
    await expect(fake(json({ open: 1 })).status()).rejects.toThrow(/does not fit/);
  });
});

describe("windowedSpend", () => {
  const ticket = (id: string, meter: SpendTicket["meter"] = "tts"): SpendTicket => ({ id, meter, sessionId: "s", issuedAt: 1 });
  /** A guard that grants unless told otherwise, and records what it was asked. */
  function guard(mode: "grant" | "deny" | "throw" = "grant") {
    const log = { reserved: [] as string[], commits: [] as string[], releases: [] as string[] };
    let n = 0;
    return {
      log,
      reserve: async (req: { meter: SpendTicket["meter"] }): Promise<ReserveResult> => {
        log.reserved.push(req.meter);
        if (mode === "throw") throw new Error("guard down");
        if (mode === "deny") return { ok: false, reason: "session" };
        return { ok: true, ticket: ticket(`t${++n}`, req.meter) };
      },
      commit: async (t: SpendTicket) => void log.commits.push(t.id),
      release: async (t: SpendTicket) => void log.releases.push(t.id),
    };
  }
  const req = (meter: SpendTicket["meter"] = "tts") => ({ meter, sessionId: "s", ipHash: "h", now: 1 });

  it("refuses a speech reservation while the window is closed, like the kill switch, and never asks the guard", async () => {
    const s = setup();
    const g = guard();
    expect(await windowedSpend(g, s.window).reserve(req())).toEqual({ ok: false, reason: "killed" });
    expect(g.log.reserved).toEqual([]);
  });
  it("refuses it when the window's lines are spent, like a cap", async () => {
    const s = setup();
    await s.window.open(60, 1);
    const g = guard();
    const w = windowedSpend(g, s.window);
    expect((await w.reserve(req())).ok).toBe(true);
    expect(await w.reserve(req())).toEqual({ ok: false, reason: "total" });
    expect(g.log.reserved).toEqual(["tts"]);
  });
  it("leaves every other meter alone: no line is taken for the narrator or a world", async () => {
    const s = setup();
    const g = guard();
    const w = windowedSpend(g, s.window);
    for (const meter of ["llm", "world", "image", "stt", "live"] as const) expect((await w.reserve(req(meter))).ok, meter).toBe(true);
    expect(g.log.reserved).toEqual(["llm", "world", "image", "stt", "live"]);
    expect(await s.window.status()).toMatchObject({ open: false });
  });
  it("keeps the line spent when the call is charged (commit)", async () => {
    const s = setup();
    await s.window.open(60, 3);
    const w = windowedSpend(guard(), s.window);
    const r = await w.reserve(req());
    if (r.ok) await w.commit(r.ticket);
    expect((await s.window.status()).used).toBe(1);
  });
  it("gives the line back when the call cost nothing (release)", async () => {
    const s = setup();
    await s.window.open(60, 3);
    const g = guard();
    const w = windowedSpend(g, s.window);
    const r = await w.reserve(req());
    expect((await s.window.status()).used).toBe(1);
    if (r.ok) await w.release(r.ticket);
    expect((await s.window.status()).used).toBe(0);
    expect(g.log.releases).toEqual(["t1"]);
  });
  it("gives the line back when the guard refuses, and when it throws (and the error goes on)", async () => {
    const s = setup();
    await s.window.open(60, 3);
    expect(await windowedSpend(guard("deny"), s.window).reserve(req())).toEqual({ ok: false, reason: "session" });
    expect((await s.window.status()).used).toBe(0);
    await expect(windowedSpend(guard("throw"), s.window).reserve(req())).rejects.toThrow("guard down");
    expect((await s.window.status()).used).toBe(0);
  });
  it("does not give a line back to a newer window when a call outlives the one it started in", async () => {
    const s = setup();
    await s.window.open(60, 3);
    const w = windowedSpend(guard(), s.window);
    const slow = await w.reserve(req());
    await s.window.open(60, 3); // the operator opens a fresh window while that call is still running
    const fresh = await w.reserve(req());
    expect(fresh.ok).toBe(true);
    if (slow.ok) await w.release(slow.ticket); // the old call finishes with nothing to charge
    expect((await s.window.status()).used).toBe(1); // only the new window's own line
  });
  it("lets no more than the cap through when requests arrive together (the object serving one request at a time, as a Durable Object does while it reads and writes its storage)", async () => {
    const s = setup();
    await s.window.open(60, 3);
    // A real object's input gate keeps a read-then-write of its storage from being interleaved with another request; `FakeNamespace` does not model that, so this
    // test serves one request at a time. The ledger relies on the same guarantee. It is shown here against that emulation, not against a deployed object.
    const w = windowedSpend(guard(), new SpendGuardVoiceWindow(oneAtATime(s.ns)));
    const results = await Promise.all(Array.from({ length: 10 }, () => w.reserve(req())));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok)).toHaveLength(7);
    expect((await s.window.status()).used).toBe(3);
  });
  it("works over the real SpendGuard: a line of the window and a unit of the tts quota go together, and come back together", async () => {
    const s = setup();
    await s.window.open(60, 5);
    const w = windowedSpend(s.guard, s.window);
    const quota = async () => (await s.guard.remaining("sess", "iphash")).tts;
    const before = await quota();
    const r = await w.reserve({ meter: "tts", sessionId: "sess", ipHash: "iphash", now: T0 });
    expect(r.ok).toBe(true);
    expect(before - (await quota())).toBe(1);
    expect((await s.window.status()).used).toBe(1);
    if (r.ok) await w.release(r.ticket);
    expect(await quota()).toBe(before);
    expect((await s.window.status()).used).toBe(0);
  });
  it("is refused by the window before the real SpendGuard is even asked, once the window has closed", async () => {
    const s = setup();
    await s.window.open(1, 5);
    s.clock.t = T0 + 2 * MIN;
    const before = (await s.guard.remaining("sess", "iphash")).tts;
    expect(await windowedSpend(s.guard, s.window).reserve({ meter: "tts", sessionId: "sess", ipHash: "iphash", now: s.clock.t })).toEqual({ ok: false, reason: "killed" });
    expect((await s.guard.remaining("sess", "iphash")).tts).toBe(before);
  });
});
