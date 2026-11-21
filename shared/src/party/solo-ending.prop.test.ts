import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../puzzles/rng";
import { createEngine, step, type EngineSeat } from "./engine";
import { RoomCore, type Ports } from "./server";
import { SOLO_PRESETS, soloSetup, type SoloPreset } from "./solo";

const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);

function roomFakes(seed = 1) {
  const disk: { text: string | undefined; alarm: number | null; deleted: number } = { text: undefined, alarm: null, deleted: 0 };
  const inbox = new Map<string, unknown[]>();
  const clock = { t: 1_000_000 };
  const r = mulberry32(seed);
  const ports: Ports = {
    load: async () => disk.text,
    save: async (t) => { disk.text = t; },
    deleteAll: async () => { disk.text = undefined; disk.deleted++; },
    setAlarm: async (at) => { disk.alarm = at; },
    send: (sid, msg) => { if (!inbox.has(sid)) inbox.set(sid, []); inbox.get(sid)!.push(JSON.parse(JSON.stringify(msg))); },
    close: () => {},
    now: () => clock.t,
    randomBytes: (n) => Uint8Array.from({ length: n }, () => Math.floor(r() * 256)),
    ended: async () => {},
  };
  const lastOf = <T = Record<string, unknown>>(sid: string, t: string): T | undefined =>
    (inbox.get(sid) ?? []).filter((m) => (m as { t: string }).t === t).at(-1) as T | undefined;
  return { ports, disk, clock, lastOf };
}

describe("Property 4: Every solo case ends (integration 4.4)", () => {
  it("for every preset, world and Bot count (2..5), a solo case where the human only passes ends within hauntMax + 3 Rounds", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.constantFrom<SoloPreset>(...SOLO_PRESETS),
        fc.integer({ min: 2, max: 5 }),
        fc.integer({ min: 7, max: 40 }),
        fc.boolean(),
        (seed, preset, bots, walkRadius, authoredZones) => {
          const setup = soloSetup({ world: { id: `w-${seed}`, walkRadius, authoredZones }, preset, bots });
          expect(setup.ok).toBe(true);
          if (!setup.ok) return;

          const seats: EngineSeat[] = setup.seats.map((x) => ({
            seat: x.seat,
            nickname: x.nickname,
            bot: x.bot,
            botLevel: x.botLevel ?? "standard",
          }));
          let now = 1_000;
          let res = step(
            createEngine({
              seed,
              seats,
              settings: { baseSeconds: setup.settings.baseSeconds, hauntMax: setup.settings.hauntMax, preset },
              presetIds: PRESETS,
            }),
            { kind: "client", seat: 1, msg: { t: "start" } },
            now,
          );
          let s = res.state;

          for (let i = 0; i < 6000 && s.phase === "playing"; i++) {
            if (s.turn?.seat === 1 && s.turn.answering === null) {
              res = step(s, { kind: "client", seat: 1, msg: { t: "pass" } }, now);
              s = res.state;
              now += 100;
              continue;
            }
            const wake = res.wakeAtMs;
            expect(wake).not.toBeNull();
            now = Math.max(now + 1, wake as number);
            res = step(s, { kind: "alarm" }, now);
            s = res.state;
          }

          expect(s.phase).toBe("ended");
          expect(s.round).toBeLessThanOrEqual(setup.settings.hauntMax + 3);
          expect(s.ending).not.toBeNull();
          expect(s.ending?.solution).toEqual(s.deal?.solution);
        },
      ),
      { numRuns: 36 },
    );
  });

  it("Play again starts a fresh solo game with the exact same seats", async () => {
    for (const [idx, preset] of SOLO_PRESETS.entries()) {
      const f = roomFakes(idx + 7);
      const core = new RoomCore(f.ports);
      const { hostToken } = await core.create(`SOLO${idx}`);
      const master = await core.join("You");
      expect(master.ok).toBe(true);
      if (!master.ok) continue;
      const say = (sid: string, msg: unknown) => core.message(sid, JSON.stringify(msg));
      await say("host", { t: "hello", token: hostToken });
      await say("master", { t: "hello", token: master.token });
      await say("master", { t: "settings", preset, puzzles: "off" });
      await say("master", { t: "addBot" });
      await say("master", { t: "addBot" });
      await say("master", { t: "start" });

      const firstPub = f.lastOf<{ view: { seats: { seat: number; nickname: string; bot: boolean }[]; phase: string } }>("host", "public");
      const initialSeats = firstPub?.view.seats.map(({ seat, nickname, bot }) => ({ seat, nickname, bot }));
      expect(initialSeats).toHaveLength(3);

      for (let i = 0; i < 6000; i++) {
        const pub = f.lastOf<{ view: { phase: string; active: number | null } }>("host", "public")?.view;
        if (pub?.phase === "ended") break;
        if (pub?.active === master.seat) {
          await say("master", { t: "pass" });
          continue;
        }
        if (f.disk.alarm === null) break;
        f.clock.t = Math.max(f.clock.t + 1, f.disk.alarm);
        await core.alarm();
      }

      const endedView = f.lastOf<{ view: { phase: string; ending: unknown } }>("host", "public")?.view;
      expect(endedView?.phase).toBe("ended");
      expect(endedView?.ending).not.toBeNull();

      await say("master", { t: "playAgain" });
      const restarted = f.lastOf<{ view: { phase: string; round: number; ending: unknown; seats: { seat: number; nickname: string; bot: boolean }[] } }>("host", "public")?.view;
      expect(restarted?.phase).toBe("playing");
      expect(restarted?.round).toBe(1);
      expect(restarted?.ending).toBeNull();
      expect(restarted?.seats.map(({ seat, nickname, bot }) => ({ seat, nickname, bot }))).toEqual(initialSeats);
    }
  });
});
