import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { CUE_GAP_MS, MAX_CUES_PER_TURN, MAX_PLAYING, canCue, type PhoneSeat } from "./cues";
import { BECOMING_MS, becoming, canRattle, countRattle, NO_PROMPTS, RATTLE_LINES, RATTLE_MAX_VOLUME, rattleDelivery, rattleDenied, rattleIntensity, rattleOffer, rattlePrompts, resetRattles, shakeDetect, type PromptState, type RattleSeat, type Reading } from "./rattle";

const readingArb = fc.record({ atMs: fc.integer({ min: 0, max: 5000 }), a: fc.oneof(fc.double({ min: -40, max: 40, noNaN: true }), fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)) });

describe("Property 46: A deliberate shake is three swings in 1.5 seconds", () => {
  // Feature: party-mode, Property 46: A deliberate shake is three swings in 1.5 seconds
  // Validates: Requirements 19.1, 19.3
  const swing = (t: number, dir: 1 | -1): Reading => ({ atMs: t, a: 20 * dir });
  it("reports a Rattle for three alternating swings inside 1.5 s, and for no fewer", () => {
    expect(shakeDetect([swing(100, 1), swing(400, -1), swing(700, 1)], 800).rattle).toBe(true);
    expect(shakeDetect([swing(100, 1), swing(400, -1)], 800).rattle).toBe(false);
    expect(shakeDetect([swing(100, 1), swing(400, -1), swing(1700, 1)], 1800).rattle).toBe(false); // 1.6 s apart
    expect(shakeDetect([swing(100, 1), swing(400, -1), swing(1600, 1)], 1600).rattle).toBe(true); // exactly 1.5 s
  });
  it("ignores a single bump, a long push one way, weak readings, and readings that are not numbers", () => {
    expect(shakeDetect([swing(100, 1)], 200)).toEqual({ rattle: false, swings: 1 });
    expect(shakeDetect([swing(100, 1), swing(200, 1), swing(300, 1), swing(400, 1)], 500).rattle).toBe(false);
    expect(shakeDetect([100, 400, 700].map((t, i) => ({ atMs: t, a: i % 2 === 0 ? 5 : -5 })), 800).rattle).toBe(false);
    expect(shakeDetect([{ atMs: 100, a: Number.NaN }, { atMs: 200, a: Number.POSITIVE_INFINITY }, swing(300, 1), swing(400, -1)], 500).swings).toBe(2);
  });
  it("only ever reports a Rattle when three strong swings of alternating sign lie inside 1.5 s (brute force)", () => {
    fc.assert(fc.property(fc.array(readingArb, { maxLength: 14 }), fc.integer({ min: 0, max: 6000 }), (rs, now) => {
      const r = shakeDetect(rs, now);
      const strong = rs.filter((x) => Number.isFinite(x.a) && Math.abs(x.a) >= 12 && x.atMs <= now && now - x.atMs <= 1500).sort((p, q) => p.atMs - q.atMs);
      let brute = false;
      for (let i = 0; i < strong.length; i++) for (let j = i + 1; j < strong.length; j++) for (let k = j + 1; k < strong.length; k++) {
        const [x, y, z] = [strong[i]!, strong[j]!, strong[k]!];
        if (Math.sign(x.a) !== Math.sign(y.a) && Math.sign(y.a) !== Math.sign(z.a) && z.atMs - x.atMs <= 1500) brute = true;
      }
      return r.rattle === brute;
    }), propParams());
  });
  it("offers Rattle only to a Poltergeist with the switch on, asks first, and falls back to the button without sensors", () => {
    const p = { bot: false, poltergeist: true, rattleOn: false };
    expect(rattleOffer(p, true, true)).toEqual({ offered: false, askToTurnOn: true, via: [] });
    expect(rattleOffer({ ...p, rattleOn: true }, true, true).via).toEqual(["shake", "button"]);
    expect(rattleOffer({ ...p, rattleOn: true }, true, false).via).toEqual(["button"]);
    expect(rattleOffer({ ...p, poltergeist: false }, true, true).offered).toBe(false);
    expect(rattleOffer({ ...p, rattleOn: true }, false, true)).toEqual({ offered: false, askToTurnOn: false, via: [] });
    expect(rattleOffer({ ...p, bot: true, rattleOn: true }, true, true).offered).toBe(false);
  });
});

const seatOk: RattleSeat = { seat: 4, bot: false, poltergeist: true, rattleOn: true, lastCueMs: null };

describe("Property 47: Rattle shares every Cue limit", () => {
  // Feature: party-mode, Property 47: Rattle shares every Cue limit
  // Validates: Requirements 19.2
  it("is refused exactly when the Cue rules refuse the same gesture, plus the opt-in rules", () => {
    fc.assert(fc.property(fc.option(fc.integer({ min: 0, max: 20_000 }), { nil: null }), fc.array(fc.integer({ min: 0, max: 20_000 }), { maxLength: 6 }), fc.integer({ min: 0, max: 8 }), fc.integer({ min: 0, max: 20_000 }), (last, ends, count, now) => {
      const r = canRattle({ ...seatOk, lastCueMs: last }, { settingOn: true, playingEnds: ends, turnCueCount: count, now });
      const c = canCue({ seat: 4, bot: false, lastCueMs: last }, null, ends, count, now);
      return r.ok === c.ok && (r.ok || (c.ok === false && r.reason === c.reason));
    }), propParams());
    expect([CUE_GAP_MS, MAX_PLAYING, MAX_CUES_PER_TURN]).toEqual([4000, 3, 6]);
  });
  it("is refused for a Detective, a Bot, a Poltergeist with Rattle off, and with the Master's switch off, with the named reason", () => {
    const o = { settingOn: true, playingEnds: [], turnCueCount: 0, now: 100_000 };
    expect(canRattle({ ...seatOk, poltergeist: false }, o)).toEqual({ ok: false, reason: "not_poltergeist" });
    expect(canRattle({ ...seatOk, bot: true }, o)).toEqual({ ok: false, reason: "bot" });
    expect(canRattle({ ...seatOk, rattleOn: false }, o)).toEqual({ ok: false, reason: "rattle_not_on" });
    expect(canRattle(seatOk, { ...o, settingOn: false })).toEqual({ ok: false, reason: "rattle_off" });
    expect(canRattle({ ...seatOk, lastCueMs: 98_000 }, o)).toEqual({ ok: false, reason: "cue_gap" });
    expect(canRattle(seatOk, { ...o, playingEnds: [100_500, 101_000, 102_000] })).toEqual({ ok: false, reason: "too_many_playing" });
    expect(canRattle(seatOk, { ...o, turnCueCount: 6 })).toEqual({ ok: false, reason: "turn_cue_limit" });
    expect(rattleDenied("cue_gap")).toBe("rattle_denied:cue_gap");
  });
  it("counts an accepted Rattle as a Rattle and a Cue for the Turn", () => {
    expect(countRattle({ rattles: 2, cueCount: 3, other: "kept" })).toEqual({ rattles: 3, cueCount: 4, other: "kept" });
  });
});

describe("Property 48: Rattle intensity follows the count and resets each Turn", () => {
  // Feature: party-mode, Property 48: Rattle intensity follows the count and resets each Turn
  // Validates: Requirements 19.4
  it("maps 1-2 to level 1, 3-4 to level 2, 5 and up to level 3, never past 80% volume, and nothing for none", () => {
    expect([1, 2, 3, 4, 5, 6, 9].map((n) => rattleIntensity(n)?.level)).toEqual([1, 1, 2, 2, 3, 3, 3]);
    expect([0, -1, 1.5, Number.NaN].map((n) => rattleIntensity(n))).toEqual([null, null, null, null]);
    fc.assert(fc.property(fc.integer({ min: 1, max: 100 }), (n) => { const i = rattleIntensity(n)!; return i.volume <= RATTLE_MAX_VOLUME && i.level >= (rattleIntensity(Math.max(1, n - 1))!.level); }), propParams());
    expect(rattleIntensity(1)).toMatchObject({ sound: "creak", light: "glow" });
    expect(rattleIntensity(3)).toMatchObject({ sound: "wind", light: "wave" });
    expect(rattleIntensity(5)).toMatchObject({ sound: "rumble", light: "creeping-dark" });
  });
  it("resets each Turn", () => {
    expect(resetRattles({ rattles: 5, cueCount: 5 })).toEqual({ rattles: 0, cueCount: 5 });
  });
  it("gives a phone with no sounds left the light only, and one with neither consent nothing", () => {
    const i = rattleIntensity(1)!;
    const ph = (seat: number, consent: boolean, soundsThisRound: number, lightConsent: boolean) => ({ seat, bot: false, consent, hasAudio: true, soundsThisRound, lightConsent });
    const d = rattleDelivery(i, [ph(2, true, 3, true), ph(1, true, 0, false), ph(3, false, 0, false), ph(4, true, 0, true)], true);
    expect(d.map((x) => [x.target, x.plan, x.sound, x.light])).toEqual([
      ["host", "play", "creak", false], [1, "play", "creak", false], [2, "none", null, true], [3, "none", null, false], [4, "play", "creak", true],
    ]);
    expect(rattleDelivery(i, [ph(1, true, 0, true)], false)[1]).toMatchObject({ plan: "none", sound: null, light: true });
  });
});

describe("Property 49: Rattles are anonymous until the ending", () => {
  // Feature: party-mode, Property 49: Rattles are anonymous until the ending
  // Validates: Requirements 19.5
  it("has exactly three public log lines, none naming a sender, a clip or a number", () => {
    expect(Object.values(RATTLE_LINES)).toEqual(["the floorboards creaked", "a wind passed", "the house rumbled"]);
    fc.assert(fc.property(fc.integer({ min: 1, max: 12 }), fc.stringMatching(/^[A-Z][a-z]{3,8}$/), (n, nick) => {
      const i = rattleIntensity(n)!;
      return !i.logLine.includes(nick) && !/\d/.test(i.logLine) && Object.keys(i).sort().join() === "level,light,logLine,sound,volume";
    }), propParams());
  });
});

describe("Property 50: The Becoming plays once per Player", () => {
  // Feature: party-mode, Property 50: The Becoming plays once per Player
  // Validates: Requirements 19.6
  it("plays for a Player who has not had it, for at most 4 s, not counted as a sound, then offers Rattle, fading outward from their seat", () => {
    const b = becoming({ seat: 3, becomingPlayed: false }, [1, 2, 3, 4, 5, 6], 9000)!;
    expect(b).toMatchObject({ atMs: 9000, durationMs: BECOMING_MS, countsAsSound: false, offerRattle: true });
    expect(b.durationMs).toBeLessThanOrEqual(4000);
    expect(b.fadeOrder).toEqual([3, 2, 4, 1, 5, 6]);
  });
  it("never plays twice for one Player", () => {
    expect(becoming({ seat: 3, becomingPlayed: true }, [1, 2, 3], 0)).toBeNull();
  });
});

describe("Property 51: Rattle prompts appear at most once per Turn each", () => {
  // Feature: party-mode, Property 51: Rattle prompts appear at most once per Turn each
  // Validates: Requirements 19.7
  const p = { bot: false, poltergeist: true, rattleOn: false };
  it("shows rattle-first once while no Rattle has landed, and rattle-join once after someone else's, never to a sender-naming text", () => {
    fc.assert(fc.property(fc.array(fc.record({ landed: fc.integer({ min: 0, max: 6 }), own: fc.integer({ min: 0, max: 6 }) }), { maxLength: 12 }), (steps) => {
      let shown: PromptState = NO_PROMPTS;
      const kinds: string[] = [];
      for (const s of steps) {
        const r = rattlePrompts(p, true, { rattlesThisTurn: s.landed, ownRattlesThisTurn: Math.min(s.own, s.landed) }, shown);
        shown = r.shown;
        if (r.prompt !== null) { kinds.push(r.prompt.kind); if (!/rattle/i.test(r.prompt.text) || r.prompt.button !== "turn-on-rattle" || /\d|seat|player/i.test(r.prompt.text)) return false; }
      }
      return new Set(kinds).size === kinds.length;
    }), propParams());
    expect(rattlePrompts(p, true, { rattlesThisTurn: 0, ownRattlesThisTurn: 0 }, NO_PROMPTS).prompt?.kind).toBe("rattle-first");
    expect(rattlePrompts(p, true, { rattlesThisTurn: 2, ownRattlesThisTurn: 1 }, { first: true, join: false }).prompt?.kind).toBe("rattle-join");
    expect(rattlePrompts(p, true, { rattlesThisTurn: 1, ownRattlesThisTurn: 1 }, { first: true, join: false }).prompt).toBeNull();
  });
  it("is private to a Poltergeist who has Rattle off, with the Master's switch on", () => {
    const t = { rattlesThisTurn: 0, ownRattlesThisTurn: 0 };
    expect(rattlePrompts({ ...p, rattleOn: true }, true, t, NO_PROMPTS).prompt).toBeNull();
    expect(rattlePrompts({ ...p, poltergeist: false }, true, t, NO_PROMPTS).prompt).toBeNull();
    expect(rattlePrompts({ ...p, bot: true }, true, t, NO_PROMPTS).prompt).toBeNull();
    expect(rattlePrompts(p, false, t, NO_PROMPTS).prompt).toBeNull();
  });
});

void (null as unknown as PhoneSeat);
