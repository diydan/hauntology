import { describe, expect, it } from "vitest";
import { makeLock } from "../puzzles/make";
import { referenceSolve } from "../puzzles/verify";
import { SKIP_AFTER_MS, initWander, sightAfterReveal } from "../puzzles/wander";
import { wanderDoorFor } from "../puzzles/wander-door";
import { DOOR_OPENED_LINE, attemptWanderLock, playTurn, resetSession, skipWanderLockForSession, startSession, type WorldFacts } from "./play";
import { parseSession, serializeSession } from "./session";

const WORLD: WorldFacts = {
  spawn: [0, 0, 0],
  yaw: 0,
  bounds: { min: [-12, -1, -12], max: [12, 4, 12] },
  floorY: 0,
  brief: "An attic room with dust in one slant of light.",
};
const T0 = 1_800_000_000_000;
const touch = (s: ReturnType<typeof startSession>, i: number, now: number) =>
  playTurn(s, { input: { button: "touch" }, pose: { pos: s.anchors[i]!.pos, yaw: 0 }, world: WORLD, now });

/** The first seed whose walk puts the door on memory `at` (the door's place comes from the game seed alone). */
const seedWithDoorAt = (at: number): number => {
  for (let seed = 1; seed < 2000; seed++) if (wanderDoorFor(seed >>> 0, at, true, "easy", ["knock"]) !== null) return seed;
  throw new Error("no seed");
};
const start = (seed: number, doors: boolean) => startSession({ id: "p-door", worldId: "w-1", ownerSid: "sid-1", world: WORLD, seed, now: T0, locks: true, wanderDoor: doors });

describe("the Wander door in the walk (knock-door 6)", () => {
  it("is off by default: with locks on and no door switch, no memory has a door and the Locks are the ones they were", () => {
    for (let seed = 1; seed < 40; seed++) {
      const a = startSession({ id: "p", worldId: "w", ownerSid: "s", world: WORLD, seed, now: T0, locks: true });
      const b = start(seed, false);
      expect(b.lockState).toEqual(a.lockState);
      expect(b.lockState?.doors).toBeUndefined();
      const hit = touch(b, 0, T0 + 2000);
      expect(hit.ok && hit.lock !== undefined && hit.lock.skipAvailable).toBe(false);
      expect(hit.ok && hit.session.lockState?.open?.door).toBeUndefined();
      expect(hit.ok && hit.lock?.door).toBeUndefined();
    }
  });

  it("turns the door memory into the ghost's knock with Skip there at once, and says what stands in the way, never the knock", () => {
    const seed = seedWithDoorAt(0);
    const hit = touch(start(seed, true), 0, T0 + 2000);
    if (!hit.ok) throw new Error("turn");
    expect(hit.revealed).toBe(false);
    expect(hit.lock?.kind).toBe("knock");
    expect(hit.lock?.skipAvailable).toBe(true);
    expect(hit.lock?.door).toBe(true); // the screen is told, so it says "door" and shows Skip at once
    expect(hit.session.lockState?.open).toMatchObject({ index: 0, kind: "knock", wrong: 0, door: true });
    expect(hit.reply.text).toBe("A door stands in the way. It opens to a secret knock. You can skip it.");
    expect(hit.reply.text).not.toMatch(/\d/);
  });

  it("Skip opens the door at once, with no wait and no wrong tries, and says so before the memory", () => {
    const seed = seedWithDoorAt(0);
    const plain = touch(startSession({ id: "p", worldId: "w", ownerSid: "s", world: WORLD, seed, now: T0 }), 0, T0 + 2000);
    const hit = touch(start(seed, true), 0, T0 + 2000);
    if (!hit.ok || !plain.ok) throw new Error("turn");
    const skipped = skipWanderLockForSession(hit.session, { world: WORLD, now: T0 + 2001 });
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    expect(skipped.revealed).toBe(true);
    expect(skipped.reply.text).toBe(`${DOOR_OPENED_LINE} ${plain.reply.text}`);
    expect(skipped.session.lockState?.open).toBeNull();
    expect(skipped.session.lockState?.revealed).toEqual([hit.session.anchors[0]!.id]);
  });

  it("the right knock opens it with the same words, and a wrong knock never takes Skip away", () => {
    const seed = seedWithDoorAt(0);
    const hit = touch(start(seed, true), 0, T0 + 2000);
    if (!hit.ok) throw new Error("turn");
    const open = hit.session.lockState!.open!;
    let session = hit.session;
    for (let k = 0; k < 4; k++) {
      const w = attemptWanderLock(session, { transcript: { kind: "knock", times: [0, 10_000], elapsedMs: 100 }, world: WORLD, now: T0 + 3000 + k * 1500 });
      if (!w.ok || w.outcome !== "wrong") throw new Error("wrong expected");
      expect(w.skipAvailable).toBe(true);
      session = w.session;
    }
    const solve = referenceSolve(makeLock(open.kind, open.level, open.seed));
    const solved = attemptWanderLock(session, { transcript: solve, world: WORLD, now: T0 + 12_000 });
    expect(solved.ok && solved.outcome === "solved" && solved.reply.text.startsWith(`${DOOR_OPENED_LINE} `)).toBe(true);
  });

  it("only the door memory is a door: the next memory has its ordinary Lock, and Skip waits as before", () => {
    const seed = seedWithDoorAt(0);
    const hit = touch(start(seed, true), 0, T0 + 2000);
    if (!hit.ok) throw new Error("turn");
    const skipped = skipWanderLockForSession(hit.session, { world: WORLD, now: T0 + 2001 });
    if (!skipped.ok) throw new Error("skip");
    const next = touch(skipped.session, 1, T0 + 10_000);
    if (!next.ok) throw new Error("turn");
    expect(next.lock?.skipAvailable).toBe(false);
    expect(next.session.lockState?.open?.door).toBeUndefined();
    expect(next.reply.text).toBe("Something holds this memory shut. Open the lock to hear it.");
    expect(SKIP_AFTER_MS).toBe(20_000); // the ordinary rule is unchanged
  });

  it("keeps the door through a save, and a new game (Haunt again) keeps the switch", () => {
    const seed = seedWithDoorAt(0);
    const hit = touch(start(seed, true), 0, T0 + 2000);
    if (!hit.ok) throw new Error("turn");
    const restored = parseSession(serializeSession(hit.session));
    expect(restored?.lockState?.doors).toBe(true);
    expect(restored?.lockState?.open?.door).toBe(true);
    const again = resetSession(hit.session, { world: WORLD, seed: seed + 5, now: T0 + 5000 });
    expect(again.lockState?.doors).toBe(true);
    expect(resetSession(start(seed, false), { world: WORLD, seed: seed + 5, now: T0 + 5000 }).lockState?.doors).toBeUndefined();
  });

  it("gives the ghost's knock as a Sight before a door that is not the first memory, and only when doors are on", () => {
    const seed = seedWithDoorAt(1);
    const on = sightAfterReveal({ ...initWander(true, true), revealed: ["a1"] }, seed >>> 0);
    expect(on.delivery?.sight.kind).toBe("knock");
    const off = sightAfterReveal({ ...initWander(true, false), revealed: ["a1"] }, seed >>> 0);
    expect(off.delivery?.sight.kind ?? null).not.toBe("knock");
  });
});
