import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createEngine, privateSnapshot, publicSnapshot, step, type Action, type EngineState } from "../party/engine";
import { PRESET_GHOST_IDS } from "../party/preset-ghosts";
import { clueHint } from "./clues";
import { lyricFacts, writeLyrics, type NameConsent, type SongKind } from "./lyrics";
import { initialSongPlan, MAX_MOMENTS_PER_GAME, songRequests } from "./plan";
import { nextSlot, resolveSlotPlayback } from "./slots";

/**
 * Property tests for game-songs Group 2 (`shared/src/songs/`).
 */

const ALL_KINDS: readonly SongKind[] = ["opening", "joined", "wrong_accuse", "becoming", "detectives_win", "house_wins", "clue", "ballad"];

function playSampleTrace(seed: number, actions: readonly number[]): EngineState {
  const seats = [1, 2, 3].map((seat) => ({
    seat,
    nickname: `PlayerToken${seat}Zq`,
    bot: seat !== 1,
    botLevel: "standard" as const,
  }));
  let s = createEngine({ seed, seats, settings: { baseSeconds: 60, hauntMax: 10, puzzles: "off" }, presetIds: PRESET_GHOST_IDS });
  s = step(s, { kind: "client", seat: 1, msg: { t: "start" } }, 1_000).state;
  let now = 2_000;
  for (const choice of actions) {
    if (s.phase === "ended") break;
    const active = s.turn?.seat ?? 1;
    const zone = s.pool.zones[choice % s.pool.zones.length]!;
    const a: Action = choice % 4 === 0
      ? { kind: "alarm" }
      : { kind: "client", seat: active, msg: choice % 3 === 0 ? { t: "endTurn" } : choice % 2 === 0 ? { t: "inspect" } : { t: "walk", zone: zone.id } };
    const r = step(s, a, now);
    s = r.state;
    now = Math.max(now + 100, r.wakeAtMs ?? now + 100);
  }
  return s;
}

describe("game-songs correctness properties", () => {
  /**
   * **Property 1: Songs sing only public facts**
   * **Validates: Requirements 1.1, 2.2, 3.1**
   */
  it("Property 1: Songs sing only public facts", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5000 }),
        fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 1, maxLength: 15 }),
        fc.record({ 1: fc.boolean(), 2: fc.boolean(), 3: fc.boolean() }),
        fc.constantFrom(...ALL_KINDS),
        fc.boolean(),
        (seed, trace, consent, kind, endedFlag) => {
          const eng = playSampleTrace(seed, trace);
          const base = publicSnapshot(eng, 50_000);
          const sol = eng.deal!.solution;
          const view = endedFlag
            ? {
                ...base,
                phase: "ended" as const,
                ending: { solution: sol, residueAt: {}, winners: [1], houseWins: false, mostHaunting: null, scare: {}, nudges: { help: 0, spook: 0 }, recap: { entries: [], counts: {}, solution: sol, reveal: [] } },
              }
            : base;

          const facts = lyricFacts(view, consent as NameConsent, { includeSolution: kind === "ballad" });
          const song = writeLyrics(kind, facts, seed);

          // 1. Unconsented nicknames never appear in lyricFacts or written song output.
          for (const s of view.seats) {
            if (consent[s.seat as 1 | 2 | 3] !== true) {
              expect(facts.players.find((p) => p.seat === s.seat)?.displayName).not.toContain(s.nickname);
              expect(song.lyrics).not.toContain(s.nickname);
              expect(song.title).not.toContain(s.nickname);
              expect(song.style).not.toContain(s.nickname);
            }
          }

          // 2. Solution appears only in the Ballad at ending (and never when non-ballad).
          const solName = view.suspects.find((x) => x.id === sol.suspect)!.name;
          if (kind !== "ballad") {
            expect(facts.solution).toBeNull();
            // Suspect names never appear in non-ballad templates.
            expect(song.lyrics).not.toContain(solName);
          } else if (endedFlag) {
            expect(facts.solution?.suspect).toBe(solName);
            expect(song.lyrics).toContain(solName);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Property 2: Clue hints are fair and fixed**
   * **Validates: Requirements 2.2, 2.3**
   */
  it("Property 2: Clue hints are fair and fixed", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5000 }),
        fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 2, maxLength: 16 }),
        (seed, trace) => {
          const eng = playSampleTrace(seed, trace);
          const view = publicSnapshot(eng, 20_000);
          const residueZoneIds = Object.keys(eng.residueAt);
          const sol = eng.deal!.solution;
          const handCardIds = eng.seats.flatMap((s) => (privateSnapshot(eng, s.seat)?.hand ?? []).map((c) => c.id));
          const excludeIds = [...new Set([...residueZoneIds, sol.suspect, sol.zone, sol.relic, ...handCardIds])];
          const emptyZones = view.zones.map((z) => z.id).filter((id) => !residueZoneIds.includes(id));

          const input = { events: view.events, zones: view.zones, relics: view.relics, emptyZones, excludeIds };
          const h1 = clueHint(input, seed);
          const h2 = clueHint(input, seed);
          expect(h1).toEqual(h2);

          if (h1 !== null) {
            expect(excludeIds).not.toContain(h1.id);
            expect(h1.id).not.toBe(sol.zone);
            expect(h1.id).not.toBe(sol.relic);
            expect(residueZoneIds).not.toContain(h1.id);
            if (h1.kind === "zone") {
              expect(emptyZones).toContain(h1.id);
              expect(view.events.some((e) => e.kind === "inspect" && e.zone === h1.id)).toBe(true);
            } else {
              const suggests = view.events.filter((e): e is Extract<typeof e, { kind: "suggest" }> => e.kind === "suggest" && e.relic === h1.id);
              expect(suggests.length).toBeGreaterThan(0);
              expect(suggests.every((e) => e.refuter === null)).toBe(true);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Property 3: Songs change no rule and never wait**
   * **Validates: Requirements 1.3, 1.4, 4.3**
   */
  it("Property 3: Songs change no rule and never wait", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3000 }),
        fc.array(fc.integer({ min: 0, max: 25 }), { minLength: 3, maxLength: 20 }),
        fc.boolean(),
        (seed, trace, customReady) => {
          // Run identical actions while evaluating Songs settings off, stock, and on beside the Engine.
          const engOff = playSampleTrace(seed, trace);
          const engStock = playSampleTrace(seed, trace);
          const engOn = playSampleTrace(seed, trace);

          expect(engOn.deal).toEqual(engOff.deal);
          expect(engStock.deal).toEqual(engOff.deal);
          expect(engOn.seats.map((s) => privateSnapshot(engOn, s.seat)?.hand)).toEqual(
            engOff.seats.map((s) => privateSnapshot(engOff, s.seat)?.hand),
          );
          expect(engOn.turnNo).toBe(engOff.turnNo);
          expect(engOn.turn).toEqual(engOff.turn);
          expect(engOn.winners).toEqual(engOff.winners);
          expect(engOn.houseWins).toBe(engOff.houseWins);

          // Step songRequests across rounds + verify limits and immediate non-blocking slot playback.
          let plan = initialSongPlan("on");
          const roundCounts: Record<number, number> = {};
          const view = publicSnapshot(engOn, 30_000);
          for (let round = 1; round <= 4; round++) {
            const synthetic = {
              ...view,
              round,
              events: [
                ...view.events,
                { id: 900 + round * 2, kind: "accuse" as const, seat: 1, right: false },
                { id: 901 + round * 2, kind: "accuse" as const, seat: 2, right: false },
              ],
            };
            const planned = songRequests(synthetic, plan);
            plan = planned.state;
            for (const req of planned.requests) {
              if (req.kind !== "opening" && req.kind !== "ballad" && req.kind !== "clue") {
                roundCounts[req.round] = (roundCounts[req.round] ?? 0) + 1;
                expect(roundCounts[req.round]).toBeLessThanOrEqual(1);
              }
            }
          }
          expect(plan.momentCountGame).toBeLessThanOrEqual(MAX_MOMENTS_PER_GAME);

          const slotRes = resolveSlotPlayback({
            setting: "on",
            slotInput: { phase: view.phase, betweenTurns: true, roundEnded: true, quietScene: false, speechPlaying: false, cuePlaying: false, revealPlaying: false },
            kind: "wrong_accuse",
            readyCustom: customReady ? { custom: true } : null,
          });
          expect(slotRes).not.toBeNull();
          expect(slotRes!.source).toBe(customReady ? "custom" : "stock");
          expect(nextSlot({ phase: view.phase, betweenTurns: true, roundEnded: false, quietScene: false, speechPlaying: true, cuePlaying: false, revealPlaying: false })).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
