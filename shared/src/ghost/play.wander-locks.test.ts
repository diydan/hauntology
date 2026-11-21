import { makeLock } from "../puzzles/make";
import { isMemoryKind } from "../puzzles/types";
import { referenceSolve } from "../puzzles/verify";
import { SKIP_AFTER_MS } from "../puzzles/wander";
import { describe, expect, it } from "vitest";
import {
  attemptWanderLock, openWanderLock, playTurn, resetSession, skipWanderLockForSession, startSession, viewOf,
  type WorldFacts,
} from "./play";
import { parseSession, serializeSession } from "./session";

const WORLD: WorldFacts = {
  spawn: [0, 0, 0],
  yaw: 0,
  bounds: { min: [-12, -1, -12], max: [12, 4, 12] },
  floorY: 0,
  brief: "An attic room with dust in one slant of light.",
};
const T0 = 1_800_000_000_000;

describe("Wander locks in PlaySession (puzzles 4.1, 4.3)", () => {
  it("with locks off (default), session, turn output, and views are unchanged", () => {
    const off = startSession({ id: "p-off", worldId: "w-1", ownerSid: "sid-1", world: WORLD, seed: 42, now: T0 });
    expect(off.lockState).toBeUndefined();
    expect(off.gameSeed).toBeUndefined();
    const view = viewOf(off, T0);
    expect("lock" in view).toBe(false);
    expect("locks" in view).toBe(false);

    const a1 = off.anchors[0]!;
    const turned = playTurn(off, { input: { button: "touch" }, pose: { pos: a1.pos, yaw: 0 }, world: WORLD, now: T0 + 2000 });
    expect(turned.ok).toBe(true);
    if (!turned.ok) return;
    expect(turned.revealed).toBe(true);
    expect(turned.lock).toBeUndefined();
    expect(turned.view.found).toEqual([a1.id]);
  });

  it("gates unfound anchor reveals behind a Lock whose first Kind needs no Sight, reveals the same memory on solve, and keeps Sights across serialization", () => {
    const base = startSession({ id: "p-base", worldId: "w-1", ownerSid: "sid-1", world: WORLD, seed: 77, now: T0 });
    const gated = startSession({ id: "p-on", worldId: "w-1", ownerSid: "sid-1", world: WORLD, seed: 77, now: T0, locks: true });
    const a1 = base.anchors[0]!;

    // Same memory text produced when unlocked
    const plain = playTurn(base, { input: { button: "touch" }, pose: { pos: a1.pos, yaw: 0 }, world: WORLD, now: T0 + 2000 });
    expect(plain.ok).toBe(true);

    // Gated turn opens Lock instead of revealing
    const hit = playTurn(gated, { input: { button: "touch" }, pose: { pos: a1.pos, yaw: 0 }, world: WORLD, now: T0 + 2000 });
    expect(hit.ok).toBe(true);
    if (!hit.ok || !plain.ok) return;
    expect(hit.revealed).toBe(false);
    expect(hit.view.found).toEqual([]);
    expect(hit.lock).toBeDefined();
    expect(isMemoryKind(hit.lock!.kind)).toBe(false);

    // Wrong attempt rate-limited within 1s, then allowed after 1s
    const badTx = { kind: hit.lock!.kind, elapsedMs: 100 };
    const w1 = attemptWanderLock(hit.session, { transcript: badTx, world: WORLD, now: T0 + 3000 });
    expect(w1.ok).toBe(true);
    if (!w1.ok || w1.outcome !== "wrong") return;
    const tooSoon = attemptWanderLock(w1.session, { transcript: badTx, world: WORLD, now: T0 + 3500 });
    expect(tooSoon).toEqual({ ok: false, code: "puzzle_rate_limited" });

    // Second wrong attempt unlocks Skip
    const w2 = attemptWanderLock(w1.session, { transcript: badTx, world: WORLD, now: T0 + 4200 });
    expect(w2.ok).toBe(true);
    if (!w2.ok || w2.outcome !== "wrong") return;
    expect(w2.skipAvailable).toBe(true);

    // Solve produces identical revealed anchor & memory text
    const open = w2.session.lockState!.open!;
    const solveTx = referenceSolve(makeLock(open.kind, open.level, open.seed));
    const solved = attemptWanderLock(w2.session, { transcript: solveTx, world: WORLD, now: T0 + 5500 });
    expect(solved.ok).toBe(true);
    if (!solved.ok || solved.outcome !== "solved") return;
    expect(solved.revealed).toBe(true);
    expect(solved.view.found).toEqual([a1.id]);
    expect(solved.reply.text).toBe(plain.reply.text);

    // Round-trip through serialize/parse keeps seen Sights and revealed anchors
    const restored = parseSession(serializeSession(solved.session));
    expect(restored?.lockState?.on).toBe(true);
    expect(restored?.lockState?.revealed).toEqual([a1.id]);
    expect(restored?.lockState?.seen).toEqual(solved.session.lockState?.seen);
  });

  it("allows Skip after 20 seconds and resets cleanly on resetSession", () => {
    const s = startSession({ id: "p-skip", worldId: "w-1", ownerSid: "sid-1", world: WORLD, seed: 91, now: T0, locks: true });
    const a1 = s.anchors[0]!;
    const opened = openWanderLock(s, { anchorId: a1.id, now: T0 + 1000 });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const tooEarly = skipWanderLockForSession(opened.session, { world: WORLD, now: T0 + 2000 });
    expect(tooEarly).toEqual({ ok: false, code: "puzzle_rate_limited" });

    const skipped = skipWanderLockForSession(opened.session, { world: WORLD, now: T0 + 1000 + SKIP_AFTER_MS });
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    expect(skipped.revealed).toBe(true);
    expect(skipped.view.found).toEqual([a1.id]);

    const again = resetSession(skipped.session, { world: WORLD, seed: 99, now: T0 + 50_000 });
    expect(again.lockState).toEqual({ on: true, revealed: [], open: null, seen: [] });
  });
});
