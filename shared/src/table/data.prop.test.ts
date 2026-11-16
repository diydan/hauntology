import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { cardsOf, dealCase, type Card, type Deal } from "../party/deal";
import { createEngine, privateSnapshot, publicSnapshot, type EngineSeat, type EngineState, type PlayerRec } from "../party/engine";
import { autoMarks, cellKey, markCard, type Column, type Knowledge, type Mark, type PlayerMarks } from "../party/notebook";
import { buildPool } from "../party/pool";
import { placeResidue } from "../party/residue";
import { setTheory, type Theory } from "../party/theory";
import { hashParts, mulberry32, shuffleWith, type TableRng } from "./hash";
import { tableData } from "./data";
import { markOf, type TableNotebook } from "./notebook";

const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);
const NOW = 1_700_000_000_000;

function makeSeats(n: number): EngineSeat[] {
  return Array.from({ length: n }, (_, i) => ({
    seat: i + 1,
    nickname: `P${i + 1}`,
    bot: i > 0,
    botLevel: "standard",
  }));
}

function makeEngineState(seed: number, seatCount: number): EngineState {
  const r = mulberry32(hashParts("engine-base", seed));
  const seats = makeSeats(seatCount);
  const pool = buildPool([], PRESETS, seed);
  const deal = dealCase(pool, seats.map((s) => s.seat), seed);
  const zoneIds = pool.zones.map((z) => z.id);
  const residueAt = placeResidue(zoneIds, deal.residue, seed);
  const players: PlayerRec[] = seats.map((x) => ({
    seat: x.seat,
    poltergeist: x.seat === seatCount && r() < 0.4,
    joinedRound: null,
    resolve: Math.floor(r() * 4),
    inspected: r() < 0.5 ? [zoneIds[0]!] : [],
    shownToMe: [],
    found: [],
    sealed: null,
    hasSealed: false,
    suggestions: 0,
    turnMsUsed: 0,
    heard: [],
    connected: true,
    missed: 0,
    lastCueMs: null,
    soundsThisRound: 0,
    frameSentRound: null,
    framedRound: null,
    soundConsent: false,
    hasAudio: false,
  }));
  const base = createEngine({ seed, seats, settings: { baseSeconds: 60, hauntMax: 10 }, presetIds: PRESETS, pool });
  const inspectedLog = players.flatMap((p, idx) => p.inspected.map((zone, k) => ({ id: idx * 10 + k + 1, kind: "inspect" as const, seat: p.seat, zone })));
  return {
    ...base,
    phase: "playing",
    deal,
    residueAt,
    players,
    round: 2,
    turn: {
      seat: 1,
      turnNo: 3,
      startedMs: NOW,
      clock: { startedMs: NOW, budgetMs: 60_000, pausedMs: 0, pausedSinceMs: null, ended: false },
      at: zoneIds[0]!,
      suggested: false,
      inspecting: null,
      answering: null,
      windowUntilMs: null,
      botDueMs: null,
      botActions: 0,
      nudges: { help: false, spook: false },
      masterPausedClock: false,
      cueCount: 0,
      disconnectEndsMs: null,
      disconnectPausedClock: false,
    },
    haunt: { level: Math.floor(r() * 8), max: 10, fired: [], pending: null, coldSpot: r() < 0.5 ? { zone: zoneIds[Math.floor(r() * 6)]!, untilRound: 3 } : null, blackoutNext: false },
    log: [
      ...inspectedLog,
      { id: 100, kind: "suggest", seat: 2, zone: zoneIds[2]!, suspect: "s1", relic: "r1", passed: [], refuter: 1 },
    ],
  };
}

/** Swap every hidden secret that seat `keepSeat` is not allowed to see. */
function withDifferentHiddenSecrets(s: EngineState, keepSeat: number, twinSeed: number): EngineState {
  const r: TableRng = mulberry32(hashParts("twin", twinSeed));
  const all = cardsOf(s.pool);
  const pick = (kind: Card["kind"]): Card => shuffleWith(r, all.filter((c) => c.kind === kind))[0]!;
  const newSolution = { suspect: pick("suspect").id, zone: pick("zone").id, relic: pick("relic").id };
  const rest = shuffleWith(r, all.filter((c) => ![newSolution.suspect, newSolution.zone, newSolution.relic].includes(c.id)));
  const residue = rest.slice(0, 3);
  let i = 3;
  const hands: Record<number, Card[]> = {};
  for (const p of s.players) {
    const size = s.deal?.hands[p.seat]?.length ?? 0;
    hands[p.seat] = rest.slice(i, i + size);
    i += size;
  }
  // Keep only the local player's own public seat identity; vary everything hidden (even other players' PrivateViews & room seed)
  const deal: Deal = { solution: newSolution, residue, hands };
  const residueAt = placeResidue(s.pool.zones.map((z) => z.id), residue, twinSeed);
  const players = s.players.map((p) =>
    p.seat === keepSeat
      ? p
      : {
          ...p,
          shownToMe: [{ card: rest[0]!.id, by: keepSeat }],
          found: [residue[0]!.id],
          resolve: (p.resolve + 2) % 5,
        },
  );
  return {
    ...s,
    seed: s.seed ^ 0x5a5a5a5a,
    deal,
    residueAt,
    players,
    // Even if a broken state held an ending payload early, tableData still refuses to show it before phase === "ended"
    ending: {
      solution: newSolution,
      residueAt,
      winners: [],
      houseWins: true,
      mostHaunting: null,
      scare: {},
      nudges: { help: 0, spook: 0 },
      recap: { entries: [], counts: {}, solution: newSolution, reveal: [] },
    },
  };
}

describe("Property 1: The table reads only what the phone may already see", () => {
  // Feature: spirit-table, Property 1: The table reads only what the phone may already see
  // Validates: Requirements 3.1, 3.2, 3.3
  it("gives identical output when hidden data (Room seed, Solution before end, Residue positions, other Hands/PrivateViews/notebooks) differ", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer({ min: 2, max: 6 }),
        fc.integer(),
        fc.string({ minLength: 4, maxLength: 6 }),
        fc.array(fc.tuple(fc.nat(5), fc.nat(5), fc.constantFrom<Mark>("has", "lacks", "maybe")), { maxLength: 8 }),
        (seed, n, twinSeed, roomCode, mineEdits) => {
          const a = makeEngineState(seed, n);
          const b = withDifferentHiddenSecrets(a, 1, twinSeed);
          const pubA = publicSnapshot(a, NOW), privA = privateSnapshot(a, 1);
          const pubB = publicSnapshot(b, NOW), privB = privateSnapshot(b, 1);
          expect(pubA).toEqual(pubB);

          const cards = [...a.pool.zones.map((z) => z.id), ...a.pool.suspects.map((s) => s.id), ...a.pool.relics.map((r) => r.id)];
          const columns: Column[] = [...a.seats.map((x) => x.seat), "residue"];
          const knowledge: Knowledge = {
            me: 1,
            hand: (privA?.hand ?? []).map((c) => c.id),
            shown: privA?.shownToMe ?? [],
            found: privA?.found ?? [],
            passes: [],
            autoCross: false,
          };
          let mine: PlayerMarks = new Map();
          for (const [ci, colIdx, m] of mineEdits) mine = markCard(mine, cards[ci % cards.length]!, columns[colIdx % columns.length]!, m);
          const theory: Theory = setTheory({}, a.pool.suspects[0]!.id, a.pool.zones[0]!.id, a.pool.zones.map((z) => z.id));
          const nb: TableNotebook = { auto: autoMarks(knowledge), mine, columns, theory };

          const tdA = tableData(pubA, privA, nb, roomCode);
          const tdB = tableData(pubB, privB, nb, roomCode);
          expect(tdA).toEqual(tdB);
          expect(tdA.ended).toBeUndefined();

          // Corrupt non-ended ending is also hidden until phase === "ended"
          const forcedEarly = tableData({ ...pubB, ending: b.ending }, privB, nb, roomCode);
          expect(forcedEarly.ended).toBeUndefined();

          // Every mark equals markOf(nb, card)
          for (const r of tdA.rooms) expect(r.mark).toBe(markOf(nb, r.zone));
          for (const s of tdA.suspects) expect(s.mark).toBe(markOf(nb, s.card));
          for (const r of tdA.relics) expect(r.mark).toBe(markOf(nb, r.card));
          return true;
        },
      ),
      propParams(),
    );
  });

  it("shows the ended answer only when phase === 'ended' and tracks only the caller's own inspected Zones", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 2, max: 6 }), fc.string({ maxLength: 6 }), (seed, n, roomCode) => {
        const s = makeEngineState(seed, n);
        const endedState: EngineState = {
          ...s,
          phase: "ended",
          ending: {
            solution: s.deal!.solution,
            residueAt: s.residueAt,
            winners: [1],
            houseWins: false,
            mostHaunting: null,
            scare: {},
            nudges: { help: 0, spook: 0 },
            recap: { entries: [], counts: {}, solution: s.deal!.solution, reveal: [] },
          },
        };
        const pub = publicSnapshot(endedState, NOW);
        const priv = privateSnapshot(endedState, 1);
        const nb: TableNotebook = { auto: new Map([[cellKey(s.pool.zones[0]!.id, 1), "has"]]), mine: new Map(), columns: [1, 2, "residue"] };
        const td = tableData(pub, priv, nb, roomCode);
        expect(td.ended).toEqual(s.deal!.solution);
        // Seat 1's own inspect events determine room.inspected; priv === null clears all inspected flags
        const seat1Inspected = new Set(pub.events.flatMap((e) => (e.kind === "inspect" && e.seat === 1 ? [e.zone] : [])));
        for (const r of td.rooms) expect(r.inspected).toBe(seat1Inspected.has(r.zone));
        const noPriv = tableData(pub, null, nb, roomCode);
        expect(noPriv.rooms.every((r) => !r.inspected)).toBe(true);
        return true;
      }),
      propParams(),
    );
  });
});
