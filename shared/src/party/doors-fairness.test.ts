import { describe, expect, it } from "vitest";
import { knockPlayTimes } from "../puzzles/knock";
import { makeLock } from "../puzzles/make";
import { doorKnock, type DoorSetup } from "./doors";
import { createEngine, step, type ClientMsg, type EngineSeat, type EngineSettings, type EngineState, type StepResult } from "./engine";

// Knock-door task 9.1 (Requirement 7.1): a door decides only which Zones can be reached. It never reads or writes a card, the Solution,
// the Turn order, a score or the winners. Two checks: what the door code can see (its imports and words), and what a door does to a game.

// Node's modules are loaded by name at run time, as `conditions/rules-free.test.ts` does, so the package needs no Node types.
const nodeFs = "node:fs";
const nodeUrl = "node:url";
const fs = (await import(nodeFs)) as { readFileSync(p: string, enc: string): string };
const url = (await import(nodeUrl)) as { fileURLToPath(u: string): string };
const here = (f: string): string => fs.readFileSync(url.fileURLToPath(new URL(f, import.meta.url).href), "utf8");
const code = (f: string): string => here(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("door code cannot see what it must not touch (knock-door 9.1)", () => {
  it("doors.ts imports only the lock, the seed, the Sight and the Zone point: no Deal, Solution, card, score, order or ending module", () => {
    const imports = [...code("./doors.ts").matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(["../puzzles/knock", "../puzzles/make", "../puzzles/rng", "../puzzles/sight", "../puzzles/types", "./zones", "zod"]);
  });

  it("doors.ts never names a card, the Solution, the Deal, the Turn order, a score or the winners", () => {
    const src = code("./doors.ts");
    for (const word of ["solution", "deal", "card", "winner", "score", "turnOrder", "order", "ending", "poltergeist", "sealed"]) {
      expect(new RegExp(`\\b${word}\\b`, "i").test(src), word).toBe(false);
    }
  });

  it("the Engine's door handlers write only `doors`, the Slam's `tvKnock`/`helpOwed`, the clock of a Help, and messages", () => {
    const engine = code("./engine.ts");
    for (const fn of ["doorAct", "tickDoors", "hearKnocks", "slam", "tvKnockBack"]) {
      const m = engine.match(new RegExp(`function ${fn}\\([\\s\\S]*?\\n}\\n`));
      expect(m, fn).not.toBeNull();
      expect((m?.[0] ?? "").match(/\b(winners|houseWins|ending|deal|pool|players|first|masterSeat|bluffs|sealed)\s*:/g) ?? [], fn).toEqual([]);
    }
  });
});

const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);
const SETTINGS: EngineSettings = { baseSeconds: 90, hauntMax: 12, puzzles: "medium", preset: "classic" };
const mkSeats = (humans: number): EngineSeat[] => [1, 2, 3].map((seat) => ({ seat, nickname: `P${seat}`, bot: seat > humans, botLevel: "standard" as const }));
const zoneIdsFor = (seed: number): string[] => createEngine({ seed, seats: mkSeats(2), settings: SETTINGS, presetIds: PRESETS }).pool.zones.map((z) => z.id);
function setupFor(seed: number): DoorSetup {
  const z = zoneIdsFor(seed) as [string, string, string, string, string, string];
  return {
    home: z[0], passages: [[z[2], z[3]], [z[3], z[4]], [z[4], z[5]]],
    doors: [
      { id: "cellar-door", at: { x: 1, z: 1 }, width: 1.2, a: z[0], b: z[1], lock: "knock" },
      { id: "iron-door", at: { x: 3, z: 1 }, width: 1.4, a: z[1], b: z[2], lock: "heavy", need: 2 },
    ],
  };
}
type G = { s: EngineState; now: number; r: StepResult };
const SEED = 7;
function game(): G {
  const s0 = createEngine({ seed: SEED, seats: mkSeats(2), settings: SETTINGS, presetIds: PRESETS, doors: setupFor(SEED) });
  const r = step(s0, { kind: "client", seat: 1, msg: { t: "start" } }, 0);
  return { s: r.state, now: 0, r };
}
const send = (g: G, seat: number, msg: ClientMsg, at = g.now): G => { const r = step(g.s, { kind: "client", seat, msg }, at); return { s: r.state, now: at, r }; };

/** Everything a door must leave alone, in one comparable value. */
const untouched = (s: EngineState) => ({
  seed: s.seed, seats: s.seats, masterSeat: s.masterSeat, pool: s.pool, deal: s.deal, residueAt: s.residueAt, first: s.first, bluffs: s.bluffs,
  winners: s.winners, houseWins: s.houseWins, ending: s.ending,
  players: s.players.map((p) => ({ seat: p.seat, poltergeist: p.poltergeist, joinedRound: p.joinedRound, inspected: p.inspected, shownToMe: p.shownToMe, found: p.found, sealed: p.sealed, hasSealed: p.hasSealed, suggestions: p.suggestions })),
});

describe("what a door does to a game (knock-door 9.1)", () => {
  it("opening a door by acting together, or by the right knock, changes no card, Solution, order, score or winner", () => {
    const g0 = game();
    const before = untouched(g0.s);
    let g = send(g0, 1, { t: "doorAct", doorId: "iron-door" }, 1000);
    g = send(g, 2, { t: "doorAct", doorId: "iron-door" }, 1500);
    expect(g.s.doors?.states[1]?.open).toBe(true); // the control: the door did open
    expect(untouched(g.s)).toEqual(before);

    const k = doorKnock(SEED, "cellar-door");
    const l = makeLock("knock", k.level, k.seed);
    if (l.kind !== "knock") throw new Error("knock lock expected");
    // the knock needs the Detective's own Turn; a refused one must change nothing either
    const refused = send(g, 1, { t: "doorKnock", doorId: "cellar-door", times: knockPlayTimes(l.secret) }, 2000);
    expect(untouched(refused.s)).toEqual(before);
    const turnSeat = g.s.turn?.seat;
    if (turnSeat !== undefined && turnSeat <= 2) {
      const opened = send(g, turnSeat, { t: "doorKnock", doorId: "cellar-door", times: knockPlayTimes(l.secret) }, 2000);
      expect(untouched(opened.s)).toEqual(before);
    }
  });

  it("a Round with doors shutting and opening on its own (a failed knock, a Slam) leaves the same untouched record as the start", () => {
    const g0 = game();
    const before = untouched(g0.s);
    let g = g0;
    for (let k = 0; k < 600 && g.s.phase === "playing" && g.s.round < 3; k++) {
      const now = g.r.wakeAtMs ?? g.now + 1000;
      const r = step(g.s, { kind: "alarm" }, now);
      g = { s: r.state, now, r };
    }
    // Bots play on, so Turns, scores and logs move; the Deal, the Solution, the seats and the Master do not, because of a door
    expect(untouched(g.s).deal).toEqual(before.deal);
    expect(untouched(g.s).pool).toEqual(before.pool);
    expect(untouched(g.s).seats).toEqual(before.seats);
    expect(untouched(g.s).masterSeat).toEqual(before.masterSeat);
  });
});
