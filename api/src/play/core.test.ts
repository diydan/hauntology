import { startSession } from "@hauntology/shared/ghost/play";
import type { WorldFacts } from "@hauntology/shared/ghost/play";
import { SESSION_TTL_MS } from "@hauntology/shared/ghost/session";
import { describe, expect, it } from "vitest";
import { PlayCore, readSettle, type Slot } from "./core";

const WORLD: WorldFacts = { spawn: [0, 0, 0], yaw: 0, bounds: { min: [-12, -1, -12], max: [12, 4, 12] }, floorY: 0, brief: "A narrow kitchen with a window over the sink." };
const T0 = 1_800_000_000_000;

function setup() {
  const held = { text: null as string | null };
  const slot: Slot = { load: async () => held.text, save: async (t) => void (held.text = t), clear: async () => void (held.text = null) };
  const clock = { t: T0 };
  const core = new PlayCore(slot, () => clock.t);
  const game = () => startSession({ id: "p-1", worldId: "w-1", ownerSid: "sid-a", world: WORLD, seed: 5, now: clock.t });
  return { held, core, clock, game };
}
const look = { input: { button: "look" }, pose: {}, world: { bounds: WORLD.bounds, brief: WORLD.brief } };

describe("PlayCore", () => {
  it("keeps a game, and refuses to start over a live one", async () => {
    const { core, game, held } = setup();
    expect(await core.start(game())).toBe(true);
    expect(held.text).not.toBeNull();
    expect(await core.start(game())).toBe(false);
    expect(await core.ref()).toEqual({ id: "p-1", worldId: "w-1" });
  });

  it("starts over a game that has run out, and over stored text that is not a game", async () => {
    const { core, game, held, clock } = setup();
    await core.start(game());
    clock.t += SESSION_TTL_MS;
    expect(await core.start(game())).toBe(true);
    held.text = "garbage";
    expect(await core.start(game())).toBe(true);
  });

  it("serves a game to the Session that started it and to nobody else, with the answer of a game that is not there", async () => {
    const { core, game } = setup();
    expect(await core.get("sid-a")).toEqual({ ok: false, code: "session_not_found" });
    await core.start(game());
    const mine = await core.get("sid-a");
    expect(mine).toMatchObject({ ok: true, worldId: "w-1", turns: 0, ended: false });
    for (const other of ["sid-b", "", "sid-a "]) {
      expect(await core.get(other)).toEqual({ ok: false, code: "session_not_found" });
      expect(await core.turn(other, look)).toEqual({ ok: false, code: "session_not_found" });
      expect(await core.reset(other, { world: WORLD, seed: 1 })).toEqual({ ok: false, code: "session_not_found" });
    }
  });

  it("takes a turn, one in 1.5 seconds, and says how long to wait", async () => {
    const { core, game, clock } = setup();
    await core.start(game());
    clock.t += 1600;
    const first = await core.turn("sid-a", look);
    expect(first).toMatchObject({ ok: true, turns: 1 });
    expect(first.ok && first.reply.scripted).toBe(true);
    clock.t += 400;
    expect(await core.turn("sid-a", look)).toEqual({ ok: false, code: "rate_limited", retryAfterMs: 1100 });
    clock.t += 1100;
    expect(await core.turn("sid-a", look)).toMatchObject({ ok: true, turns: 2 });
  });

  it("is over after a day: the game is deleted and the first call after says so, the next says nothing is there", async () => {
    const { core, game, clock, held } = setup();
    await core.start(game());
    clock.t += SESSION_TTL_MS;
    expect(await core.turn("sid-a", look)).toEqual({ ok: false, code: "session_expired" });
    expect(held.text).toBeNull();
    expect(await core.get("sid-a")).toEqual({ ok: false, code: "session_not_found" });
    expect(await core.ref()).toBeNull();
  });

  it("refuses a read and a restart of a game that has run out, the same way, and deletes it", async () => {
    for (const call of ["get", "reset"] as const) {
      const { core, game, clock, held } = setup();
      await core.start(game());
      clock.t += SESSION_TTL_MS;
      expect(await (call === "get" ? core.get("sid-a") : core.reset("sid-a", { world: WORLD, seed: 1 }))).toEqual({ ok: false, code: "session_expired" });
      expect(held.text).toBeNull();
    }
  });

  it("starts again with the same id and owner, a fresh journal and a new day", async () => {
    const { core, game, clock } = setup();
    await core.start(game());
    clock.t += 5000;
    await core.turn("sid-a", look);
    clock.t += 3_600_000;
    const r = await core.reset("sid-a", { world: WORLD, seed: 777 });
    expect(r).toMatchObject({ ok: true, worldId: "w-1", turns: 0, ended: false });
    expect(r.ok && r.view.found).toEqual([]);
    expect(await core.expiresAt()).toBe(clock.t + SESSION_TTL_MS);
    expect(await core.get("sid-a")).toMatchObject({ ok: true, turns: 0 });
  });

  it("forgets the game when told to", async () => {
    const { core, game } = setup();
    await core.start(game());
    await core.delete();
    expect(await core.get("sid-a")).toEqual({ ok: false, code: "session_not_found" });
    expect(await core.expiresAt()).toBeNull();
    await core.delete();
  });

  describe("settle (ghost-engine 4.2)", () => {
    const played = async () => {
      const t = setup();
      await t.core.start(t.game());
      t.clock.t += 1600;
      const r = await t.core.turn("sid-a", look);
      if (!r.ok) throw new Error("turn");
      const stored = JSON.parse(t.held.text as string) as { createdAt: number };
      return { ...t, job: r.job, stamp: stored.createdAt, r };
    };

    it("hands a turn's job back with the scripted reply, and settling puts the model's words in the game", async () => {
      const { core, job, stamp, held } = await played();
      expect(job).not.toBeNull();
      expect(job!.stamp).toBe(stamp);
      const before = JSON.parse(held.text as string);
      expect(await core.settle("sid-a", { stamp, turn: job!.turn, text: "A line in the model's words." })).toMatchObject({ ok: true, applied: true });
      const after = JSON.parse(held.text as string);
      expect(after.state.history.at(-1)).toEqual({ role: "ghost", text: "A line in the model's words." });
      expect(after.state.llmTurns).toBe(1);
      // nothing the engine decides moved
      for (const k of ["turn", "found", "ended", "idleTurns", "lastTurnAt", "lastProgressAt", "seedState"]) expect(after.state[k], k).toEqual(before.state[k]);
      expect(after.pose).toEqual(before.pose);
    });

    it("hands back the new view when the words were put in, so the journal shows them", async () => {
      const t = setup();
      const g = t.game();
      await t.core.start(g);
      t.clock.t += 1600;
      const a = g.anchors[0]!;
      const r = await t.core.turn("sid-a", { ...look, pose: { pos: a.pos, yaw: 0 } });
      if (!r.ok) throw new Error("turn");
      expect(r.job!.memoryAnchor).toBe("a1");
      const s = await t.core.settle("sid-a", { stamp: g.createdAt, turn: r.job!.turn, text: "A memory, in words.", memory: { anchorId: "a1", text: "A memory, in words." } });
      expect(s).toMatchObject({ ok: true, applied: true });
      expect((s as { view: { journal: Array<{ text: string }> } }).view.journal[0]!.text).toBe("A memory, in words.");
    });

    it("is for the game's own Session only, and has the answer of a game that is not there for anyone else", async () => {
      const { core, job, stamp, held } = await played();
      const kept = held.text;
      expect(await core.settle("sid-b", { stamp, turn: job!.turn, text: "x" })).toEqual({ ok: false, code: "session_not_found" });
      expect(held.text).toBe(kept);
      const empty = setup();
      expect(await empty.core.settle("sid-a", { stamp: 1, turn: 1, text: "x" })).toEqual({ ok: false, code: "session_not_found" });
    });

    it("does nothing for another game (a reset made a new one), and says so", async () => {
      const { core, job, stamp, held, clock } = await played();
      const kept = held.text;
      expect(await core.settle("sid-a", { stamp: stamp + 1, turn: job!.turn, text: "x" })).toEqual({ ok: true, applied: false });
      expect(held.text).toBe(kept);
      // after "Haunt again" the old answer finds a new game
      await core.reset("sid-a", { world: WORLD, seed: 99 });
      const fresh = held.text;
      expect(await core.settle("sid-a", { stamp, turn: job!.turn, text: "x" })).toEqual({ ok: true, applied: false });
      expect(held.text).toBe(fresh);
      expect(clock.t).toBeGreaterThan(0);
    });

    it("is over with the game: a game that has run out is deleted and the answer says so", async () => {
      const { core, job, stamp, clock, held } = await played();
      clock.t += SESSION_TTL_MS;
      expect(await core.settle("sid-a", { stamp, turn: job!.turn, text: "x" })).toEqual({ ok: false, code: "session_expired" });
      expect(held.text).toBeNull();
    });

    it("changes nothing for a settle that does not fit, whatever it is", async () => {
      const { core, stamp, held } = await played();
      const kept = held.text;
      const bad: unknown[] = [null, undefined, 7, "x", [], {}, { stamp, turn: 1 }, { stamp, turn: 1, text: "" }, { stamp, turn: 1, text: "   " }, { stamp, turn: -1, text: "x" }, { stamp, turn: 1.5, text: "x" }, { stamp: "1", turn: 1, text: "x" }, { stamp: NaN, turn: 1, text: "x" },
        { stamp, turn: 1, text: "x".repeat(2001) }, { stamp, turn: 1, text: "x", memory: "a1" }, { stamp, turn: 1, text: "x", memory: { anchorId: "a9", text: "y" } }, { stamp, turn: 1, text: "x", memory: { anchorId: "a1", text: "" } }, { stamp, turn: 1, text: "x", memory: { anchorId: "a1", text: "y".repeat(2001) } }];
      for (const b of bad) {
        expect(await core.settle("sid-a", b), JSON.stringify(b)?.slice(0, 50)).toEqual({ ok: true, applied: false });
        expect(held.text).toBe(kept);
      }
    });

    it("reads a settle only as far as its limits go", () => {
      expect(readSettle({ stamp: 5, turn: 2, text: "hello" })).toEqual({ stamp: 5, turn: 2, text: "hello" });
      expect(readSettle({ stamp: 5, turn: 2, text: "t", memory: { anchorId: "a3", text: "m" }, extra: 1 })).toEqual({ stamp: 5, turn: 2, text: "t", memory: { anchorId: "a3", text: "m" } });
      expect(readSettle({ stamp: 5, turn: 0, text: "x".repeat(2000) })).not.toBeNull();
    });
  });
});
