import { startSession } from "@hauntology/shared/ghost/play";
import type { WorldFacts } from "@hauntology/shared/ghost/play";
import { SESSION_TTL_MS } from "@hauntology/shared/ghost/session";
import { describe, expect, it } from "vitest";
import { PlayCore, type Slot } from "./core";

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
});
