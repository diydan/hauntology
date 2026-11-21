import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mulberry32, randInt } from "../puzzles/rng";
import {
  createEngine, privateSnapshot, publicSnapshot, step,
  type Action, type ClientMsg, type EngineSeat, type EngineSettings, type EngineState,
} from "./engine";

const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);
const makeSeats = (n: number, humanFirst: boolean): EngineSeat[] =>
  Array.from({ length: n }, (_, i) => ({
    seat: i + 1,
    nickname: `P${i + 1}`,
    bot: !(humanFirst && i === 0),
    botLevel: i % 2 === 0 ? "standard" : "gentle",
  }));

function runScriptedGame(opts: {
  seed: number;
  n: number;
  max: 8 | 10 | 12;
  human: boolean;
  settings: EngineSettings;
  preStart?: ClientMsg[];
}) {
  const r = mulberry32(opts.seed ^ 0x9e3779b9);
  let s = createEngine({
    seed: opts.seed,
    seats: makeSeats(opts.n, opts.human),
    settings: opts.settings,
    presetIds: PRESETS,
  });
  let now = 1_000;
  for (let i = 0; i < (opts.preStart?.length ?? 0); i++) {
    const msg = opts.preStart![i]!;
    const t = 800 + i * 50;
    const res = step(s, { kind: "client", seat: 1, msg }, t);
    expect(res.refused).toBeUndefined();
    s = res.state;
  }
  const startRes = step(s, { kind: "client", seat: 1, msg: { t: "start" } }, now);
  expect(startRes.refused).toBeUndefined();
  s = startRes.state;

  for (let steps = 0; steps < 6000 && s.phase === "playing"; steps++) {
    if (opts.human && s.turn?.seat === 1 && r() < 0.65) {
      const zones = s.pool.zones.map((z) => z.id);
      const pick = <T,>(xs: readonly T[]): T => xs[randInt(r, xs.length)] as T;
      const coreMsgs: ClientMsg[] = [
        { t: "walk", zone: pick(zones) },
        { t: "inspect" },
        { t: "pass" },
        { t: "endTurn" },
        { t: "suggest", suspect: pick(s.pool.suspects).id, relic: pick(s.pool.relics).id },
        { t: "seal", suspect: pick(s.pool.suspects).id, zone: pick(zones), relic: pick(s.pool.relics).id },
      ];
      s = step(s, { kind: "client", seat: 1, msg: pick(coreMsgs) }, now).state;
      now += 500;
      continue;
    }
    if (s.turn?.answering && s.turn.answering.refuter === 1 && opts.human) {
      s = step(s, { kind: "client", seat: 1, msg: { t: "show", card: s.turn.answering.held[0] as string } }, now).state;
      continue;
    }
    const wake = step(s, { kind: "alarm" }, now).wakeAtMs;
    now = Math.max(now + 1, wake ?? now + 1000);
    s = step(s, { kind: "alarm" }, now).state;
  }

  return {
    state: s,
    publicView: publicSnapshot(s, now),
    privateViews: s.seats.filter((x) => !x.bot).map((x) => privateSnapshot(s, x.seat)),
  };
}

describe("Property 5: Optional layers change nothing when off (integration 7.4)", () => {
  it("explicitly disabling optional layers (errands, cluePlace, puzzles) matches omitting them completely", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer({ min: 2, max: 6 }),
        fc.constantFrom(8 as const, 10 as const, 12 as const),
        fc.boolean(),
        (seed, n, max, human) => {
          const clean = runScriptedGame({
            seed,
            n,
            max,
            human,
            settings: { baseSeconds: 60, hauntMax: max },
          });
          const explicitOff = runScriptedGame({
            seed,
            n,
            max,
            human,
            settings: { baseSeconds: 60, hauntMax: max, errands: false, cluePlace: "phone", puzzles: "off" },
          });
          expect(clean.state.phase).toBe("ended");
          expect(explicitOff.state.deal).toEqual(clean.state.deal);
          expect(explicitOff.state.winners).toEqual(clean.state.winners);
          expect(explicitOff.state.houseWins).toBe(clean.state.houseWins);
          expect(explicitOff.state.ending).toEqual(clean.state.ending);
          expect(explicitOff.publicView).toEqual(clean.publicView);
          expect(explicitOff.privateViews).toEqual(clean.privateViews);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("toggling optional layers ON then OFF before start leaves the game identical to never enabling them", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer({ min: 2, max: 5 }),
        fc.constantFrom(8 as const, 10 as const, 12 as const),
        (seed, n, max) => {
          const clean = runScriptedGame({
            seed,
            n,
            max,
            human: true,
            settings: { baseSeconds: 60, hauntMax: max },
          });
          const toggled = runScriptedGame({
            seed,
            n,
            max,
            human: true,
            settings: { baseSeconds: 60, hauntMax: max },
            preStart: [
              { t: "settings", errands: true, cluePlace: "world", puzzles: "medium", nudges: "all", frames: true, sounds: true },
              { t: "settings", errands: false, cluePlace: "phone", puzzles: "off" },
            ],
          });
          expect(toggled.state.deal).toEqual(clean.state.deal);
          expect(toggled.state.winners).toEqual(clean.state.winners);
          expect(toggled.state.ending).toEqual(clean.state.ending);
          expect(toggled.publicView).toEqual(clean.publicView);
          expect(toggled.privateViews).toEqual(clean.privateViews);
        },
      ),
      { numRuns: 20 },
    );
  });

  it("refuses or downgrades optional-layer actions when those layers are OFF without touching the case", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 3, max: 5 }), (seed, n) => {
        const s0 = createEngine({
          seed,
          seats: makeSeats(n, true),
          settings: {
            baseSeconds: 60,
            hauntMax: 10,
            errands: false,
            cluePlace: "phone",
            puzzles: "off",
            nudges: "off",
            frames: false,
            sounds: false,
          },
          presetIds: PRESETS,
        });
        let s = step(s0, { kind: "client", seat: 1, msg: { t: "start" } }, 1_000).state;
        const pubBefore = publicSnapshot(s, 1_500);
        const dealBefore = s.deal;

        // Every optional-layer client action refuses cleanly with unchanged state when off
        const checks: readonly [ClientMsg, string][] = [
          [{ t: "errandDone" }, "no_errand"],
          [{ t: "errandAnswer", yes: true }, "not_asked"],
          [{ t: "errandCaught", poltergeist: 2, object: "spoon" }, "errands_off"],
          [{ t: "nudge", kind: "help" }, "off"],
          [{ t: "nudge", kind: "spook" }, "off"],
          [{ t: "frame", target: 2, cue: "creak" }, "frame_denied:off"],
          [{ t: "attempt", lockId: "z1", transcript: {} }, "puzzle_not_open"],
          [{ t: "giveUp", lockId: "z1" }, "puzzle_not_open"],
        ];
        for (const [msg] of checks) {
          const r = step(s, { kind: "client", seat: 1, msg }, 1_500);
          expect(r.refused).toBeTruthy();
          expect(r.state).toBe(s);
        }

        // `clueSeen` is a no-op when `cluePlace === "phone"`, leaving worldClues absent
        const rClue = step(s, { kind: "client", seat: 1, msg: { t: "clueSeen", sign: "moon" } }, 1_500);
        expect(rClue.state.locks.worldClues ?? []).toEqual([]);
        expect(publicSnapshot(rClue.state, 1_500)).toEqual(pubBefore);
        s = rClue.state;

        // `sounds: false`: off-turn phone cue gets plan `"none"` (or refuses if active turn), never incrementing `soundsThisRound`
        const rCue = step(s, { kind: "client", seat: 1, msg: { t: "cue", cue: "creak", place: "phone" } }, 1_500);
        if (s.turn?.seat === 1) {
          expect(rCue.refused).toBeTruthy();
        } else {
          const cueOut = rCue.out.find((o) => o.to === "seat" && o.msg.t === "cue");
          expect(cueOut && cueOut.msg.t === "cue" ? cueOut.msg.plan : null).toBe("none");
        }
        expect(rCue.state.players.find((p) => p.seat === 1)?.soundsThisRound).toBe(0);

        expect(s.deal).toEqual(dealBefore);
        expect(s.errands ?? []).toEqual([]);
      }),
      { numRuns: 20 },
    );
  });
});
