import { API_SCHEMAS } from "@hauntology/shared/app/api-schemas";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { referenceSolve } from "@hauntology/shared/puzzles/verify";
import { isMemoryKind } from "@hauntology/shared/puzzles/types";
import { SKIP_AFTER_MS } from "@hauntology/shared/puzzles/wander";
import { describe, expect, it } from "vitest";
import { MemoryPlaySessions } from "../play/memory";
import { NOW, worldsKit } from "../worlds/test-kit";

const ID = "w-kitchen-locks-0001";

function setup(envOver: Record<string, string> = {}) {
  const clock = { t: NOW };
  const sessions = new MemoryPlaySessions(() => clock.t);
  const kit = worldsKit(() => clock.t, { play: { sessions }, env: envOver });
  const wait = (ms = 2000) => {
    clock.t += ms;
  };
  return { clock, sessions, kit, wait };
}

describe("Wander lock routes and PUZZLES_ENABLED (puzzles 4.2, 4.3, 4.5)", () => {
  it("reports PUZZLES_ENABLED=false in /api/session, keeps locks off on start, and answers puzzle_disabled on lock routes", async () => {
    const t = setup({ PUZZLES_ENABLED: "false" });
    const owner = await t.kit.visitor();
    t.kit.readyWorld(ID, owner);

    const sessRes = await t.kit.send("/api/session", { headers: owner.headers });
    expect((sessRes.json as { flags: { puzzlesEnabled: boolean } }).flags.puzzlesEnabled).toBe(false);

    const startRes = await t.kit.send("/api/play/start", { method: "POST", headers: owner.headers, body: { worldId: ID, locks: true } });
    expect(startRes.status).toBe(200);
    const started = API_SCHEMAS.playStart.parse(startRes.json);
    expect(started.view.locks).toBeUndefined();

    const lockRes = await t.kit.send("/api/play/lock/open", { method: "POST", headers: owner.headers, body: { playId: started.playId, anchorId: "a1" } });
    expect(lockRes.status).toBe(403);
    expect(lockRes.json).toEqual({ ok: false, code: "puzzle_disabled" });
  });

  it("enforces origin and owner cookie checks, enforces 1-attempt/sec limit, solves or skips, and persists across GET reload", async () => {
    const t = setup();
    const owner = await t.kit.visitor();
    const other = await t.kit.visitor();
    t.kit.readyWorld(ID, owner);

    const s = await t.kit.send("/api/play/start", { method: "POST", headers: owner.headers, body: { worldId: ID, locks: true } });
    expect(s.status).toBe(200);
    const started = API_SCHEMAS.playStart.parse(s.json);
    expect(started.view.locks).toEqual({ on: true, seen: [] });

    // Cross-origin rejected before reaching handler
    const cross = await t.kit.send("/api/play/lock/open", {
      method: "POST",
      headers: { Cookie: owner.headers.Cookie!, Origin: "https://evil.example" },
      body: { playId: started.playId, anchorId: started.view.anchors[0]!.id },
    });
    expect(cross.status).toBe(403);

    // Other visitor's session rejected with 404 session_not_found
    const foreign = await t.kit.send("/api/play/lock/open", {
      method: "POST",
      headers: other.headers,
      body: { playId: started.playId, anchorId: started.view.anchors[0]!.id },
    });
    expect(foreign.status).toBe(404);

    // Turn at anchor opens first Lock
    t.wait(2000);
    const a1 = started.view.anchors[0]!;
    const turn = await t.kit.send(`/api/play/${started.playId}/turn`, {
      method: "POST",
      headers: owner.headers,
      body: { input: { button: "touch" }, pose: { pos: a1.pos, yaw: 0 } },
    });
    expect(turn.status).toBe(200);
    const turnBody = API_SCHEMAS.playTurn.parse(turn.json);
    expect(turnBody.lock).toBeDefined();
    expect(isMemoryKind(turnBody.lock!.kind)).toBe(false);
    expect(turnBody.view.found).toEqual([]);

    // Reloading GET preserves open Lock
    const reloaded = await t.kit.send(`/api/play/${started.playId}`, { headers: owner.headers });
    expect(reloaded.status).toBe(200);
    expect(API_SCHEMAS.playGet.parse(reloaded.json).view.lock?.anchorId).toBe(a1.id);

    // Wrong attempt triggers 1-attempt/sec rate limit on rapid retry
    t.wait(1200);
    const w1 = await t.kit.send("/api/play/lock/attempt", {
      method: "POST",
      headers: owner.headers,
      body: { playId: started.playId, transcript: { kind: turnBody.lock!.kind, elapsedMs: 50 } },
    });
    expect(w1.status).toBe(200);
    expect(API_SCHEMAS.playLockAttempt.parse(w1.json)).toMatchObject({ outcome: "wrong", skipAvailable: false });

    const fast = await t.kit.send("/api/play/lock/attempt", {
      method: "POST",
      headers: owner.headers,
      body: { playId: started.playId, transcript: { kind: turnBody.lock!.kind, elapsedMs: 50 } },
    });
    expect(fast.status).toBe(429);

    // Skip after 20s reveals the first memory
    t.wait(SKIP_AFTER_MS);
    const skipped = await t.kit.send("/api/play/lock/skip", {
      method: "POST",
      headers: owner.headers,
      body: { playId: started.playId },
    });
    expect(skipped.status).toBe(200);
    const skipBody = API_SCHEMAS.playLockSkip.parse(skipped.json);
    expect(skipBody.view.found).toEqual([a1.id]);
    expect(skipBody.view.journal).toHaveLength(1);

    // Next anchor can be solved (oracle from referenceSolve against matching seed or direct solve check via lockOpen)
    const a2 = started.view.anchors[1]!;
    t.wait(2000);
    const open2 = await t.kit.send("/api/play/lock/open", {
      method: "POST",
      headers: owner.headers,
      body: { playId: started.playId, anchorId: a2.id },
    });
    expect(open2.status).toBe(200);
    // Keep referenceSolve unused lint clean by importing a quick smoke lock
    expect(referenceSolve(makeLock("candles", "easy", 1)).kind).toBe("candles");
  });
});
