import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { ErrorCode } from "../errors";
import { PLAIN_INSPECT_MS, lockCharge } from "./charge";
import {
  ackSight, closeLock, initPartyLocks, inspectPlan, openLock, publicLockView, sightIdOf, sightsOnEntry, submitAttempt,
  type PartyLocks, type SightDelivery,
} from "./inspect";
import { makeLock } from "./make";
import { placePuzzles, type PlacedLock } from "./place";
import { seedArb } from "./puzzles.arb";
import { sightFor } from "./sight";
import { isMemoryKind } from "./types";
import { referenceSolve } from "./verify";

const CAP = 25_000;
const zonesArb = fc.uniqueArray(fc.constantFrom("Hall", "Library", "Kitchen", "Attic", "Cellar", "Garden", "Study", "Porch"), { minLength: 2, maxLength: 6 });
const settingArb = fc.constantFrom("easy" as const, "normal" as const);
const fixtureArb = fc.tuple(seedArb, zonesArb, settingArb).map(([seed, zones, setting]) => {
  const res = placePuzzles(seed, zones, setting);
  if (!res.ok) throw new Error("placement failed");
  return { zones, setting, placed: res.value };
});

/** A stand-in for party-mode: a world the puzzles must never touch, and an `inspect()` that records its calls. */
function world(zones: readonly string[], seed: number) {
  const w = { solution: ["ghost", "Hall", "key"], hands: { s1: [1, 2, 3], s2: [4, 5, 6] }, haunt: seed % 10, resolve: 3, bonus: 10, residue: Object.fromEntries(zones.map((z, i) => [z, (i + seed) % 3 === 0 ? null : 100 + i])) };
  const log: string[] = [];
  const inspected = new Set<string>();
  const inspect = (zone: string) => () => { log.push(zone); inspected.add(zone); return { zone, card: w.residue[zone] ?? null }; };
  return { w, snapshot: () => JSON.stringify(w), log, inspected, inspect };
}
const tOf = (p: PlacedLock) => referenceSolve(makeLock(p.kind, p.level, p.seed));

describe("Property 6: A solved Lock gives what a plain Inspect gives, and a failed one gives nothing", () => {
  // Feature: puzzles, Property 6: A solved Lock gives what a plain Inspect gives, and a failed one gives nothing
  // Validates: Requirements 1.2, 1.3, 7.4
  it("a solved Lock returns exactly the party-mode result, calls it once, and changes nothing else", () => {
    fc.assert(
      fc.property(fixtureArb, seedArb, fc.nat(5), (fx, seed, pick) => {
        const p = fx.placed[pick % fx.placed.length] as PlacedLock;
        const env = world(fx.zones, seed);
        const before = env.snapshot();
        const state = initPartyLocks(fx.placed);
        const opened = openLock(state, "s1", p.zone, 0, { setting: fx.setting, capMs: CAP, isBot: false });
        if (!opened.ok) return false;
        if (JSON.stringify(opened.value.publicLine) !== JSON.stringify({ type: "inspect", seat: "s1", zone: p.zone })) return false;
        const res = submitAttempt(opened.value.state, "s1", p.lockId, tOf(p), 12_000, { inspect: env.inspect(p.zone), capMs: CAP });
        if (!res.ok || res.value.outcome !== "solved") return false;
        const plain = { zone: p.zone, card: env.w.residue[p.zone] ?? null }; // what a plain Inspect shows
        return JSON.stringify(res.value.inspectResult) === JSON.stringify(plain) && env.log.length === 1 && env.snapshot() === before
          && res.value.chargeMs === lockCharge(12_000, CAP) && res.value.state.open["s1"] === null;
      }),
      propParams(),
    );
  });

  it("a failed Lock (three wrong, give up, Cap, end of Turn) shows nothing, calls nothing and leaves the Zone un-inspected", () => {
    fc.assert(
      fc.property(fixtureArb, seedArb, fc.constantFrom<"attempts" | "gave_up" | "cap" | "turn_ended">("attempts", "gave_up", "cap", "turn_ended"), (fx, seed, how) => {
        const p = fx.placed[0] as PlacedLock;
        const env = world(fx.zones, seed);
        const before = env.snapshot();
        let state: PartyLocks = initPartyLocks(fx.placed);
        const opened = openLock(state, "s1", p.zone, 0, { setting: fx.setting, capMs: CAP, isBot: false });
        if (!opened.ok) return false;
        state = opened.value.state;
        let result: { outcome: string; inspectResult?: unknown } | null = null;
        if (how === "attempts") {
          for (let i = 0; i < 3; i++) {
            const r = submitAttempt(state, "s1", p.lockId, { kind: "nonsense" }, 2000 + i * 1000, { inspect: env.inspect(p.zone), capMs: CAP });
            if (!r.ok) return false;
            state = r.value.state;
            result = r.value;
          }
        } else if (how === "cap") {
          const r = submitAttempt(state, "s1", p.lockId, tOf(p), CAP + 1, { inspect: env.inspect(p.zone), capMs: CAP });
          if (!r.ok) return false;
          result = r.value;
        } else {
          const r = closeLock(state, "s1", how, 9000, CAP);
          if (!r.ok) return false;
          result = { outcome: "failed" };
        }
        return result?.outcome === "failed" && !("inspectResult" in result) && env.log.length === 0 && env.inspected.size === 0 && env.snapshot() === before;
      }),
      propParams(),
    );
  });
});

describe("Property 8 (party half): with the setting off, nothing changes", () => {
  // Feature: puzzles, Property 8: With the setting off, nothing changes
  // Validates: Requirements 1.1, 2.1
  it("plans a plain Inspect and opens no Lock, for any seat and any state", () => {
    fc.assert(
      fc.property(fixtureArb, fc.boolean(), fc.double({ min: 0, max: 99_999, noNaN: true }), (fx, isBot, now) => {
        const state = initPartyLocks(fx.placed);
        const plan = inspectPlan("off", state, "s1", isBot, CAP);
        if (plan.mode !== "plain" || plan.chargeMs !== PLAIN_INSPECT_MS) return false;
        const p = fx.placed[0] as PlacedLock;
        const res = openLock(state, "s1", p.zone, now, { setting: "off", capMs: CAP, isBot });
        return !res.ok && res.code === ErrorCode.puzzle_disabled;
      }),
      propParams(),
    );
  });
});

describe("Property 11: Three wrong Attempts end a Lock and say nothing more", () => {
  // Feature: puzzles, Property 11: Three wrong Attempts end a Lock and say nothing more
  // Validates: Requirements 1.3, 7.3
  it("counts 2, 1, then closes the Lock failed; says only how many are left; refuses a fourth and a rushed one", () => {
    fc.assert(
      fc.property(fixtureArb, fc.array(fc.anything(), { minLength: 3, maxLength: 3 }), (fx, junk) => {
        const p = fx.placed[0] as PlacedLock;
        let state: PartyLocks = initPartyLocks(fx.placed);
        const opened = openLock(state, "s1", p.zone, 0, { setting: fx.setting, capMs: CAP, isBot: false });
        if (!opened.ok) return false;
        state = opened.value.state;
        const ctx = { inspect: () => "never", capMs: CAP };
        const left: number[] = [];
        for (let i = 0; i < 2; i++) {
          const r = submitAttempt(state, "s1", p.lockId, junk[i], 2000 + i * 1000, ctx);
          if (!r.ok || r.value.outcome !== "wrong") return false;
          if (Object.keys(r.value).sort().join() !== "attemptsLeft,outcome,state") return false; // no count of right parts
          left.push(r.value.attemptsLeft);
          state = r.value.state;
          const rushed = submitAttempt(state, "s1", p.lockId, junk[i], 2000 + i * 1000 + 500, ctx); // under a second after
          if (rushed.ok || rushed.code !== ErrorCode.puzzle_rate_limited) return false;
        }
        const third = submitAttempt(state, "s1", p.lockId, junk[2], 4000, ctx);
        if (!third.ok || third.value.outcome !== "failed" || third.value.reason !== "attempts") return false;
        const fourth = submitAttempt(third.value.state, "s1", p.lockId, junk[2], 6000, ctx);
        return left.join() === "2,1" && !fourth.ok && fourth.code === ErrorCode.puzzle_not_open;
      }),
      propParams(),
    );
  });
});

describe("Property 10: Sights stay private and survive a reconnect", () => {
  // Feature: puzzles, Property 10: Sights stay private and survive a reconnect
  // Validates: Requirements 6.1, 6.5, 6.6, 13.2
  type Op = { t: "enter"; seat: string; zone: number } | { t: "ack"; seat: string } | { t: "reconnect" };
  const opArb: fc.Arbitrary<Op> = fc.oneof(
    fc.record({ t: fc.constant("enter" as const), seat: fc.constantFrom("s1", "s2", "s3"), zone: fc.nat(5) }),
    fc.record({ t: fc.constant("ack" as const), seat: fc.constantFrom("s1", "s2", "s3") }),
    fc.record({ t: fc.constant("reconnect" as const) }),
  );

  it("sends a Sight only to its seat, at most once after the ack, again if unacknowledged, and never in the public view", () => {
    fc.assert(
      fc.property(fixtureArb, fc.array(opArb, { maxLength: 40 }), (fx, ops) => {
        let state = initPartyLocks(fx.placed);
        const acked: Record<string, Set<string>> = { s1: new Set(), s2: new Set(), s3: new Set() };
        const pending: Record<string, SightDelivery | null> = { s1: null, s2: null, s3: null };
        for (const op of ops) {
          if (op.t === "reconnect") { state = JSON.parse(JSON.stringify(state)) as PartyLocks; continue; } // the seat's record survives
          if (op.t === "enter") {
            const zone = fx.zones[op.zone % fx.zones.length] as string;
            const holder = fx.placed.find((l) => l.sightZone === zone && isMemoryKind(l.kind));
            const r = sightsOnEntry(state, op.seat, zone);
            state = r.state;
            if (holder === undefined) { if (r.delivery !== null) return false; continue; }
            const id = sightIdOf(holder.lockId);
            if (acked[op.seat]?.has(id)) { if (r.delivery !== null) return false; continue; } // never shown twice
            if (r.delivery === null || r.delivery.sightId !== id) return false; // sent, or sent again
            const want = sightFor(makeLock(holder.kind, holder.level, holder.seed));
            if (JSON.stringify(r.delivery.sight) !== JSON.stringify(want)) return false;
            pending[op.seat] = r.delivery;
          } else {
            const d = pending[op.seat];
            if (!d) continue;
            const r = ackSight(state, op.seat, d.sightId);
            if (!r.ok) return false;
            state = r.value;
            acked[op.seat]?.add(d.sightId);
            pending[op.seat] = null;
          }
        }
        // other seats never gain a record from someone else's ack
        for (const seat of ["s1", "s2", "s3"]) if (new Set(state.seen[seat] ?? []).size !== acked[seat]?.size) return false;
        const publicText = JSON.stringify(publicLockView(fx.setting));
        return publicText === JSON.stringify({ puzzleSetting: fx.setting }) && !/payload|sight|order|code|picture|shelf/i.test(publicText);
      }),
      propParams(),
    );
  });
});
