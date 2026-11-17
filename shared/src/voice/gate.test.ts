import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { SpendTicket } from "../world/spend";
import { withTicket, type GateMeter, type GatePorts } from "./gate";

const ticket = (meter: SpendTicket["meter"] = "tts"): SpendTicket => ({ id: "t1", meter, sessionId: "s", issuedAt: 1 });

type Opts = { kill?: boolean | "throws"; grant?: SpendTicket | null | "throws"; commitFails?: boolean; releaseFails?: boolean };
function fakePorts(o: Opts = {}) {
  const log = { reserve: [] as GateMeter[], commit: [] as SpendTicket[], release: [] as SpendTicket[], kill: 0 };
  const ports: GatePorts = {
    kill: () => { log.kill += 1; if (o.kill === "throws") throw new Error("flag unreadable"); return o.kill === true; },
    reserve: async (m) => { log.reserve.push(m); if (o.grant === "throws") throw new Error("guard down"); return o.grant === undefined ? ticket(m) : o.grant; },
    commit: async (t) => { log.commit.push(t); if (o.commitFails) throw new Error("lost"); },
    release: async (t) => { log.release.push(t); if (o.releaseFails) throw new Error("lost"); },
  };
  return { ports, log };
}

describe("withTicket: the three ways it refuses", () => {
  it("killed: nothing is reserved and the call is never made", async () => {
    const { ports, log } = fakePorts({ kill: true });
    let calls = 0;
    expect(await withTicket(ports, "tts", async () => { calls += 1; return 1; })).toEqual({ ok: false, reason: "killed" });
    expect(calls).toBe(0);
    expect(log.reserve).toEqual([]);
    expect(log.commit.length + log.release.length).toBe(0);
  });
  it("killed when the kill switch cannot be read (it fails closed)", async () => {
    const { ports, log } = fakePorts({ kill: "throws" });
    expect(await withTicket(ports, "tts", async () => 1)).toEqual({ ok: false, reason: "killed" });
    expect(log.reserve).toEqual([]);
  });
  it("denied: no Ticket, so the call is never made and nothing is settled", async () => {
    for (const grant of [null, "throws"] as const) {
      const { ports, log } = fakePorts({ grant });
      let calls = 0;
      expect(await withTicket(ports, "tts", async () => { calls += 1; return 1; })).toEqual({ ok: false, reason: "denied" });
      expect(calls).toBe(0);
      expect(log.commit.length + log.release.length).toBe(0);
    }
  });
  it("denied, and the Ticket is released, when the one granted is for another meter", async () => {
    const wrong = ticket("llm");
    const { ports, log } = fakePorts({ grant: wrong });
    let calls = 0;
    expect(await withTicket(ports, "tts", async () => { calls += 1; return 1; })).toEqual({ ok: false, reason: "denied" });
    expect(calls).toBe(0);
    expect(log.release).toEqual([wrong]);
    expect(log.commit).toEqual([]);
  });
  it("asks for the meter it was given", async () => {
    for (const m of ["tts", "stt", "live"] as const) {
      const { ports, log } = fakePorts();
      await withTicket(ports, m, async () => 1);
      expect(log.reserve).toEqual([m]);
    }
  });
});

describe("withTicket: settling", () => {
  it("makes the call once with the Ticket and commits it", async () => {
    const { ports, log } = fakePorts();
    const seen: SpendTicket[] = [];
    expect(await withTicket(ports, "tts", async (t) => { seen.push(t); return "audio"; })).toEqual({ ok: true, value: "audio" });
    expect(seen).toEqual([ticket()]);
    expect(log.commit).toEqual([ticket()]);
    expect(log.release).toEqual([]);
  });
  it("releases the Ticket and says failed when the call throws", async () => {
    const { ports, log } = fakePorts();
    expect(await withTicket(ports, "tts", async () => { throw new Error("upstream"); })).toEqual({ ok: false, reason: "failed" });
    expect(log.release).toEqual([ticket()]);
    expect(log.commit).toEqual([]);
  });
  it("releases an answer that was not charged and commits one that was, and the answer is returned either way", async () => {
    const free = fakePorts();
    expect(await withTicket(free.ports, "tts", async () => ({ ok: false }), (v) => v.ok)).toEqual({ ok: true, value: { ok: false } });
    expect([free.log.commit.length, free.log.release.length]).toEqual([0, 1]);
    const paid = fakePorts();
    await withTicket(paid.ports, "tts", async () => ({ ok: true }), (v) => v.ok);
    expect([paid.log.commit.length, paid.log.release.length]).toEqual([1, 0]);
  });
  it("counts the unit as spent when the charged check itself throws", async () => {
    const { ports, log } = fakePorts();
    await withTicket(ports, "tts", async () => 1, () => { throw new Error("bad predicate"); });
    expect([log.commit.length, log.release.length]).toEqual([1, 0]);
  });
  it("still answers when a commit or a release cannot be delivered", async () => {
    expect(await withTicket(fakePorts({ commitFails: true }).ports, "tts", async () => 7)).toEqual({ ok: true, value: 7 });
    expect(await withTicket(fakePorts({ releaseFails: true }).ports, "tts", async () => { throw new Error("x"); })).toEqual({ ok: false, reason: "failed" });
    expect(await withTicket(fakePorts({ releaseFails: true }).ports, "tts", async () => 7, () => false)).toEqual({ ok: true, value: 7 });
  });
});

describe("withTicket: Property 7, budgets are never exceeded and no call follows a denial", () => {
  it("for any run of requests: a call needs a granted Ticket, makes one call per Ticket and settles every granted Ticket exactly once", async () => {
    const step = fc.record({
      kill: fc.constantFrom(false, false, false, true, "throws" as const),
      grant: fc.constantFrom("ok" as const, "ok" as const, "none" as const, "throws" as const, "wrong" as const),
      call: fc.constantFrom("answers" as const, "answers" as const, "throws" as const),
      charged: fc.boolean(),
      commitFails: fc.boolean(),
      releaseFails: fc.boolean(),
    });
    await fc.assert(
      fc.asyncProperty(fc.array(step, { minLength: 1, maxLength: 30 }), fc.integer({ min: 0, max: 8 }), async (steps, cap) => {
        let granted = 0;
        let calls = 0;
        let open = 0; // Tickets handed out and not yet settled
        let commits = 0;
        let releases = 0;
        let nextId = 0;
        for (const s of steps) {
          const ports: GatePorts = {
            kill: () => { if (s.kill === "throws") throw new Error("x"); return s.kill === true; },
            reserve: async (m) => {
              if (s.grant === "throws") throw new Error("down");
              if (s.grant === "none" || granted >= cap) return null; // a cap: only `cap` Tickets are ever granted
              granted += 1; open += 1;
              return { id: `t${(nextId += 1)}`, meter: s.grant === "wrong" ? "llm" : m, sessionId: "s", issuedAt: 1 };
            },
            commit: async () => { commits += 1; open -= 1; if (s.commitFails) throw new Error("lost"); },
            release: async () => { releases += 1; open -= 1; if (s.releaseFails) throw new Error("lost"); },
          };
          const before = { granted, calls };
          const r = await withTicket(ports, "tts", async () => { calls += 1; if (s.call === "throws") throw new Error("up"); return s.charged; }, (v) => v);
          const newlyGranted = granted - before.granted;
          const newCalls = calls - before.calls;
          expect(newCalls).toBeLessThanOrEqual(1);              // one call per Ticket, at most
          expect(newCalls).toBeLessThanOrEqual(newlyGranted);   // no call without a granted Ticket
          if (!r.ok && (r.reason === "killed" || r.reason === "denied")) expect(newCalls).toBe(0); // no call follows a denial
          expect(open).toBe(0);                                  // every granted Ticket was settled, once, before the answer
        }
        expect(commits + releases).toBe(granted);                // never both, never neither
        expect(granted).toBeLessThanOrEqual(cap);                // the cap is never exceeded
      }),
      { numRuns: 200 },
    );
  });
});
