import { describe, expect, it } from "vitest";
import { DEFAULT_CAPS, MemorySpendGuard } from "./fakes";

const T0 = Date.UTC(2026, 10, 15, 12, 0, 0);
const req = (sessionId: string) => ({ meter: "world" as const, sessionId, ipHash: "ip", now: T0 });
const guard = (caps = DEFAULT_CAPS) => new MemorySpendGuard(caps, () => T0);

describe("MemorySpendGuard (the in-process SpendGuard the route tests use, over the real ledger)", () => {
  it("follows the ledger: session cap, release, commit and what is left", async () => {
    const g = guard();
    const a = (await g.reserve(req("a"))) as { ok: true; ticket: Parameters<typeof g.commit>[0] };
    await g.reserve(req("a"));
    expect(await g.reserve(req("a"))).toEqual({ ok: false, reason: "session" });
    expect(g.usedOn("world", "a")).toBe(2);
    await g.release(a.ticket);
    expect(g.usedOn("world", "a")).toBe(1);
    expect(g.stateOf(a.ticket.id)).toBe("released");
    expect((await g.remaining("a", "ip")).world).toBe(1);
  });

  it("says killed for worlds when `killed` is set, and records every reserve it was asked", async () => {
    const g = guard();
    g.killed = true;
    expect(await g.reserve(req("a"))).toEqual({ ok: false, reason: "killed" });
    expect(g.reserveCalls).toEqual(["world:a"]);
    expect((await g.status()).killed).toBe(true);
    g.killed = false;
    expect((await g.reserve(req("a"))).ok).toBe(true);
  });

  it("uses the clock it is given for commit, release and remaining", async () => {
    let now = T0;
    const g = new MemorySpendGuard(DEFAULT_CAPS, () => now);
    await g.reserve(req("a"));
    now = T0 + 31 * 60_000; // the reservation has run out
    expect((await g.remaining("a", "ip")).world).toBe(2);
  });

  it("knows nothing about a ticket it did not make, or a Session that did not reserve", () => {
    const g = guard();
    expect(g.stateOf("nope")).toBeUndefined();
    expect(g.usedOn("world", "nobody")).toBe(0);
  });
});
