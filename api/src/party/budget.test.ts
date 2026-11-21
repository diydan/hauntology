import { describe, expect, it } from "vitest";
import type { Meter, Remaining, ReserveResult, SpendGuard, SpendTicket } from "@hauntology/shared/world/spend";
import { MemoryRoomSpendStore, RoomBudget } from "./budget";

/** A guard that follows the interface and keeps a global budget per meter. */
class FakeGuard implements SpendGuard {
  used: Record<string, number> = {};
  scopes: string[] = [];
  next = 1;
  constructor(public global: Partial<Record<Meter, number>> = {}) {}
  async reserve(req: { meter: Meter; sessionId: string; ipHash: string; now: number }): Promise<ReserveResult> {
    this.scopes.push(req.sessionId);
    const cap = this.global[req.meter] ?? 1000;
    if ((this.used[req.meter] ?? 0) >= cap) return { ok: false, reason: "total" };
    this.used[req.meter] = (this.used[req.meter] ?? 0) + 1;
    return { ok: true, ticket: { id: `t${this.next++}`, meter: req.meter, sessionId: req.sessionId, issuedAt: req.now } };
  }
  async commit(): Promise<void> { /* the unit stays */ }
  released = new Set<string>();
  /** Like the real guard, repeating a release changes nothing. */
  async release(t: SpendTicket): Promise<void> { if (this.released.has(t.id)) return; this.released.add(t.id); this.used[t.meter] = (this.used[t.meter] ?? 1) - 1; }
  async remaining(): Promise<Remaining> { return { world: 9, image: 99, llm: 99, tts: 9, stt: 9, live: 9 }; }
}
const ask = (b: RoomBudget, meter: Meter) => b.reserve({ meter, sessionId: "caller-session", ipHash: "h", now: 1 });

describe("RoomBudget (party-mode 5.4, 10.1)", () => {
  it("takes a unit from the Room and from the global guard, with the Room as the scope", async () => {
    const g = new FakeGuard(); const store = new MemoryRoomSpendStore();
    const b = new RoomBudget(g, "room:ABCD", { images: 2, models: 3 }, store);
    expect((await ask(b, "image")).ok).toBe(true);
    expect((await ask(b, "llm")).ok).toBe(true);
    expect(store.spend).toEqual({ images: 1, models: 1 });
    expect(g.scopes).toEqual(["room:ABCD", "room:ABCD"]);
  });
  it("refuses past the Room's cap without asking the guard at all, and spends nothing upstream", async () => {
    const g = new FakeGuard(); const store = new MemoryRoomSpendStore();
    const b = new RoomBudget(g, "room:ABCD", { images: 1, models: 60 }, store);
    expect((await ask(b, "image")).ok).toBe(true);
    const r = await ask(b, "image");
    expect(r).toEqual({ ok: false, reason: "session" });
    expect(b.lastDeny).toBe("room");
    expect(g.used.image).toBe(1);
    expect(g.scopes).toHaveLength(1);
    expect(store.spend.images).toBe(1);
  });
  it("keeps the global caps on top: a global refusal takes nothing from the Room", async () => {
    const g = new FakeGuard({ llm: 0 }); const store = new MemoryRoomSpendStore();
    const b = new RoomBudget(g, "room:ABCD", { images: 12, models: 60 }, store);
    expect(await ask(b, "llm")).toEqual({ ok: false, reason: "total" });
    expect(b.lastDeny).toBe("total");
    expect(store.spend).toEqual({ images: 0, models: 0 });
  });
  it("gives a unit back to the Room when the work fails, and keeps it when the work is committed", async () => {
    const g = new FakeGuard(); const store = new MemoryRoomSpendStore();
    const b = new RoomBudget(g, "room:ABCD", { images: 2, models: 2 }, store);
    const a = await ask(b, "image"); const c = await ask(b, "image");
    if (!a.ok || !c.ok) throw new Error("expected tickets");
    await b.release(a.ticket); await b.commit(c.ticket);
    await b.release(a.ticket); // repeating changes nothing
    expect(store.spend.images).toBe(1);
    expect(g.used.image).toBe(1);
    expect((await ask(b, "image")).ok).toBe(true);
  });
  it("answers the kill switch before anything else, and passes other meters straight to the guard", async () => {
    const g = new FakeGuard(); const store = new MemoryRoomSpendStore();
    let killed = true;
    const b = new RoomBudget(g, "room:ABCD", { images: 12, models: 60 }, store, { killed: () => killed });
    expect(await ask(b, "llm")).toEqual({ ok: false, reason: "killed" });
    expect(g.scopes).toHaveLength(0);
    killed = false;
    expect((await ask(b, "tts")).ok).toBe(true);
    expect(store.spend).toEqual({ images: 0, models: 0 });
  });
  it("never lets concurrent reserves pass the cap", async () => {
    const g = new FakeGuard(); const store = new MemoryRoomSpendStore();
    const b = new RoomBudget(g, "room:ABCD", { images: 3, models: 0 }, store);
    const rs = await Promise.all(Array.from({ length: 10 }, () => ask(b, "image")));
    expect(rs.filter((r) => r.ok)).toHaveLength(3);
    expect(store.spend.images).toBe(3);
  });
  it("reports what is left as the smaller of the Room's and the guard's", async () => {
    const b = new RoomBudget(new FakeGuard(), "room:ABCD", { images: 12, models: 60 }, new MemoryRoomSpendStore({ images: 10, models: 0 }));
    const r = await b.remaining("x", "h");
    expect([r.image, r.llm, r.tts]).toEqual([2, 60, 9]);
  });
});
