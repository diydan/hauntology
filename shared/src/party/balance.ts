import { createEngine, step, type EngineSeat, type EngineState } from "./engine";

/**
 * The statistical balance regression (party-mode 9.5, tasks 2.111): whole games played by Standard Bots only, from seeds, at
 * 3 to 6 Players. The numbers are not a property: they are measured, compared with the design's limits, and reported. A seeded
 * run plays the same games every time. The engine is the real one, so a change to any rule shows here.
 */
export const BALANCE_LIMITS = { solvedMin: 0.95, meanRoundsMin: 4, meanRoundsMax: 7, shareGapMax: 0.08 } as const;
export const BALANCE_PLAYERS = [3, 4, 5, 6] as const;
const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);
export const MAX_STEPS = 6000;

export type GameResult = Readonly<{ solved: boolean; rounds: number; winners: readonly number[]; ended: boolean }>;

/** One whole game: the Master starts it, then time jumps to each wake, with every seat a Standard Bot. */
export function playBotGame(seed: number, players: number, hauntMax: 8 | 10 | 12 = 10, baseSeconds: 30 | 45 | 60 | 90 = 60): GameResult {
  const seats: EngineSeat[] = Array.from({ length: players }, (_, i) => ({ seat: i + 1, nickname: `Bot${i + 1}`, bot: true, botLevel: "standard" }));
  let s: EngineState = createEngine({ seed, seats, settings: { baseSeconds, hauntMax }, presetIds: PRESETS });
  let now = 1_000;
  s = step(s, { kind: "client", seat: 1, msg: { t: "start" } }, now).state;
  for (let i = 0; i < MAX_STEPS && s.phase === "playing"; i++) {
    const wake = step(s, { kind: "alarm" }, now).wakeAtMs;
    now = Math.max(now + 1, wake ?? now + 1000);
    s = step(s, { kind: "alarm" }, now).state;
  }
  const winners = s.ending?.winners ?? [];
  return { solved: winners.length > 0, rounds: s.round, winners, ended: s.phase === "ended" };
}

export type BalanceRow = Readonly<{
  players: number; games: number; unfinished: number;
  /** Share of games a Player solved (the house did not win). */
  solved: number;
  meanRounds: number;
  /** Each seat's share of all wins (a shared win counts for each winner), in seat order. */
  winShare: readonly number[];
  fairShare: number;
  /** The largest distance of any seat's share from the fair share, in share points (0 to 1). */
  shareGap: number;
}>;

export function simulate(players: number, games: number, baseSeed = 20261121): BalanceRow {
  let solved = 0, rounds = 0, unfinished = 0, totalWins = 0;
  const wins = Array.from({ length: players }, () => 0);
  for (let g = 0; g < games; g++) {
    const r = playBotGame((baseSeed + g * 7919 + players * 104729) | 0, players);
    if (!r.ended) { unfinished++; continue; }
    rounds += r.rounds;
    if (r.solved) solved++;
    for (const w of r.winners) { wins[w - 1] = (wins[w - 1] as number) + 1; totalWins++; }
  }
  const done = games - unfinished;
  const winShare = wins.map((w) => (totalWins === 0 ? 0 : w / totalWins));
  const fairShare = 1 / players;
  return { players, games, unfinished, solved: done === 0 ? 0 : solved / done, meanRounds: done === 0 ? 0 : rounds / done, winShare, fairShare, shareGap: Math.max(...winShare.map((x) => Math.abs(x - fairShare))) };
}

export type BalanceCheck = Readonly<{ ok: boolean; failures: readonly string[] }>;
/** The design's limits: at least 95% solved, a mean of 4 to 7 Rounds, every seat's win share within 8 points of its fair share, and no game left unfinished. */
export function checkBalance(rows: readonly BalanceRow[], limits = BALANCE_LIMITS): BalanceCheck {
  const failures: string[] = [];
  for (const r of rows) {
    const at = `${r.players} Players`;
    if (r.unfinished > 0) failures.push(`${at}: ${r.unfinished} games did not finish`);
    if (r.solved < limits.solvedMin) failures.push(`${at}: ${(r.solved * 100).toFixed(1)}% solved, under ${limits.solvedMin * 100}%`);
    if (r.meanRounds < limits.meanRoundsMin || r.meanRounds > limits.meanRoundsMax) failures.push(`${at}: mean ${r.meanRounds.toFixed(2)} Rounds, outside ${limits.meanRoundsMin} to ${limits.meanRoundsMax}`);
    if (r.shareGap > limits.shareGapMax) failures.push(`${at}: a seat's win share is ${(r.shareGap * 100).toFixed(1)} points from fair, over ${limits.shareGapMax * 100}`);
  }
  return { ok: failures.length === 0, failures };
}

export function formatReport(rows: readonly BalanceRow[]): string {
  const head = "Players  Games  Solved   Mean rounds  Win share by seat (fair)                 Max gap";
  const lines = rows.map((r) => `${String(r.players).padEnd(8)} ${String(r.games).padEnd(6)} ${(r.solved * 100).toFixed(1).padStart(5)}%   ${r.meanRounds.toFixed(2).padStart(11)}  ${r.winShare.map((x) => (x * 100).toFixed(1).padStart(5)).join(" ")} (${(r.fairShare * 100).toFixed(1)})`.padEnd(95) + `${(r.shareGap * 100).toFixed(1).padStart(5)} pts`);
  return [head, ...lines].join("\n");
}
