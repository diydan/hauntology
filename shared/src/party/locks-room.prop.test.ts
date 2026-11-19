import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatLog } from "../log";
import { makeLock } from "../puzzles/make";
import { referenceSolve } from "../puzzles/verify";
import { createEngine, privateSnapshot, publicSnapshot, step, type EngineSeat, type EngineState, type Outbound } from "./engine";
import { RoomCore, type Ports } from "./server";

const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);
const seats: EngineSeat[] = [1, 2, 3].map((seat) => ({ seat, nickname: `P${seat}`, bot: seat !== 1, botLevel: "standard" }));

function memoryPorts(logs: Array<{ event: string; fields: unknown }> = []) {
  let saved: string | undefined;
  let now = 1_000_000;
  let deleted = false;
  const sent: Array<{ sid: string; msg: unknown }> = [];
  let rnd = 1;
  const ports: Ports = {
    load: async () => saved,
    save: async (text) => {
      saved = text;
    },
    deleteAll: async () => {
      saved = undefined;
      deleted = true;
    },
    setAlarm: async () => undefined,
    send: (sid, msg) => {
      sent.push({ sid, msg });
    },
    close: () => undefined,
    now: () => now,
    randomBytes: (n) => Uint8Array.from({ length: n }, (_, i) => (rnd++ + i) & 0xff),
    log: (event, fields) => {
      logs.push({ event, fields });
    },
  };
  return {
    ports,
    sent,
    advance: (ms: number) => {
      now += ms;
    },
    isDeleted: () => deleted,
    getSaved: () => saved,
  };
}

function startHumanGame(seed: number): { s: EngineState; now: number } {
  let s = createEngine({ seed, seats, settings: { baseSeconds: 90, hauntMax: 12, puzzles: "medium", preset: "classic" }, presetIds: PRESETS });
  let r = step(s, { kind: "client", seat: 1, msg: { t: "start" } }, 0);
  s = r.state;
  let now = 0;
  for (let k = 0; k < 200 && s.turn?.seat !== 1 && s.phase === "playing"; k++) {
    now = r.wakeAtMs ?? now + 1000;
    r = step(s, { kind: "alarm" }, now);
    s = r.state;
  }
  return { s, now };
}

describe("Party integration: Property 10, telemetry, and model-based PartyRoom checks (puzzles 3.3, 3.7, 3.8)", () => {
  it("Property 10: Sights stay private and survive a reconnect", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), (seed) => {
        const { s: s0, now } = startHumanGame(seed);
        if (s0.turn?.seat !== 1) return true;
        const withSight = s0.locks.placed.find((l) => l.sightZone !== null);
        if (!withSight?.sightZone) return true;

        const r1 = step(s0, { kind: "client", seat: 1, msg: { t: "walk", zone: withSight.sightZone } }, now + 10);
        const sentSight = r1.out.find((o): o is Extract<Outbound, { to: "seat" }> => o.to === "seat" && o.seat === 1 && o.msg.t === "sight");
        if (!sentSight) return true;

        // Public view and other seats never see sightId or Sight payload
        const pub = JSON.stringify(publicSnapshot(r1.state, now + 10));
        expect(pub).not.toContain((sentSight.msg as { sightId: string }).sightId);
        expect(JSON.stringify(privateSnapshot(r1.state, 2))).not.toContain((sentSight.msg as { sightId: string }).sightId);

        // Un-acked Sight is re-sent on reconnect
        const disc = step(r1.state, { kind: "disconnect", seat: 1 }, now + 20).state;
        const rec1 = step(disc, { kind: "connect", seat: 1 }, now + 30);
        expect(rec1.out.some((o) => o.to === "seat" && o.seat === 1 && o.msg.t === "sight")).toBe(true);

        // Acked Sight is recorded and not re-sent on next reconnect
        const acked = step(rec1.state, { kind: "client", seat: 1, msg: { t: "sightAck", sightId: (sentSight.msg as { sightId: string }).sightId } }, now + 40).state;
        const disc2 = step(acked, { kind: "disconnect", seat: 1 }, now + 50).state;
        const rec2 = step(disc2, { kind: "connect", seat: 1 }, now + 60);
        expect(rec2.out.some((o) => o.to === "seat" && o.seat === 1 && o.msg.t === "sight")).toBe(false);
        return true;
      }),
      { numRuns: 60 },
    );
  });

  it("emits puzzle.lock telemetry counters without secrets, respects PUZZLES_ENABLED=false, and deletes state with the Room (puzzles 3.7)", async () => {
    const logs: Array<{ event: string; fields: unknown }> = [];
    const env = memoryPorts(logs);
    const core = new RoomCore(env.ports);
    const { hostToken } = await core.create("ABC123");
    const j1 = await core.join("Alice");
    expect(j1.ok).toBe(true);
    if (!j1.ok) return;

    await core.message("sock-h", JSON.stringify({ t: "hello", token: hostToken }));
    await core.message("sock-1", JSON.stringify({ t: "hello", token: j1.token }));
    await core.message("sock-1", JSON.stringify({ t: "addBot" }));
    await core.message("sock-1", JSON.stringify({ t: "start" }));

    // Walk seat 1 to first zone and inspect to open Lock
    const loaded = JSON.parse(env.getSaved()!) as { engine: EngineState };
    const zone = loaded.engine.pool.zones[0]!.id;
    await core.message("sock-1", JSON.stringify({ t: "walk", zone }));
    await core.message("sock-1", JSON.stringify({ t: "inspect" }));

    const afterOpen = JSON.parse(env.getSaved()!) as { engine: EngineState };
    const open = afterOpen.engine.locks.open["1"];
    const placed = open ? afterOpen.engine.locks.placed.find((l) => l.zone === open.zone) : undefined;
    if (open && placed) {
      await core.message("sock-1", JSON.stringify({ t: "attempt", lockId: open.lockId, transcript: { kind: placed.kind, elapsedMs: 50 } }));
      expect(logs.some((l) => l.event === "puzzle.lock")).toBe(true);
      const entry = logs.find((l) => l.event === "puzzle.lock")!;
      const line = formatLog("info", entry.event, entry.fields, 1_000_000);
      expect(line).not.toContain("dropped");
      expect(line).toContain('"kind":');
      expect(line).toContain('"outcome":"wrong"');
      expect(line).toContain('"attempts":1');
    }

    // End room removes stored state (open locks, seen, transcripts)
    await core.message("sock-h", JSON.stringify({ t: "end" }));
    expect(env.isDeleted()).toBe(true);
    expect(env.getSaved()).toBeUndefined();

    // PUZZLES_ENABLED=false keeps puzzles off even if settings tries to change it
    const offEnv = memoryPorts([]);
    const offCore = new RoomCore(offEnv.ports);
    const offHost = await offCore.create("XYZ789", { puzzlesEnabled: false });
    await offCore.join("Bob");
    await offCore.message("sh", JSON.stringify({ t: "hello", token: offHost.hostToken }));
    const raw = JSON.parse(offEnv.getSaved()!) as { lobbySettings: { puzzles: string } };
    expect(raw.lobbySettings.puzzles).toBe("off");
  });

  it("model-based fast-check test of PartyRoom puzzle sequence (move, open, attempt, give up, reconnect, pause, turn end)", () => {
    type Model = { seen: Set<string>; pendingAck: string | null; openLock: { lockId: string } | null; zoneIdx: number; paused: boolean };
    type Real = { state: EngineState; now: number };

    const ZONES = (r: Real) => r.state.pool.zones.map((z) => z.id);
    const checkInvariants = (m: Model, r: Real) => {
      const pub = JSON.stringify(publicSnapshot(r.state, r.now));
      for (const sid of m.seen) expect(pub).not.toContain(sid);
      const actualOpen = r.state.locks.open["1"]?.lockId ?? null;
      if (r.state.turn?.seat === 1) expect(actualOpen).toBe(m.openLock?.lockId ?? null);
    };

    const cmds = [
      fc.integer({ min: 0, max: 5 }).map(
        (zi): fc.Command<Model, Real> => ({
          check: (m) => !m.paused && m.openLock === null,
          run: (m, r) => {
            if (r.state.turn?.seat !== 1) return;
            const z = ZONES(r)[zi]!;
            const res = step(r.state, { kind: "client", seat: 1, msg: { t: "walk", zone: z } }, (r.now += 100));
            if (!res.refused) {
              r.state = res.state;
              m.zoneIdx = zi;
              const sight = res.out.find((o): o is Extract<Outbound, { to: "seat" }> => o.to === "seat" && o.seat === 1 && o.msg.t === "sight");
              if (sight && sight.msg.t === "sight") m.pendingAck = sight.msg.sightId;
            }
            checkInvariants(m, r);
          },
          toString: () => `Move(${zi})`,
        }),
      ),
      fc.constant<fc.Command<Model, Real>>({
        check: (m) => !m.paused && m.openLock === null,
        run: (m, r) => {
          if (r.state.turn?.seat !== 1 || !r.state.turn.at) return;
          const res = step(r.state, { kind: "client", seat: 1, msg: { t: "inspect" } }, (r.now += 100));
          if (!res.refused) {
            r.state = res.state;
            const l = res.out.find((o): o is Extract<Outbound, { to: "seat" }> => o.to === "seat" && o.seat === 1 && o.msg.t === "lock");
            if (l && l.msg.t === "lock") m.openLock = { lockId: l.msg.lockId };
          }
          checkInvariants(m, r);
        },
        toString: () => "OpenInspect",
      }),
      fc.boolean().map(
        (solve): fc.Command<Model, Real> => ({
          check: (m) => !m.paused && m.openLock !== null,
          run: (m, r) => {
            const open = r.state.locks.open["1"];
            const placed = open ? r.state.locks.placed.find((l) => l.zone === open.zone) : undefined;
            if (!open || !placed) { m.openLock = null; return; }
            const tx = solve ? referenceSolve(makeLock(placed.kind, placed.level, placed.seed)) : { kind: placed.kind, elapsedMs: 50 };
            const res = step(r.state, { kind: "client", seat: 1, msg: { t: "attempt", lockId: open.lockId, transcript: tx as never } }, (r.now += 1100));
            if (!res.refused) {
              r.state = res.state;
              if (!r.state.locks.open["1"]) m.openLock = null;
            }
            checkInvariants(m, r);
          },
          toString: () => (solve ? "SolveAttempt" : "WrongAttempt"),
        }),
      ),
      fc.constant<fc.Command<Model, Real>>({
        check: (m) => !m.paused && m.openLock !== null,
        run: (m, r) => {
          if (!m.openLock) return;
          const res = step(r.state, { kind: "client", seat: 1, msg: { t: "giveUp", lockId: m.openLock.lockId } }, (r.now += 100));
          if (!res.refused) { r.state = res.state; m.openLock = null; }
          checkInvariants(m, r);
        },
        toString: () => "GiveUp",
      }),
      fc.constant<fc.Command<Model, Real>>({
        check: () => true,
        run: (m, r) => {
          if (m.pendingAck) {
            r.state = step(r.state, { kind: "client", seat: 1, msg: { t: "sightAck", sightId: m.pendingAck } }, (r.now += 20)).state;
            m.seen.add(m.pendingAck);
            m.pendingAck = null;
          }
          r.state = step(r.state, { kind: "disconnect", seat: 1 }, (r.now += 20)).state;
          const rec = step(r.state, { kind: "connect", seat: 1 }, (r.now += 20));
          r.state = rec.state;
          expect(rec.out.some((o) => o.to === "seat" && o.seat === 1 && o.msg.t === "sight")).toBe(false);
          checkInvariants(m, r);
        },
        toString: () => "Reconnect",
      }),
      fc.constant<fc.Command<Model, Real>>({
        check: () => true,
        run: (m, r) => {
          const res = step(r.state, { kind: "client", seat: 1, msg: { t: m.paused ? "resume" : "pause" } }, (r.now += 50));
          if (!res.refused) { r.state = res.state; m.paused = !m.paused; }
          checkInvariants(m, r);
        },
        toString: () => "PauseToggle",
      }),
    ];

    fc.assert(
      fc.property(fc.integer({ min: 1, max: 500 }), fc.commands(cmds, { maxCommands: 20 }), (seed, seq) => {
        const started = startHumanGame(seed);
        if (started.s.turn?.seat !== 1) return;
        const model: Model = { seen: new Set(), pendingAck: null, openLock: null, zoneIdx: 0, paused: false };
        const real: Real = { state: started.s, now: started.now };
        fc.modelRun(() => ({ model, real }), seq);
      }),
      { numRuns: 40 },
    );
  });
});
