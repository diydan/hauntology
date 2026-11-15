import { startSession } from "@hauntology/shared/ghost/play";
import type { WorldFacts } from "@hauntology/shared/ghost/play";
import { describe, expect, it } from "vitest";
import { MemoryPlaySessions } from "./memory";

const WORLD: WorldFacts = { spawn: [0, 0, 0], yaw: 0, bounds: { min: [-12, -1, -12], max: [12, 4, 12] }, floorY: 0, brief: "A kitchen." };

describe("MemoryPlaySessions (the in-process twin)", () => {
  const game = (id: string, worldId: string, owner = "sid-a") => startSession({ id, worldId, ownerSid: owner, world: WORLD, seed: 1, now: 1_000 });

  it("keeps a game by id, once", async () => {
    const plays = new MemoryPlaySessions(() => 2_000);
    expect(await plays.start(game("p-1", "w-1"))).toBe(true);
    expect(await plays.start(game("p-1", "w-1"))).toBe(false);
    expect(plays.has("p-1")).toBe(true);
    expect(plays.has("p-2")).toBe(false);
    expect(plays.size).toBe(1);
  });

  it("deletes every game of a world and no game of another (the purger of the world store)", async () => {
    const plays = new MemoryPlaySessions(() => 2_000);
    await plays.start(game("p-1", "w-1"));
    await plays.start(game("p-2", "w-1", "sid-b"));
    await plays.start(game("p-3", "w-2"));
    await plays.deleteForWorld("w-1");
    expect([plays.has("p-1"), plays.has("p-2"), plays.has("p-3")]).toEqual([false, false, true]);
    expect(plays.size).toBe(1);
    expect(await plays.get("p-1", "sid-a")).toEqual({ ok: false, code: "session_not_found" });
    expect(await plays.get("p-3", "sid-a")).toMatchObject({ ok: true, worldId: "w-2" });
    await plays.deleteForWorld("w-never");
    expect(plays.size).toBe(1);
  });
});
