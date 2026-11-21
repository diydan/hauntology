import { describe, expect, it } from "vitest";
import { BALANCE_LIMITS, BALANCE_PLAYERS, checkBalance, formatReport, playBotGame, simulate, type BalanceRow } from "./balance";

const row = (over: Partial<BalanceRow> = {}): BalanceRow => ({ players: 4, games: 500, unfinished: 0, solved: 0.99, meanRounds: 5, winShare: [0.25, 0.25, 0.25, 0.25], fairShare: 0.25, shareGap: 0, ...over });

describe("balance harness (party-mode 9.5, 2.111)", () => {
  it("plays a whole game to its end, the same one for the same seed, and with winners only when a Player solved it", () => {
    for (const n of BALANCE_PLAYERS) {
      const a = playBotGame(12345, n), b = playBotGame(12345, n);
      expect(a).toEqual(b);
      expect(a.ended).toBe(true);
      expect(a.rounds).toBeGreaterThan(0);
      expect(a.solved).toBe(a.winners.length > 0);
      expect(a.winners.every((w) => w >= 1 && w <= n)).toBe(true);
    }
  });
  it("reports the shares of a small seeded run as numbers that add up, and the same run twice gives the same report", () => {
    const r = simulate(4, 12, 99), again = simulate(4, 12, 99);
    expect(r).toEqual(again);
    expect(r.games).toBe(12);
    expect(r.unfinished).toBe(0);
    expect(r.winShare).toHaveLength(4);
    expect(r.winShare.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(r.shareGap).toBeCloseTo(Math.max(...r.winShare.map((x) => Math.abs(x - 0.25))), 9);
    expect(formatReport([r])).toContain("4 ");
  });
  it("passes a row inside every limit, and names each limit it breaks", () => {
    expect(checkBalance([row()])).toEqual({ ok: true, failures: [] });
    expect(checkBalance([row({ solved: 0.94 })]).failures).toEqual([expect.stringMatching(/4 Players: 94\.0% solved, under 95%/)]);
    expect(checkBalance([row({ solved: 0.95 })]).ok).toBe(true);
    expect(checkBalance([row({ meanRounds: 3.99 })]).ok).toBe(false);
    expect(checkBalance([row({ meanRounds: 7.01 })]).ok).toBe(false);
    expect(checkBalance([row({ meanRounds: 4 }), row({ meanRounds: 7 })]).ok).toBe(true);
    expect(checkBalance([row({ shareGap: 0.081 })]).failures[0]).toMatch(/8\.1 points from fair/);
    expect(checkBalance([row({ shareGap: 0.08 })]).ok).toBe(true);
    expect(checkBalance([row({ unfinished: 1 })]).failures[0]).toMatch(/1 games did not finish/);
    const many = checkBalance([row({ players: 3, solved: 0.5 }), row({ players: 6, meanRounds: 9 })]);
    expect(many.failures.map((f) => f.split(":")[0])).toEqual(["3 Players", "6 Players"]);
    expect(BALANCE_LIMITS).toEqual({ solvedMin: 0.95, meanRoundsMin: 4, meanRoundsMax: 7, shareGapMax: 0.08 });
  });
});

// The full run (500 seeded games at each of 3 to 6 Players) takes about 20 seconds, so it runs by `node tools/balance.mjs`, not in every test run.
describe.runIf(process.env.BALANCE_FULL === "1")("balance regression: 500 seeded games at 3 to 6 Players, all Standard Bots", () => {
  it("meets the design's limits", () => {
    const games = Number(process.env.BALANCE_GAMES ?? 500);
    const rows = BALANCE_PLAYERS.map((n) => simulate(n, games));
    console.log(`\n${formatReport(rows)}\n`);
    const out = checkBalance(rows);
    expect(out.failures).toEqual([]);
  }, 600_000);
});
