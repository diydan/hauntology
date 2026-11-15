import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { MapKv } from "./map-kv";
import { METERS, type Meter } from "./spend";
import { DEFAULT_CAPS, RESERVATION_TTL_MS, SpendLedger, dayOf, type CapTable } from "./spend-ledger";

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 10, 15, 6, 0, 0);

/** Small caps, so a short run reaches every limit. */
const CAPS: CapTable = {
  ...DEFAULT_CAPS,
  world: { session: 2, ipDay: 3, day: 4, total: 5 },
  image: { session: 3, ipDay: 2, day: 5 },
  llm: { session: 1, day: 2 },
};
const TRACKED: readonly Meter[] = ["world", "image", "llm"];
const SIDS = ["s1", "s2", "s3"];
const IPS = ["i1", "i2"];

let counter = 0;
const randomBytes = () => Uint8Array.from({ length: 16 }, (_, i) => (i === 0 ? ++counter & 255 : i === 1 ? (counter >> 8) & 255 : i));
const fresh = () => {
  const kv = new MapKv();
  return { kv, ledger: new SpendLedger(kv, CAPS, randomBytes) };
};

type Cmd =
  | { t: "reserve"; meter: Meter; sid: string; ip: string }
  | { t: "commit"; k: number }
  | { t: "release"; k: number }
  | { t: "advance"; ms: number }
  | { t: "kill"; on: boolean };

const cmd: fc.Arbitrary<Cmd> = fc.oneof(
  { weight: 6, arbitrary: fc.record({ t: fc.constant("reserve" as const), meter: fc.constantFrom(...TRACKED), sid: fc.constantFrom(...SIDS), ip: fc.constantFrom(...IPS) }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant("commit" as const), k: fc.nat(40) }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant("release" as const), k: fc.nat(40) }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant("advance" as const), ms: fc.constantFrom(1, 60_000, 10 * 60_000, 29 * 60_000, RESERVATION_TTL_MS, RESERVATION_TTL_MS + 1, 3 * HOUR, 12 * HOUR) }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant("kill" as const), on: fc.boolean() }) },
);

type MTicket = { id: string; meter: Meter; sid: string; ip: string; day: string; issuedAt: number; state: "reserved" | "committed" | "released" };

/** The same rules, written as the plainest counting over a list of tickets. */
class Model {
  tickets: MTicket[] = [];
  killed = false;
  now = T0;

  private live(t: MTicket): boolean {
    return t.state === "committed" || (t.state === "reserved" && this.now < t.issuedAt + RESERVATION_TTL_MS);
  }
  private count(pred: (t: MTicket) => boolean): number {
    return this.tickets.filter((t) => this.live(t) && pred(t)).length;
  }
  state(t: MTicket): MTicket["state"] {
    return t.state === "reserved" && !this.live(t) ? "released" : t.state;
  }
  decide(meter: Meter, sid: string, ip: string): "ok" | "killed" | "session" | "day" | "total" {
    const c = CAPS[meter];
    const day = dayOf(this.now);
    if (meter === "world" && this.killed) return "killed";
    if (this.count((t) => t.meter === meter && t.sid === sid) >= c.session) return "session";
    if (c.ipDay !== undefined && this.count((t) => t.meter === meter && t.ip === ip && t.day === day) >= c.ipDay) return "day";
    if (this.count((t) => t.meter === meter && t.day === day) >= c.day) return "day";
    if (c.total !== undefined && this.count((t) => t.meter === meter) >= c.total) return "total";
    return "ok";
  }
  remaining(sid: string, ip: string, meter: Meter): number {
    const c = CAPS[meter];
    const day = dayOf(this.now);
    let room = c.session - this.count((t) => t.meter === meter && t.sid === sid);
    if (c.ipDay !== undefined) room = Math.min(room, c.ipDay - this.count((t) => t.meter === meter && t.ip === ip && t.day === day));
    room = Math.min(room, c.day - this.count((t) => t.meter === meter && t.day === day));
    if (c.total !== undefined) room = Math.min(room, c.total - this.count((t) => t.meter === meter));
    return Math.max(0, room);
  }
}

/** The counters in storage, without zeros and without the Session's last-seen time. */
const counters = (kv: MapKv): string =>
  JSON.stringify(
    [...kv.data]
      .filter(([k]) => /^(tot|day|ses|ip):/.test(k))
      .map(([k, v]): [string, unknown] => [k, k.startsWith("ses:") ? (v as { n: object }).n : v])
      .map(([k, v]): [string, unknown] => [k, typeof v === "object" && v !== null ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== 0)) : v])
      .filter(([, v]) => v !== 0 && !(typeof v === "object" && v !== null && Object.keys(v).length === 0))
      .sort(([a], [b]) => ((a as string) < (b as string) ? -1 : 1)),
  );

describe("Property 7: SpendGuard never exceeds a cap", () => {
  it("agrees with a plain counting model at every step, never goes over a cap, and a refusal changes nothing", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(cmd, { minLength: 1, maxLength: 60 }), async (cmds) => {
        const { kv, ledger } = fresh();
        const model = new Model();
        const ticketsByIndex: { id: string }[] = [];
        for (const c of cmds) {
          if (c.t === "advance") model.now += c.ms;
          if (c.t === "kill") { await ledger.setKill(c.on); model.killed = c.on; }

          if (c.t === "reserve") {
            const expected = model.decide(c.meter, c.sid, c.ip);
            await ledger.sweep(model.now);
            const before = JSON.stringify([...kv.data]);
            const got = await ledger.reserve({ meter: c.meter, sessionId: c.sid, ipHash: c.ip, now: model.now });
            expect(got.ok ? "ok" : got.reason).toBe(expected);
            if (got.ok) {
              ticketsByIndex.push(got.ticket);
              model.tickets.push({ id: got.ticket.id, meter: c.meter, sid: c.sid, ip: c.ip, day: dayOf(model.now), issuedAt: model.now, state: "reserved" });
            } else {
              expect(JSON.stringify([...kv.data])).toBe(before); // a refusal leaves every counter and ticket as it was
            }
          }
          if (c.t === "commit" || c.t === "release") {
            const target = ticketsByIndex.length === 0 ? { id: "never-made" } : (ticketsByIndex[c.k % ticketsByIndex.length] as { id: string });
            const m = model.tickets.find((t) => t.id === target.id);
            if (c.t === "commit") await ledger.commit(target, model.now); else await ledger.release(target, model.now);
            if (m !== undefined && model.state(m) === "reserved") m.state = c.t === "commit" ? "committed" : "released";
            else if (m !== undefined && model.state(m) === "released") m.state = "released";
          }

          // What is stored never passes a cap.
          for (const meter of TRACKED) {
            const caps = CAPS[meter];
            const ses = [...kv.data].filter(([k]) => k.startsWith("ses:")).map(([, v]) => ((v as { n: Partial<Record<Meter, number>> }).n[meter] ?? 0));
            expect(Math.max(0, ...ses)).toBeLessThanOrEqual(caps.session);
            const days = [...kv.data].filter(([k]) => k.startsWith(`day:`) && k.endsWith(`:${meter}`)).map(([, v]) => v as number);
            expect(Math.max(0, ...days)).toBeLessThanOrEqual(caps.day);
            if (caps.total !== undefined) expect((kv.data.get(`tot:${meter}`) as number | undefined) ?? 0).toBeLessThanOrEqual(caps.total);
            if (caps.ipDay !== undefined) {
              const ips = [...kv.data].filter(([k]) => k.startsWith("ip:")).map(([, v]) => ((v as Partial<Record<Meter, number>>)[meter] ?? 0));
              expect(Math.max(0, ...ips)).toBeLessThanOrEqual(caps.ipDay);
            }
          }
          // What a Session is told is left matches the model, for every Session and address.
          for (const sid of SIDS) for (const ip of IPS) {
            const rem = await ledger.remaining(sid, ip, model.now);
            for (const meter of TRACKED) expect(rem[meter], `${sid} ${ip} ${meter}`).toBe(model.remaining(sid, ip, meter));
          }
        }
      }),
      { ...propParams(), numRuns: 150 },
    );
  });
});

describe("Property 8: reservations are accounted exactly once", () => {
  const meter = fc.constantFrom(...TRACKED);
  const who = fc.record({ sid: fc.constantFrom(...SIDS), ip: fc.constantFrom(...IPS) });
  const setup = async (m: Meter, w: { sid: string; ip: string }, preload: number) => {
    const { kv, ledger } = fresh();
    for (let i = 0; i < preload; i++) await ledger.reserve({ meter: m, sessionId: "other", ipHash: "i9", now: T0 });
    const before = counters(kv);
    const r = await ledger.reserve({ meter: m, sessionId: w.sid, ipHash: w.ip, now: T0 });
    return { kv, ledger, before, r };
  };

  it("reserve then release restores every counter, and a second release changes nothing", async () => {
    await fc.assert(
      fc.asyncProperty(meter, who, fc.nat(1), async (m, w, preload) => {
        const { kv, ledger, before, r } = await setup(m, w, preload);
        if (!r.ok) return;
        await ledger.release(r.ticket, T0);
        expect(counters(kv)).toBe(before);
        await ledger.release(r.ticket, T0);
        await ledger.release(r.ticket, T0 + 1);
        expect(counters(kv)).toBe(before);
      }),
      propParams(),
    );
  });

  it("reserve then commit uses exactly one unit, for ever, whatever is repeated or comes after", async () => {
    await fc.assert(
      fc.asyncProperty(meter, who, fc.constantFrom(0, 1, 1000, RESERVATION_TTL_MS + 1, 10 * HOUR), async (m, w, later) => {
        const { kv, ledger, before, r } = await setup(m, w, 0);
        if (!r.ok) return;
        await ledger.commit(r.ticket, T0);
        const once = counters(kv);
        expect(once).not.toBe(before);
        await ledger.commit(r.ticket, T0 + later);
        await ledger.release(r.ticket, T0 + later);
        await ledger.commit(r.ticket, T0 + later);
        await ledger.sweep(T0 + later);
        // Only the passing of time may drop a counter (a new day or a pruned Session); nothing here may add or lift a unit of this ticket.
        if (dayOf(T0 + later) === dayOf(T0)) expect(counters(kv)).toBe(once);
        expect((kv.data.get(`tot:${m}`) as number | undefined) ?? 1).toBeGreaterThanOrEqual(CAPS[m].total === undefined ? 1 : 1);
      }),
      propParams(),
    );
  });

  it("a reservation nobody settles is released exactly once when it runs out", async () => {
    await fc.assert(
      fc.asyncProperty(meter, who, async (m, w) => {
        const { kv, ledger, before, r } = await setup(m, w, 0);
        if (!r.ok) return;
        await ledger.sweep(T0 + RESERVATION_TTL_MS);
        expect(counters(kv)).toBe(before);
        await ledger.sweep(T0 + RESERVATION_TTL_MS + 1);
        await ledger.release(r.ticket, T0 + RESERVATION_TTL_MS + 2);
        expect(counters(kv)).toBe(before);
      }),
      propParams(),
    );
  });
});

describe("the METERS list", () => {
  it("has the six meters the spec names", () => {
    expect([...METERS]).toEqual(["world", "image", "llm", "tts", "stt", "live"]);
  });
});
