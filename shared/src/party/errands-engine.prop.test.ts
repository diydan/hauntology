import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CAUGHT_BONUS_MS, DONE_ANSWER_MS, DONE_SCARE, ERRAND_OBJECTS, ERRAND_ROUNDS } from "./errands";
import { createEngine, privateSnapshot, publicSnapshot, step, type Action, type EngineSeat, type EngineSettings, type EngineState } from "./engine";
import { parseClientMessage } from "./protocol";
import { RoomCore, type Ports } from "./server";

const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);
const THREE_HUMANS: EngineSeat[] = [1, 2, 3].map((seat) => ({ seat, nickname: `P${seat}`, bot: false, botLevel: "standard" }));

function startPlaying(seed: number, settings: Partial<EngineSettings> = {}, extra: Parameters<typeof createEngine>[0]["preferredErrand"] = null, seats = THREE_HUMANS): EngineState {
  const s0 = createEngine({
    seed,
    seats,
    settings: { baseSeconds: 60, hauntMax: 12, puzzles: "off", preset: "classic", ...settings },
    presetIds: PRESETS,
    preferredErrand: extra,
  });
  return step(s0, { kind: "client", seat: 1, msg: { t: "start" } }, 0).state;
}

/** Seal a wrong accusation for `sealSeat` and pass through all remaining detective turns in the Round so `roundEnd` makes them a Poltergeist. */
function joinHaunting(s0: EngineState, sealSeat: number, now0 = 100): { state: EngineState; now: number } {
  let s = s0;
  let now = now0;
  const sol = s.deal!.solution;
  const wrongSuspect = s.pool.suspects.find((x) => x.id !== sol.suspect)!.id;
  const zone = s.pool.zones[0]!.id;
  const relic = s.pool.relics[0]!.id;

  for (let i = 0; i < 12 && s.phase === "playing" && !s.players.find((p) => p.seat === sealSeat)?.poltergeist; i++) {
    const active = s.turn!.seat;
    now += 100;
    if (active === sealSeat) {
      s = step(s, { kind: "client", seat: active, msg: { t: "seal", suspect: wrongSuspect, zone, relic } }, now).state;
    } else {
      s = step(s, { kind: "client", seat: active, msg: { t: "pass" } }, now).state;
    }
    if (s.haunt.pending?.chooser != null) {
      now += 100;
      s = step(s, { kind: "client", seat: s.haunt.pending.chooser, msg: { t: "choose", option: s.haunt.pending.options[0]! } }, now).state;
    }
  }
  return { state: s, now };
}

function advanceFullRound(s0: EngineState, now0: number): { state: EngineState; now: number } {
  let s = s0;
  let now = now0;
  const targetRound = s.round + 1;
  for (let i = 0; i < 12 && s.phase === "playing" && s.round < targetRound; i++) {
    const active = s.turn!.seat;
    now += 100;
    s = step(s, { kind: "client", seat: active, msg: { t: "pass" } }, now).state;
    if (s.haunt.pending?.chooser != null) {
      now += 100;
      s = step(s, { kind: "client", seat: s.haunt.pending.chooser, msg: { t: "choose", option: s.haunt.pending.options[0]! } }, now).state;
    }
  }
  return { state: s, now };
}

describe("Errands in Engine & Room (Group 2)", () => {
  it("2.3: errands defaults to off, only Master can switch it (including mid-game), and any Player can opt out", async () => {
    const s0 = createEngine({ seed: 1, seats: THREE_HUMANS, settings: { baseSeconds: 60, hauntMax: 10 }, presetIds: PRESETS });
    expect(Boolean(s0.settings.errands)).toBe(false);
    expect(step(s0, { kind: "client", seat: 2, msg: { t: "settings", errands: true } }, 0).refused).toBe("not_master");
    expect(parseClientMessage(JSON.stringify({ t: "settings", errands: true })).kind).toBe("game");
    expect(parseClientMessage(JSON.stringify({ t: "errandOptOut", on: true })).kind).toBe("game");
    expect(parseClientMessage(JSON.stringify({ t: "errandDone" })).kind).toBe("game");
    expect(parseClientMessage(JSON.stringify({ t: "errandAnswer", yes: true })).kind).toBe("game");
    expect(parseClientMessage(JSON.stringify({ t: "errandCaught", poltergeist: 1, object: "spoon" })).kind).toBe("game");
    expect(parseClientMessage(JSON.stringify({ t: "errandCaught", poltergeist: 1, object: "chainsaw" })).kind).toBe("bad");

    // Seat 2 opts out before game starts; seat 1 joins haunting; Master enables errands mid-game -> seat 3 is the only eligible Target
    const opted = step(s0, { kind: "client", seat: 2, msg: { t: "errandOptOut", on: true } }, 0).state;
    let s = step(opted, { kind: "client", seat: 1, msg: { t: "start" } }, 0).state;
    const joined = joinHaunting(s, 1);
    s = joined.state;
    expect(privateSnapshot(s, 1)?.errand).toBeUndefined();
    const toggled = step(s, { kind: "client", seat: 1, msg: { t: "settings", errands: true } }, joined.now + 10);
    s = toggled.state;
    expect(s.settings.errands).toBe(true);
    expect(privateSnapshot(s, 1)?.errandsOn).toBe(true);
    expect(privateSnapshot(s, 1)?.errand?.target).toBe(3);
    expect(privateSnapshot(s, 2)?.errand).toBeUndefined();
    expect(privateSnapshot(s, 2)?.errandOptOut).toBe(true);

    // RoomCore forwards lobby errandOptOut into the started Engine
    let saved: string | undefined;
    let rngByte = 0;
    const ports: Ports = {
      load: async () => saved,
      save: async (t) => { saved = t; },
      deleteAll: async () => {},
      setAlarm: async () => {},
      send: () => {},
      close: () => {},
      now: () => 1000,
      randomBytes: (n) => Uint8Array.from({ length: n }, () => ++rngByte & 0xff),
    };
    const core = new RoomCore(ports);
    await core.create("ERR1");
    const j1 = await core.join("A");
    const j2 = await core.join("B");
    if (!j1.ok || !j2.ok) throw new Error("join failed");
    await core.message("s1", JSON.stringify({ t: "hello", token: j1.token }));
    await core.message("s2", JSON.stringify({ t: "hello", token: j2.token }));
    await core.message("s2", JSON.stringify({ t: "errandOptOut", on: true }));
    await core.message("s1", JSON.stringify({ t: "settings", errands: true }));
    await core.message("s1", JSON.stringify({ t: "start" }));
    const parsed = JSON.parse(saved!) as { engine: EngineState };
    expect(parsed.engine.settings.errands).toBe(true);
    expect(parsed.engine.errandOptOut?.[j2.seat]).toBe(true);
  });

  it("2.1: assigns an Errand on becoming Poltergeist using preferredErrand first, keeps it off PublicSnapshot, renews after 2 Rounds, and excludes Bots", () => {
    const withBots: EngineSeat[] = [
      { seat: 1, nickname: "H1", bot: false, botLevel: "standard" },
      { seat: 2, nickname: "H2", bot: false, botLevel: "standard" },
      { seat: 3, nickname: "B3", bot: true, botLevel: "standard" },
    ];
    let s = startPlaying(17, { errands: true }, "spoon", withBots);
    const j = joinHaunting(s, 1);
    s = j.state;
    const e1 = privateSnapshot(s, 1)?.errand;
    expect(e1).toBeDefined();
    expect(e1!.object).toBe("spoon");
    expect(e1!.target).toBe(2); // Bot 3 is never a Target
    expect(privateSnapshot(s, 2)?.errand).toBeUndefined();
    expect(JSON.stringify(publicSnapshot(s, j.now))).not.toContain("errand");

    // 1 round later: still same Errand; 2 full rounds later: expired & renewed
    const r1 = advanceFullRound(s, j.now);
    expect(privateSnapshot(r1.state, 1)?.errand?.id).toBe(e1!.id);
    const r2 = advanceFullRound(r1.state, r1.now);
    const e2 = privateSnapshot(r2.state, 1)?.errand;
    expect(e2?.id).not.toBe(e1!.id);
    expect(r2.state.errands?.find((x) => x.id === e1!.id)?.status).toBe("expired");
  });

  it("2.2 & 3.1-3.3: Done prompts Target for 20s (No/timeout keeps open once/round; Yes scores 2 Scare and replaces), Caught scores +10s bonus once/round, Ending lists every Errand", () => {
    let s = startPlaying(5, { errands: true }, "mug");
    const j = joinHaunting(s, 1);
    s = j.state;
    let now = j.now;
    const polt = 1;
    const first = privateSnapshot(s, polt)!.errand!;
    const otherDet = first.target === 2 ? 3 : 2;

    // Wrong Caught call: uses caller's Round allowance, reveals nothing, keeps Errand open
    const miss = step(s, { kind: "client", seat: otherDet, msg: { t: "errandCaught", poltergeist: polt, object: ERRAND_OBJECTS.find((o) => o !== first.object)! } }, now + 10);
    expect(miss.refused).toBeUndefined();
    expect(miss.state.log.length).toBe(s.log.length);
    expect(privateSnapshot(miss.state, otherDet)?.errandCaughtUsed).toBe(true);
    expect(step(miss.state, { kind: "client", seat: otherDet, msg: { t: "errandCaught", poltergeist: polt, object: first.object } }, now + 20).refused).toBe("errand_caught_used");
    s = miss.state;

    // Matching Caught call by another Detective: closes Errand with 0 Scare, logs, adds +10s Bonus Seconds on caller's next Turn, gives new Errand
    const caller = first.target;
    const hit = step(s, { kind: "client", seat: caller, msg: { t: "errandCaught", poltergeist: polt, object: first.object } }, now + 30);
    s = hit.state;
    expect(s.log.at(-1)).toEqual({ id: expect.any(Number), kind: "errand-caught", seat: caller });
    expect(s.errands?.find((e) => e.id === first.id)?.status).toBe("caught");
    expect(s.errandBonus).toContain(caller);
    const second = privateSnapshot(s, polt)!.errand!;
    expect(second.id).not.toBe(first.id);

    // Advance until `caller` gets their next Turn -> verify +10 s Bonus Seconds applied
    for (let k = 0; k < 4 && s.turn?.seat !== caller; k++) {
      now += 100;
      s = step(s, { kind: "client", seat: s.turn!.seat, msg: { t: "pass" } }, now).state;
    }
    expect(s.turn?.seat).toBe(caller);
    expect(s.turn?.clock.budgetMs).toBeGreaterThanOrEqual(60_000 + CAUGHT_BONUS_MS);

    // Poltergeist taps Done -> Target gets private Yes/No prompt for 20 s; timeout keeps it open and blocks repeat Done this Round
    const doneReq = step(s, { kind: "client", seat: polt, msg: { t: "errandDone" } }, now + 10);
    s = doneReq.state;
    const ask = privateSnapshot(s, second.target)?.errandAsk;
    expect(ask).toEqual({ errandId: second.id, object: second.object, deadlineMs: now + 10 + DONE_ANSWER_MS });
    expect(doneReq.wakeAtMs).toBeLessThanOrEqual(ask!.deadlineMs);

    const timedOut = step(s, { kind: "alarm" }, ask!.deadlineMs);
    s = timedOut.state;
    expect(privateSnapshot(s, second.target)?.errandAsk).toBeUndefined();
    expect(privateSnapshot(s, polt)?.errand?.id).toBe(second.id);
    expect(step(s, { kind: "client", seat: polt, msg: { t: "errandDone" } }, ask!.deadlineMs + 10).refused).toBe("errand_already_tried");

    // Next Round: Poltergeist taps Done again -> Target answers Yes -> scores +2 Scare, notifies Target privately (no sender), logs without sender, assigns third Errand
    const nxt = advanceFullRound(s, ask!.deadlineMs + 20);
    s = nxt.state;
    now = nxt.now;
    s = step(s, { kind: "client", seat: polt, msg: { t: "errandDone" } }, now + 10).state;
    const yesRes = step(s, { kind: "client", seat: second.target, msg: { t: "errandAnswer", yes: true } }, now + 20);
    s = yesRes.state;
    expect(yesRes.out).toContainEqual({ to: "seat", seat: second.target, msg: { t: "errandDone", object: second.object } });
    expect(s.log.at(-1)).toEqual({ id: expect.any(Number), kind: "errand-done", target: second.target, object: second.object });
    expect(JSON.stringify(publicSnapshot(s, now + 20))).not.toContain(`"from":${polt}`);
    expect(privateSnapshot(s, polt)?.errand?.id).not.toBe(second.id);

    // Win game to inspect Ending payload: Poltergeist has DONE_SCARE points and recap lists every Errand
    const sol = s.deal!.solution;
    const winSeat = s.turn!.seat;
    s = step(s, { kind: "client", seat: winSeat, msg: { t: "seal", suspect: sol.suspect, zone: sol.zone, relic: sol.relic } }, now + 30).state;
    const fin = advanceFullRound(s, now + 40).state;
    expect(fin.phase).toBe("ended");
    expect(fin.ending?.scare[polt]).toBe(DONE_SCARE);
    expect(fin.ending?.recap.errands?.length).toBeGreaterThanOrEqual(2);
    expect(fin.ending?.recap.errands?.find((e) => e.id === first.id)?.status).toBe("caught");
    expect(fin.ending?.recap.errands?.find((e) => e.id === second.id)?.status).toBe("done");
  });

  it("2.4 (Property 2): Errands never touch the Solution, any Hand, the Turn order or the winners", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 500 }), (seed) => {
      const off0 = startPlaying(seed, { errands: false });
      const on0 = startPlaying(seed, { errands: true });
      expect(on0.deal).toEqual(off0.deal);
      expect(on0.residueAt).toEqual(off0.residueAt);

      const script = (base: EngineState): EngineState => {
        let s = base;
        let now = 100;
        const j = joinHaunting(s, 1, now);
        s = j.state;
        now = j.now;
        if (s.phase === "playing" && s.settings.errands && s.players[0]?.poltergeist) {
          s = step(s, { kind: "client", seat: 1, msg: { t: "errandDone" } }, now + 10).state;
          const ask = s.errandAsk;
          if (ask) s = step(s, { kind: "client", seat: ask.target, msg: { t: "errandAnswer", yes: true } }, now + 20).state;
        }
        const sol = s.deal!.solution;
        for (let k = 0; k < 6 && s.phase === "playing"; k++) {
          const act = s.turn!.seat;
          now += 100;
          if (act === 2) s = step(s, { kind: "client", seat: 2, msg: { t: "seal", suspect: sol.suspect, zone: sol.zone, relic: sol.relic } }, now).state;
          else s = step(s, { kind: "client", seat: act, msg: { t: "pass" } }, now).state;
          if (s.haunt.pending?.chooser != null) {
            now += 100;
            s = step(s, { kind: "client", seat: s.haunt.pending.chooser, msg: { t: "choose", option: s.haunt.pending.options[0]! } }, now).state;
          }
        }
        return s;
      };

      const a = script(off0);
      const b = script(on0);
      expect(b.turn?.seat).toEqual(a.turn?.seat);
      expect(b.phase).toBe(a.phase);
      expect(b.winners).toEqual(a.winners);
      expect(b.ending?.winners).toEqual(a.ending?.winners);
    }), { numRuns: 30 });
  });
});
