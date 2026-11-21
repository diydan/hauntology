import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { consentEventArb, clipArb } from "../voice/stitch/stitch.arb";
import type { StitchClip } from "../voice/stitch/compose";
import { CLIP_TTL_MS, INITIAL_STITCH_STATE, recordConsent, stitchBlocksStart, stitchEnabled, stitchLifecycle, stitchSchedule, type StitchState } from "./stitch";
import { STARTER_TEMPLATES } from "../voice/stitch/templates";

const clipsFor = (seat: number, words: readonly string[], at = 1000): StitchClip[] => words.map((word) => ({ seat, word, bytes: new Uint8Array([1]), durationMs: 500, recordedAt: at, contentType: "audio/webm" }));

describe("Property 43: Stitch is off, then each Player's own yes", () => {
  // Feature: party-mode, Property 43: Stitch is off, then each Player's own yes
  // Validates: Requirements 18.1, 18.2
  it("starts off, and no sequence of Master, Bot or other-seat messages ever gives a seat a yes it did not say itself", () => {
    expect(stitchEnabled(INITIAL_STITCH_STATE)).toBe(false);
    fc.assert(fc.property(fc.array(consentEventArb, { maxLength: 25 }), (events) => {
      let state: StitchState = INITIAL_STITCH_STATE;
      const said = new Set<number>();
      for (const e of events) {
        if (e.t === "answer" && state.enabled && !e.isBot && e.actorSeat === e.seat && e.yes && e.tick) said.add(e.seat);
        if (e.t === "answer" && e.actorSeat === e.seat && !(e.yes && e.tick)) said.delete(e.seat);
        if (e.t === "leave" || (e.t === "master_switch" && e.actorIsMaster && !e.on)) { if (e.t === "leave") said.delete(e.seat); else said.clear(); }
        state = recordConsent(state, e).state;
        for (const c of state.consents) if (c.yes && c.ageOrGuardianTick && !said.has(c.seat)) return false;
        if (!state.enabled && state.consents.length > 0) return false;
      }
      return true;
    }), propParams());
  });
  it("lets the Master switch it on but not say yes for anyone, and deletes a seat's clips at once when it leaves", () => {
    let r = recordConsent(INITIAL_STITCH_STATE, { t: "master_switch", actorIsMaster: true, on: true });
    expect(stitchEnabled(r.state)).toBe(true);
    r = recordConsent(r.state, { t: "answer", actorSeat: 0, seat: 2, isBot: false, yes: true, tick: true });
    expect(r.state.consents).toEqual([]);
    r = recordConsent(r.state, { t: "answer", actorSeat: 2, seat: 2, isBot: false, yes: true, tick: false });
    expect(r.state.consents).toEqual([{ seat: 2, yes: true, ageOrGuardianTick: false }]); // the tick is kept as a yes or no
    expect(recordConsent(r.state, { t: "leave", seat: 2 }).deleteClipsFor).toEqual([2]);
  });
});

describe("Property 44: Stitched lines are rare and never at the wrong moment", () => {
  // Feature: party-mode, Property 44: Stitched lines are rare and never at the wrong moment
  // Validates: Requirements 18.4
  const seat = (n: number) => ({ seat: n, consent: { seat: n, yes: true, ageOrGuardianTick: true }, clips: clipsFor(n, ["wait", "here"]) });
  const base = { kind: "haunt_event" as const, gameElapsedMs: 90_000, accusationActive: false, roundStitches: 0, gameStitches: 0, lastSeat: null, seats: [seat(1), seat(2)], enabled: true };
  it("allows a line at a Haunt Event or midnight only, never early, never during the reveal, one a Round, two a game, not the same Player twice", () => {
    expect(stitchSchedule(base, () => 0.1).ok).toBe(true);
    expect(stitchSchedule({ ...base, kind: "midnight" }, () => 0.1).ok).toBe(true);
    expect(stitchSchedule({ ...base, kind: "other" }, () => 0.1).ok).toBe(false);
    expect(stitchSchedule({ ...base, gameElapsedMs: 59_999 }, () => 0.1).ok).toBe(false);
    expect(stitchSchedule({ ...base, accusationActive: true }, () => 0.1).ok).toBe(false);
    expect(stitchSchedule({ ...base, roundStitches: 1 }, () => 0.1).ok).toBe(false);
    expect(stitchSchedule({ ...base, gameStitches: 2 }, () => 0.1).ok).toBe(false);
    const again = stitchSchedule({ ...base, lastSeat: 1 }, () => 0.1);
    expect(again.ok && again.seat).toBe(2);
    expect(stitchSchedule({ ...base, lastSeat: 2, seats: [seat(2)] }, () => 0.1).ok).toBe(false);
    expect(STARTER_TEMPLATES.length).toBeGreaterThan(0);
  });
  it("never waits for a clip to start", () => {
    expect(stitchBlocksStart()).toBe(false);
  });
});

describe("Property 45: Stitch clips stay in the room and are revealed at the end", () => {
  // Feature: party-mode, Property 45: Stitch clips stay in the room and are revealed at the end
  // Validates: Requirements 18.3, 18.5
  const consents = [{ seat: 1, yes: true, ageOrGuardianTick: true }, { seat: 2, yes: true, ageOrGuardianTick: false }];
  const ctx = { gameOver: false, enabled: true, activeSeats: new Set([1, 2]), consents };
  it("keeps only clips of Players who are present with a full yes and under six hours, and says when the next one expires", () => {
    fc.assert(fc.property(fc.array(clipArb, { maxLength: 12 }), fc.integer({ min: 1_000, max: 10_000_000 + CLIP_TTL_MS * 2 }), (clips, now) => {
      const r = stitchLifecycle(clips, ctx, [], now);
      const ok = r.keep.every((c) => c.seat === 1 && now >= c.recordedAt && now - c.recordedAt < CLIP_TTL_MS);
      const next = r.nextWakeMs;
      return ok && (r.keep.length === 0 ? next === null : next === Math.min(...r.keep.map((c) => c.recordedAt)) + CLIP_TTL_MS) && r.reveal.length === 0;
    }), propParams());
  });
  it("deletes everything when the game is over or Stitch is off, and reveals each played line and whose words it used at the end only", () => {
    const clips = clipsFor(1, ["wait", "here"]);
    const played = [{ eventId: "e1", seat: 1, templateId: "tpl-2", subtitle: "wait here", at: 5000 }];
    expect(stitchLifecycle(clips, { ...ctx, gameOver: true }, played, 2000)).toEqual({ keep: [], nextWakeMs: null, reveal: played });
    expect(stitchLifecycle(clips, { ...ctx, enabled: false }, played, 2000).keep).toEqual([]);
    expect(stitchLifecycle(clips, ctx, played, 2000).reveal).toEqual([]);
    expect(stitchLifecycle(clips, { ...ctx, activeSeats: new Set([2]) }, [], 2000).keep).toEqual([]);
  });
});
