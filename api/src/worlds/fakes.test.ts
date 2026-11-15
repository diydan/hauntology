import { describe, expect, it } from "vitest";
import { DEFAULT_CAPS, MemorySpendGuard } from "./fakes";

const req = (sessionId: string, now = 0) => ({ meter: "world" as const, sessionId, ipHash: "ip", now });

describe("MemorySpendGuard (the stand-in SpendGuard the route tests use)", () => {
  it("allows each session its cap and then says session", async () => {
    const g = new MemorySpendGuard();
    expect((await g.reserve(req("a"))).ok).toBe(true);
    expect((await g.reserve(req("a"))).ok).toBe(true);
    expect(await g.reserve(req("a"))).toEqual({ ok: false, reason: "session" });
    expect((await g.reserve(req("b"))).ok).toBe(true);
  });

  it("says day and total at those caps, in that order of checking", async () => {
    const day = new MemorySpendGuard({ ...DEFAULT_CAPS, world: { session: 9, day: 2, total: 9 } });
    await day.reserve(req("a")); await day.reserve(req("b"));
    expect(await day.reserve(req("c"))).toEqual({ ok: false, reason: "day" });
    const total = new MemorySpendGuard({ ...DEFAULT_CAPS, world: { session: 9, day: 9, total: 1 } });
    await total.reserve(req("a"));
    expect(await total.reserve(req("b"))).toEqual({ ok: false, reason: "total" });
  });

  it("says killed first when the kill switch is on", async () => {
    const g = new MemorySpendGuard();
    g.killed = true;
    expect(await g.reserve(req("a"))).toEqual({ ok: false, reason: "killed" });
  });

  it("gives a unit back on release, once, and keeps it on commit", async () => {
    const g = new MemorySpendGuard();
    const t1 = (await g.reserve(req("a"))) as { ok: true; ticket: Parameters<typeof g.commit>[0] };
    const t2 = (await g.reserve(req("a"))) as { ok: true; ticket: Parameters<typeof g.commit>[0] };
    await g.release(t1.ticket);
    await g.release(t1.ticket);
    expect(g.usedOn("world", "a")).toBe(1);
    await g.commit(t2.ticket);
    await g.release(t2.ticket); // too late: it was committed
    await g.commit(t2.ticket);
    expect(g.usedOn("world", "a")).toBe(1);
    expect(g.stateOf(t2.ticket.id)).toBe("committed");
    expect(g.stateOf(t1.ticket.id)).toBe("released");
    await g.release({ ...t1.ticket, id: "nope" }); // an unknown ticket changes nothing
    expect(g.usedOn("world", "a")).toBe(1);
  });

  it("does not count a refused reserve", async () => {
    const g = new MemorySpendGuard();
    await g.reserve(req("a")); await g.reserve(req("a")); await g.reserve(req("a"));
    expect(g.usedOn("world", "a")).toBe(2);
  });

  it("reports what is left per meter for one session", async () => {
    const g = new MemorySpendGuard();
    await g.reserve(req("a"));
    await g.reserve({ meter: "image", sessionId: "a", ipHash: "ip", now: 0 });
    expect(await g.remaining("a")).toEqual({ world: 1, image: 7, llm: 40, tts: 40, stt: 20, live: 30 });
    expect((await g.remaining("b")).world).toBe(2);
  });

  it("never reports more than the day or total allows", async () => {
    const g = new MemorySpendGuard({ ...DEFAULT_CAPS, world: { session: 9, day: 1, total: 5 } });
    await g.reserve(req("a"));
    expect((await g.remaining("b")).world).toBe(0);
    const t = new MemorySpendGuard({ ...DEFAULT_CAPS, world: { session: 9, day: 9, total: 1 } });
    expect((await t.remaining("a")).world).toBe(1);
    await t.reserve(req("x"));
    expect((await t.remaining("a")).world).toBe(0);
  });
});
