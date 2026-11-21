import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { estimateOffset, levelAt, LIGHT_KINDS, lightCue, lightSync, MAX_LIGHT_LEVEL, MAX_LIGHT_MS, MIN_STEP_GAP_MS, type LightTarget, type PingSample } from "./light";
import { LENS_MIN_FRAME_MS, LENS_RIPPLES, lensData, lensPlan } from "./lens";
import type { PrivateView, PublicEvent, PublicView } from "./views";

const eventArb: fc.Arbitrary<PublicEvent> = fc.oneof(
  fc.record({ id: fc.nat(500), kind: fc.constant("inspect" as const), seat: fc.integer({ min: 1, max: 6 }), zone: fc.constantFrom("z1", "z2", "z3") }),
  fc.record({ id: fc.nat(500), kind: fc.constant("phone-cue" as const), target: fc.integer({ min: 1, max: 6 }), cue: fc.constantFrom("creak", "bell") }),
  fc.record({ id: fc.nat(500), kind: fc.constant("rattle" as const), target: fc.integer({ min: 1, max: 6 }) }),
  fc.record({ id: fc.nat(500), kind: fc.constant("suggest" as const), seat: fc.integer({ min: 1, max: 6 }), zone: fc.constant("z1"), suspect: fc.constant("s1"), relic: fc.constant("r1"), refuter: fc.constant(null) }),
) as fc.Arbitrary<PublicEvent>;
const pubArb = fc.array(eventArb, { maxLength: 40 }).map((events): PublicView => ({
  phase: "playing", suspects: [], zones: [], relics: [], players: [], events,
  ending: null,
}));
const privArb: fc.Arbitrary<PrivateView> = fc.record({
  seat: fc.integer({ min: 1, max: 6 }), hand: fc.array(fc.constantFrom("s1", "z2", "r3").map((id) => ({ kind: "suspect" as const, id })), { maxLength: 3 }),
  shownToMe: fc.array(fc.constantFrom("s4", "r5"), { maxLength: 2 }), found: fc.array(fc.constantFrom("z6", "r1"), { maxLength: 2 }), resolve: fc.nat(3), soundConsent: fc.boolean(),
}) as fc.Arbitrary<PrivateView>;

describe("Property 39: The Spirit lens draws only from what the phone may already see", () => {
  // Feature: party-mode, Property 39: The Spirit lens draws only from what the phone may already see
  // Validates: Requirements 16.2
  it("carries the Player's own known cards, only their own inspected Zones, and at most the last six ripples", () => {
    fc.assert(fc.property(privArb, pubArb, (priv, pub) => {
      const d = lensData(priv, pub);
      const own = new Set([...priv.hand.map((c) => c.id), ...priv.shownToMe, ...priv.found]);
      if (d.known.length !== own.size || !d.known.every((c) => own.has(c))) return false;
      const mine = new Set(pub.events.flatMap((e) => (e.kind === "inspect" && e.seat === priv.seat ? [e.zone] : [])));
      if (d.inspected.length !== mine.size || !d.inspected.every((z) => mine.has(z))) return false;
      if (d.ripples.length > LENS_RIPPLES) return false;
      const ids = new Set(pub.events.filter((e) => e.kind === "phone-cue" || e.kind === "rattle").map((e) => e.id));
      return d.ripples.every((r) => ids.has(r.eventId)) && Object.keys(d).sort().join() === "inspected,known,ripples";
    }), propParams());
  });
  it("never reads the ending or the Solution, even when the game is over", () => {
    const priv: PrivateView = { seat: 1, hand: [], shownToMe: [], found: [], resolve: 0, soundConsent: false };
    const pub: PublicView = { phase: "ended", suspects: [], zones: [], relics: [], players: [], events: [], ending: { solution: { suspect: "SECRET-S", zone: "SECRET-Z", relic: "SECRET-R" }, residueAt: { z1: "SECRET-CARD" }, sources: [{ eventId: 1, kind: "frame", from: 4 }] } };
    expect(JSON.stringify(lensData(priv, pub))).not.toContain("SECRET");
  });
});

describe("Property 40: The Spirit lens obeys its limits", () => {
  // Feature: party-mode, Property 40: The Spirit lens obeys its limits
  // Validates: Requirements 16.1, 16.3, 16.4
  it("draws at most 30 frames a second, never face down or hidden, fixed without sensors, and never uses the camera", () => {
    fc.assert(fc.property(fc.record({ sensors: fc.boolean(), faceDown: fc.boolean(), hidden: fc.boolean(), reducedMotion: fc.boolean(), now: fc.nat(1e9), tapped: fc.boolean(), calibratedAtMs: fc.option(fc.nat(1e9), { nil: null }) }), (i) => {
      const p = lensPlan(i);
      if (p.frameIntervalMs < LENS_MIN_FRAME_MS || p.usesCamera !== false) return false;
      if (p.draw !== (!i.faceDown && !i.hidden)) return false;
      if (!i.sensors && !p.fixedView) return false;
      if (i.reducedMotion && (!p.fixedView || p.frameIntervalMs <= LENS_MIN_FRAME_MS)) return false;
      if (!i.sensors && p.calibratedAtMs !== (i.calibratedAtMs ?? null)) return false;
      return i.sensors && i.tapped ? p.calibratedAtMs === i.now : p.calibratedAtMs === (i.calibratedAtMs ?? null);
    }), propParams());
  });
  it("calibrates again on a second tap", () => {
    const a = lensPlan({ sensors: true, faceDown: false, hidden: false, reducedMotion: false, now: 1000, tapped: true });
    const b = lensPlan({ sensors: true, faceDown: false, hidden: false, reducedMotion: false, now: 9000, tapped: true, calibratedAtMs: a.calibratedAtMs });
    expect([a.calibratedAtMs, b.calibratedAtMs]).toEqual([1000, 9000]);
  });
});

const targetsArb = fc.uniqueArray(fc.integer({ min: 1, max: 6 }), { maxLength: 6 }).chain((seats) =>
  fc.tuple(...seats.map((seat) => fc.record({ seat: fc.constant(seat), consent: fc.boolean(), reducedMotion: fc.boolean() }))),
) as fc.Arbitrary<LightTarget[]>;

describe("Property 41: Light cues stay inside the limits", () => {
  // Feature: party-mode, Property 41: Light cues stay inside the limits
  // Validates: Requirements 17.1, 17.2, 17.3
  it("uses greys below full white, at most two changes in any second, at most six seconds, in seat order, for consenting phones only", () => {
    fc.assert(fc.property(fc.constantFrom(...LIGHT_KINDS), targetsArb, fc.nat(1e9), (kind, targets, start) => {
      const out = lightCue(kind, targets, start, false);
      const want = targets.filter((t) => t.consent && !t.reducedMotion).map((t) => t.seat).sort((a, b) => a - b);
      if (out.map((s) => s.seat).join() !== want.join()) return false;
      return out.every((s) => {
        if (s.startAtMs !== start || s.steps.length === 0) return false;
        if (!s.steps.every((st) => st.level >= 0 && st.level <= MAX_LIGHT_LEVEL && st.atMs >= 0 && st.atMs <= MAX_LIGHT_MS)) return false;
        if (Object.keys(s.steps[0] as object).sort().join() !== "atMs,level") return false;
        for (let i = 1; i < s.steps.length; i++) if ((s.steps[i]!.atMs - s.steps[i - 1]!.atMs) < MIN_STEP_GAP_MS) return false;
        for (let i = 0; i < s.steps.length; i++) { const n = s.steps.filter((x) => x.atMs >= s.steps[i]!.atMs && x.atMs < s.steps[i]!.atMs + 1000).length; if (n > 2) return false; }
        return true;
      });
    }), propParams());
  });
  it("gives nothing under reduced motion, and fades with no jump (the level between two steps is the straight line)", () => {
    const t: LightTarget[] = [{ seat: 1, consent: true, reducedMotion: false }];
    expect(lightCue("wave", t, 0, true)).toEqual([]);
    const [s] = lightCue("glow", t, 0, false);
    expect(levelAt(s!.steps, 750)).toBeCloseTo(0.225, 5);
    expect(levelAt(s!.steps, 99_999)).toBe(0);
  });
  it("sends a wave across the seats one after another", () => {
    const out = lightCue("wave", [3, 1, 2].map((seat) => ({ seat, consent: true, reducedMotion: false })), 0, false);
    expect(out.map((s) => [s.seat, s.steps[0]!.atMs])).toEqual([[1, 0], [2, 600], [3, 1200]]);
  });
});

const sampleArb: fc.Arbitrary<PingSample> = fc.record({ sentMs: fc.integer({ min: 0, max: 1e6 }), serverMs: fc.integer({ min: 0, max: 1e6 }), receivedMs: fc.integer({ min: 0, max: 1e6 }) });

describe("Property 42: Cue starts are ahead of now and late phones are dropped", () => {
  // Feature: party-mode, Property 42: Cue starts are ahead of now and late phones are dropped
  // Validates: Requirements 17.4
  it("estimates the offset as the median, and recovers a known offset from clean exchanges", () => {
    const samples = [10, 20, 15].map((rtt, k): PingSample => ({ sentMs: k * 1000, receivedMs: k * 1000 + rtt, serverMs: k * 1000 + rtt / 2 + 700 }));
    expect(estimateOffset(samples)).toEqual({ offsetMs: 700, errorMs: 0 });
    expect(estimateOffset([])).toBeNull();
    expect(estimateOffset([{ sentMs: 5, receivedMs: 1, serverMs: 3 }, { sentMs: Number.NaN, receivedMs: 1, serverMs: 3 }])).toBeNull();
  });
  it("bounds the median by the extremes, and keeps the error non-negative", () => {
    fc.assert(fc.property(fc.array(sampleArb, { minLength: 1, maxLength: 12 }), (samples) => {
      const e = estimateOffset(samples);
      const valid = samples.filter((s) => s.receivedMs >= s.sentMs).slice(-5).map((s) => s.serverMs - (s.sentMs + s.receivedMs) / 2);
      if (valid.length === 0) return e === null;
      return e !== null && e.errorMs >= 0 && e.offsetMs >= Math.min(...valid) && e.offsetMs <= Math.max(...valid);
    }), propParams());
  });
  it("starts every kept phone at least 500 ms after now (on the server clock), and drops phones over 150 ms of error or with no estimate", () => {
    fc.assert(fc.property(fc.nat(1e9), fc.array(fc.record({ offsetMs: fc.integer({ min: -5000, max: 5000 }), errorMs: fc.integer({ min: 0, max: 400 }), has: fc.boolean() }), { maxLength: 6 }), (now, ps) => {
      const phones = ps.map((p, i) => ({ seat: i + 1, offset: p.has ? { offsetMs: p.offsetMs, errorMs: p.errorMs } : null }));
      const r = lightSync(now, phones);
      if (r.commonStartMs < now + 500) return false;
      const droppedWant = phones.filter((p) => p.offset === null || p.offset.errorMs > 150).map((p) => p.seat);
      if (r.dropped.join() !== droppedWant.join() || r.starts.length + r.dropped.length !== phones.length) return false;
      return r.starts.every((s) => { const p = phones[s.seat - 1]!; return s.startOnPhoneMs + (p.offset as { offsetMs: number }).offsetMs === r.commonStartMs; });
    }), propParams());
    expect(lightSync(1000, [], 10).commonStartMs).toBe(1500);
    const edge = lightSync(0, [{ seat: 1, offset: { offsetMs: 0, errorMs: 150 } }, { seat: 2, offset: { offsetMs: 0, errorMs: 151 } }]);
    expect([edge.starts.map((s) => s.seat), edge.dropped]).toEqual([[1], [2]]);
  });
  it("takes the mean of the two middle offsets when the count is even", () => {
    const at = (offset: number): PingSample => ({ sentMs: 0, receivedMs: 0, serverMs: offset });
    expect(estimateOffset([at(0), at(10), at(20), at(100)])).toEqual({ offsetMs: 15, errorMs: 100 });
    expect(estimateOffset([at(4), at(8), at(6)])).toEqual({ offsetMs: 6, errorMs: 4 });
  });
});
