import { SKIP_AFTER_MS } from "@hauntology/shared/puzzles/wander";
import { describe, expect, it } from "vitest";
import type { NarrationAnswer, NarrationRequest, Narrator } from "../guarded/workersai/narrator";
import { MemoryPlaySessions } from "../play/memory";
import type { Narration } from "../play/narrate";
import { DEFAULT_CAPS, MemorySpendGuard } from "../worlds/fakes";
import { NOW, worldsKit } from "../worlds/test-kit";

/** Integration 6.2: Wander with puzzles on adds no paid call. Opening a Lock, a wrong Attempt and the reload cost nothing; the one paid line is the reveal's, the same one a Wander without puzzles pays. */
const ID = "w-kitchen-locks-0002";
const WORDS = "I remember the kettle on the back burner. It sang just before the water boiled.";

function game(locks: boolean) {
  const clock = { t: NOW };
  const calls: NarrationRequest[] = [];
  const narrator: Narrator = {
    async narrate(req) {
      calls.push(req);
      return { ok: true, text: req.system.includes("has reached the place of a memory") ? WORDS : "The window is fogged.", stopReason: "end_turn", usage: { inputTokens: 600, outputTokens: 40 }, thinkingBlocks: 0, shape: [] } as NarrationAnswer;
    },
  };
  const guard = new MemorySpendGuard({ ...DEFAULT_CAPS, llm: { session: 40, day: 1500 } }, () => clock.t);
  const narration: Narration = { narrator, spend: guard, enabled: true, now: () => clock.t };
  const sessions = new MemoryPlaySessions(() => clock.t);
  const kit = worldsKit(() => clock.t, { play: { sessions, narration }, env: { HMAC_SECRET: "test-secret-0123456789abcdef-test" } });
  const wait = (ms = 2000) => void (clock.t += ms);
  return { kit, calls, wait, locks };
}

async function toFirstMemory(g: ReturnType<typeof game>) {
  const owner = await g.kit.visitor();
  g.kit.readyWorld(ID, owner);
  const s = await g.kit.send("/api/play/start", { method: "POST", headers: owner.headers, body: { worldId: ID, ...(g.locks ? { locks: true } : {}) } });
  const started = s.json as { playId: string; view: { anchors: { id: string; pos: [number, number, number] }[] } };
  const a1 = started.view.anchors[0]!;
  g.wait();
  const turn = await g.kit.send(`/api/play/${started.playId}/turn`, { method: "POST", headers: owner.headers, body: { input: { button: "touch" }, pose: { pos: a1.pos, yaw: 0 } } });
  return { owner, started, a1, turn };
}

describe("Wander puzzles add no paid call (integration 6.2)", () => {
  it("with puzzles off, reaching a memory is one narrated turn", async () => {
    const g = game(false);
    const { turn, a1 } = await toFirstMemory(g);
    expect((turn.json as { view: { found: string[] } }).view.found).toEqual([a1.id]);
    expect(g.calls).toHaveLength(1);
  });

  it("with puzzles on, opening the Lock, a wrong Attempt and a reload make no call, and Skip pays exactly the one reveal line", async () => {
    const g = game(true);
    const { owner, started, turn } = await toFirstMemory(g);
    const lock = (turn.json as { lock?: { kind: string } }).lock;
    expect(lock).toBeDefined();
    expect(g.calls).toHaveLength(0); // the turn that opened the Lock paid nothing
    g.wait(1200);
    const wrong = await g.kit.send("/api/play/lock/attempt", { method: "POST", headers: owner.headers, body: { playId: started.playId, transcript: { kind: lock!.kind, elapsedMs: 50 } } });
    expect((wrong.json as { outcome: string }).outcome).toBe("wrong");
    await g.kit.send(`/api/play/${started.playId}`, { headers: owner.headers });
    expect(g.calls).toHaveLength(0);
    g.wait(SKIP_AFTER_MS);
    const skipped = await g.kit.send("/api/play/lock/skip", { method: "POST", headers: owner.headers, body: { playId: started.playId } });
    expect(skipped.status).toBe(200);
    expect(g.calls).toHaveLength(1); // the same one line the Wander without puzzles pays
  });
});
