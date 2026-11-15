import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mulberry32, randInt } from "../puzzles/rng";
import { CUE_GAP_MS, MAX_CUES_PER_TURN, MAX_PLAYING, canCue, canFrame, houseCuePhones, restlessSchedule, soundPlan, type FrameSeat } from "./cues";
import { createEngine, privateSnapshot, publicSnapshot, step, DISCONNECT_GRACE_MS, MASTER_AWAY_MS, type Action, type EngineSeat, type EngineState, type Outbound } from "./engine";

const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);

describe("Property 32: Cues are rate limited and change no rule", () => {
  it("one per Player per 4 s, three sounding, six per Turn, never from the active Player or a Bot", () => {
    fc.assert(fc.property(fc.array(fc.tuple(fc.integer({ min: 1, max: 4 }), fc.nat(3000)), { maxLength: 40 }), fc.integer({ min: 1, max: 4 }), (tries, active) => {
      const last: Record<number, number | null> = { 1: null, 2: null, 3: null, 4: null };
      let playing: number[] = [];
      let count = 0;
      let now = 0;
      const accepted: [number, number][] = [];
      for (const [seat, dt] of tries) {
        now += dt;
        const ok = canCue({ seat, bot: seat === 4, lastCueMs: last[seat] ?? null }, active, playing, count, now).ok;
        if (ok) { last[seat] = now; playing = [...playing.filter((e) => e > now), now + 3000]; count++; accepted.push([seat, now]); }
        expect(playing.filter((e) => e > now).length).toBeLessThanOrEqual(MAX_PLAYING);
      }
      expect(count).toBeLessThanOrEqual(MAX_CUES_PER_TURN);
      for (const [seat] of accepted) { expect(seat).not.toBe(active); expect(seat).not.toBe(4); }
      for (let i = 0; i < accepted.length; i++) for (let j = i + 1; j < accepted.length; j++) {
        if (accepted[i]![0] === accepted[j]![0]) expect(accepted[j]![1] - accepted[i]![1]).toBeGreaterThanOrEqual(CUE_GAP_MS);
      }
    }), { numRuns: 500 });
  });
});

describe("Property 35 and 36: phone sound, House Cues and Frames", () => {
  it("plays only with consent and a free slot (three a Round), flashes without audio, and nothing with sounds off", () => {
    fc.assert(fc.property(fc.boolean(), fc.boolean(), fc.nat(5), fc.boolean(), fc.boolean(), (consent, audio, used, on, bot) => {
      const plan = soundPlan({ seat: 1, bot, consent, hasAudio: audio, soundsThisRound: used }, on);
      if (!on || !consent || bot || used >= 3) expect(plan).toBe("none");
      else expect(plan).toBe(audio ? "play" : "flash");
    }));
  });

  it("a House Cue picks one free consenting phone by seed; Restless plays on every one, in seat order, 400 ms apart", () => {
    const phones = [3, 1, 2, 4].map((seat) => ({ seat, bot: seat === 4, consent: seat !== 2, hasAudio: true, soundsThisRound: seat === 3 ? 3 : 0 }));
    const one = houseCuePhones(phones, 3, 9, false);
    expect(one.seats).toEqual([1]);
    expect(houseCuePhones(phones, 3, 9, false)).toEqual(one);
    expect(houseCuePhones(phones, 6, 9, true).seats).toEqual([1]);
    const many = [1, 2, 3, 5].map((seat) => ({ seat, bot: false, consent: true, hasAudio: true, soundsThisRound: 0 }));
    for (let lvl = 3; lvl <= 9; lvl += 3) {
      expect(houseCuePhones(many, lvl, 4, false).seats).toHaveLength(1); // one phone, not all
      expect(houseCuePhones(many, lvl, 4, true).seats).toEqual([1, 2, 3, 5]);
    }
    expect(restlessSchedule([1, 5, 6], 1000)).toEqual([{ seat: 1, playAtMs: 1000 }, { seat: 5, playAtMs: 1400 }, { seat: 6, playAtMs: 1800 }]);
  });

  it("a Frame needs frames on, two different humans, the target's consent and a free slot, one sent and one received per Round", () => {
    const seat = (s: number, o: Partial<FrameSeat> = {}): FrameSeat => ({ seat: s, bot: false, consent: true, hasAudio: true, soundsThisRound: 0, lastCueMs: null, frameSentRound: null, framedRound: null, ...o });
    const o = { framesOn: true, activeSeat: 9, round: 2, playingEnds: [], turnCueCount: 0, now: 10_000 };
    expect(canFrame(seat(1), seat(2), o)).toEqual({ ok: true });
    expect(canFrame(seat(1), seat(2), { ...o, framesOn: false })).toEqual({ ok: false, reason: "frames_off" });
    expect(canFrame(seat(1), seat(1), o)).toEqual({ ok: false, reason: "self" });
    expect(canFrame(seat(1), seat(2), { ...o, activeSeat: 1 })).toEqual({ ok: false, reason: "own_turn" });
    expect(canFrame(seat(1), seat(2, { consent: false }), o)).toEqual({ ok: false, reason: "no_consent" });
    expect(canFrame(seat(1), seat(2, { soundsThisRound: 3 }), o)).toEqual({ ok: false, reason: "phone_busy" });
    expect(canFrame(seat(1, { frameSentRound: 2 }), seat(2), o)).toEqual({ ok: false, reason: "sender_round_limit" });
    expect(canFrame(seat(1), seat(2, { framedRound: 2 }), o)).toEqual({ ok: false, reason: "target_round_limit" });
    expect(canFrame(seat(1, { lastCueMs: 9_000 }), seat(2), o)).toEqual({ ok: false, reason: "cue_limit" });
  });
});

// ---------------------------------------------------------------- in the Engine
const mixed: EngineSeat[] = [1, 2, 3, 4].map((seat) => ({ seat, nickname: `P${seat}`, bot: seat === 4, botLevel: "standard" }));
function started(seed: number): { s: EngineState; now: number } {
  let s = createEngine({ seed, seats: mixed, settings: { baseSeconds: 60, hauntMax: 12 }, presetIds: PRESETS });
  s = step(s, { kind: "client", seat: 1, msg: { t: "start" } }, 0).state;
  for (const x of [1, 2, 3]) s = step(s, { kind: "client", seat: x, msg: { t: "sound", consent: true } }, 0).state;
  for (const x of [1, 2, 3]) s = step(s, { kind: "connect", seat: x }, 0).state;
  return { s, now: 0 };
}
const notActive = (s: EngineState, not: number[] = []): number[] => [1, 2, 3].filter((x) => x !== s.turn?.seat && !not.includes(x));

describe("Frames and House Cues in the Engine look the same until the end", () => {
  it("a Frame makes the public phone-cue event, plays on the target, tells it 'not you', and the sender shows only at the end", () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const { s, now } = started(seed);
      const [from, to] = notActive(s);
      if (from === undefined || to === undefined) return;
      const r = step(s, { kind: "client", seat: from, msg: { t: "frame", target: to, cue: "bell" } }, now + 5000);
      expect(r.refused).toBeUndefined();
      const ev = r.state.log.at(-1);
      expect(ev).toEqual({ id: ev?.id, kind: "phone-cue", target: to, cue: "bell" });
      const toTarget = r.out.filter((o): o is Extract<Outbound, { to: "seat" }> => o.to === "seat" && o.seat === to).map((o) => o.msg.t);
      expect(toTarget).toEqual(expect.arrayContaining(["cue", "notYou"]));
      expect(r.out.some((o) => o.to === "seat" && o.seat === from && o.msg.t === "notYou")).toBe(false);
      const pub = JSON.stringify(publicSnapshot(r.state, now));
      expect(pub).not.toMatch(/"(from|source|sources|frame)"/);
      // the same shape as a House Cue's event
      const house = { id: 1, kind: "phone-cue", target: to, cue: "bell" };
      expect(Object.keys(ev ?? {}).sort()).toEqual(Object.keys(house).sort());
      expect(r.state.sources.at(-1)).toEqual({ eventId: ev?.id, kind: "frame", from });
      // one Frame sent per Round
      const again = step(r.state, { kind: "client", seat: from, msg: { t: "frame", target: to, cue: "creak" } }, now + 20_000);
      expect(again.refused).toMatch(/frame_denied:(sender_round_limit|target_round_limit|own_turn)/);
    }), { numRuns: 60 });
  });

  it("every Haunt Event plays a House Cue on a consenting phone, with no source in any view", () => {
    let seen = 0;
    for (let seed = 0; seed < 60 && seen < 8; seed++) {
      let { s } = started(seed);
      let now = 0;
      for (let k = 0; k < 3000 && s.phase === "playing"; k++) {
        const t = s.turn;
        let a: Action = { kind: "alarm" };
        if (t && !s.seats.find((x) => x.seat === t.seat)?.bot) a = { kind: "client", seat: t.seat, msg: { t: "pass" } };
        else now = step(s, { kind: "alarm" }, now).wakeAtMs ?? now + 1000;
        if (s.haunt.pending?.chooser != null) { a = { kind: "client", seat: s.haunt.pending.chooser, msg: { t: "choose", option: s.haunt.pending.options[0] } }; }
        const r = step(s, a, now);
        const houseOuts = r.out.filter((o) => o.to === "seat" && o.msg.t === "notYou");
        if (r.state.log.some((e) => e.kind === "haunt-event") && houseOuts.length > 0) {
          seen++;
          for (const o of r.out) if (o.to === "public") expect(JSON.stringify(o.msg)).not.toMatch(/house-cue|"from"/);
        }
        s = r.state;
      }
      for (const src of s.sources.filter((x) => x.kind === "house-cue")) expect(src.from).toBeNull();
      if (s.phase === "ended") expect(s.ending?.recap.reveal.length).toBe(s.sources.length);
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe("Property 34: Per-seat limits survive a reconnect; disconnects and the Master", () => {
  it("a drop and a return change no seat-owned limit", () => {
    fc.assert(fc.property(fc.integer(), fc.integer({ min: 1, max: 3 }), (seed, who) => {
      const { s } = started(seed);
      const s1 = step(s, { kind: "client", seat: notActive(s)[0] ?? 2, msg: { t: "cue", cue: "creak" } }, 5000).state;
      const before = s1.players.find((p) => p.seat === who)!;
      const down = step(s1, { kind: "disconnect", seat: who }, 6000).state;
      const up = step(down, { kind: "connect", seat: who }, 7000).state;
      const after = up.players.find((p) => p.seat === who)!;
      const keep = (p: typeof before) => [p.resolve, p.lastCueMs, p.soundsThisRound, p.frameSentRound, p.framedRound, p.soundConsent, p.heard.length, p.found.length];
      expect(keep(after)).toEqual(keep(before));
      expect(privateSnapshot(up, who)?.hand).toEqual(privateSnapshot(s1, who)?.hand);
    }), { numRuns: 100 });
  });

  it("the active Player's drop pauses the clock for 20 s, then the Turn is lost; back in time, the clock runs on", () => {
    fc.assert(fc.property(fc.integer(), fc.nat(19_000), (seed, back) => {
      let { s } = started(seed);
      let now = 0;
      for (let k = 0; k < 200 && (s.turn === null || s.turn.seat === 4); k++) { now = step(s, { kind: "alarm" }, now).wakeAtMs ?? now + 1000; s = step(s, { kind: "alarm" }, now).state; }
      const me = s.turn?.seat;
      if (me === undefined || s.phase !== "playing") return;
      const d0 = publicSnapshot(s, now).deadlineMs as number;
      const down = step(s, { kind: "disconnect", seat: me }, now);
      expect(down.state.turn?.disconnectEndsMs).toBe(now + DISCONNECT_GRACE_MS);
      expect(down.wakeAtMs).toBe(Math.min(now + DISCONNECT_GRACE_MS, down.wakeAtMs ?? Infinity));
      const up = step(down.state, { kind: "connect", seat: me }, now + back);
      expect(up.state.turn?.seat).toBe(me);
      expect(publicSnapshot(up.state, now + back).deadlineMs).toBe(d0 + back);
      expect(publicSnapshot(up.state, now + back + 5000).deadlineMs).toBe(d0 + back); // the clock runs again: the deadline stays put
      expect(publicSnapshot(up.state, now + back).paused).toBe(false);
      const lost = step(down.state, { kind: "alarm" }, now + DISCONNECT_GRACE_MS);
      expect(lost.state.turn?.seat).not.toBe(me);
      expect(lost.state.players.find((p) => p.seat === me)?.missed).toBe(1);
      expect(lost.state.log.slice(down.state.log.length).some((e) => e.kind === "timeout")).toBe(false); // a dropped phone's Turn is lost, not timed out
    }), { numRuns: 60 });
  });

  it("two missed Turns while away skip the seat until it comes back; a Master away 60 s hands over to the next human", () => {
    const r = mulberry32(3);
    let { s } = started(11);
    let now = 0;
    const away = 2;
    s = step(s, { kind: "disconnect", seat: away }, now).state;
    let skippedSeen = false;
    for (let k = 0; k < 4000 && s.phase === "playing" && !skippedSeen; k++) {
      const t = s.turn;
      if (t && t.seat !== away && !s.seats.find((x) => x.seat === t.seat)?.bot && r() < 0.9) { s = step(s, { kind: "client", seat: t.seat, msg: { t: "pass" } }, now).state; continue; }
      now = step(s, { kind: "alarm" }, now).wakeAtMs ?? now + 1000;
      s = step(s, { kind: "alarm" }, now).state;
      if ((s.players.find((p) => p.seat === away)?.missed ?? 0) >= 2) skippedSeen = true;
    }
    expect(skippedSeen).toBe(true);
    for (let k = 0; k < 30 && s.phase === "playing"; k++) {
      expect(s.turn?.seat).not.toBe(away);
      const t = s.turn;
      if (t && !s.seats.find((x) => x.seat === t.seat)?.bot) { s = step(s, { kind: "client", seat: t.seat, msg: { t: "pass" } }, now).state; continue; }
      now = step(s, { kind: "alarm" }, now).wakeAtMs ?? now + 1000;
      s = step(s, { kind: "alarm" }, now).state;
    }
    s = step(s, { kind: "connect", seat: away }, now).state;
    expect(s.players.find((p) => p.seat === away)?.missed).toBe(0);
    // the Master drops for 60 s
    if (s.phase === "playing") {
      const m = s.masterSeat;
      s = step(s, { kind: "disconnect", seat: m }, now).state;
      expect(step(s, { kind: "alarm" }, now + MASTER_AWAY_MS - 1).state.masterSeat).toBe(m);
      const after = step(s, { kind: "alarm" }, now + MASTER_AWAY_MS).state;
      expect(after.masterSeat).not.toBe(m);
      expect(after.seats.find((x) => x.seat === after.masterSeat)?.bot).toBe(false);
    }
    expect(randInt(r, 2)).toBeGreaterThanOrEqual(0);
  });
});
