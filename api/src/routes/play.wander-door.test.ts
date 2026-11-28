import { API_SCHEMAS } from "@hauntology/shared/app/api-schemas";
import { SKIP_AFTER_MS } from "@hauntology/shared/puzzles/wander";
import { describe, expect, it } from "vitest";
import { MemoryPlaySessions } from "../play/memory";
import { NOW, worldsKit } from "../worlds/test-kit";

const ID = "w-kitchen-door-0001";

function setup(envOver: Record<string, string> = {}) {
  const clock = { t: NOW };
  const sessions = new MemoryPlaySessions(() => clock.t);
  const kit = worldsKit(() => clock.t, { play: { sessions }, env: envOver });
  const wait = (ms = 2000) => {
    clock.t += ms;
  };
  return { kit, wait };
}

/** Engage the first three memories in order, skipping each Lock after its wait, and report what each Lock offered at the start. */
async function walkThree(envOver: Record<string, string>) {
  const t = setup(envOver);
  const owner = await t.kit.visitor();
  t.kit.readyWorld(ID, owner);
  const s = await t.kit.send("/api/play/start", { method: "POST", headers: owner.headers, body: { worldId: ID, locks: true } });
  expect(s.status).toBe(200);
  const started = API_SCHEMAS.playStart.parse(s.json);
  const seen: { kind: string; skipAtStart: boolean; text: string; skipText: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const a = started.view.anchors[i]!;
    t.wait(2000);
    const turn = await t.kit.send(`/api/play/${started.playId}/turn`, { method: "POST", headers: owner.headers, body: { input: { button: "touch" }, pose: { pos: a.pos, yaw: 0 } } });
    expect(turn.status).toBe(200);
    const body = API_SCHEMAS.playTurn.parse(turn.json);
    expect(body.lock).toBeDefined();
    const door = body.lock!.skipAvailable;
    // a door's Skip is there at once; an ordinary Lock's waits 20 seconds
    if (!door) t.wait(SKIP_AFTER_MS);
    const skipped = await t.kit.send("/api/play/lock/skip", { method: "POST", headers: owner.headers, body: { playId: started.playId } });
    expect(skipped.status).toBe(200);
    const skipBody = API_SCHEMAS.playLockSkip.parse(skipped.json);
    expect(skipBody.view.found).toContain(a.id);
    seen.push({ kind: body.lock!.kind, skipAtStart: door, text: body.reply.text, skipText: skipBody.reply.text });
  }
  return seen;
}

describe("the Wander door and WANDER_DOORS_ENABLED (knock-door 6)", () => {
  it("is off by default: with Locks on, no memory's Skip is there at the start", async () => {
    const seen = await walkThree({});
    expect(seen.map((x) => x.skipAtStart)).toEqual([false, false, false]);
    for (const x of seen) expect(x.text).toBe("Something holds this memory shut. Open the lock to hear it.");
  });

  it("with the switch on, exactly one of the first three memories is a door: a knock with Skip at once, said in words", async () => {
    const seen = await walkThree({ WANDER_DOORS_ENABLED: "true" });
    const doors = seen.filter((x) => x.skipAtStart);
    expect(doors).toHaveLength(1);
    expect(doors[0]!.kind).toBe("knock");
    expect(doors[0]!.text).toBe("A door stands in the way. It opens to a secret knock. You can skip it.");
    expect(doors[0]!.skipText.startsWith("The door opens. ")).toBe(true);
    for (const x of seen.filter((y) => !y.skipAtStart)) {
      expect(x.text).toBe("Something holds this memory shut. Open the lock to hear it.");
      expect(x.skipText.startsWith("The door opens.")).toBe(false);
    }
  });

  it("stays off when Locks are off, whatever the switch says", async () => {
    const t = setup({ WANDER_DOORS_ENABLED: "true" });
    const owner = await t.kit.visitor();
    t.kit.readyWorld(ID, owner);
    const s = await t.kit.send("/api/play/start", { method: "POST", headers: owner.headers, body: { worldId: ID } });
    const started = API_SCHEMAS.playStart.parse(s.json);
    expect(started.view.locks).toBeUndefined();
  });
});
