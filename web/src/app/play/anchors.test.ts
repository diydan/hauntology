import { describe, expect, it } from "vitest";
import { validateAnchors, walkRadiusOf } from "@hauntology/shared/ghost/anchors";
import type { Bounds, Vec3 } from "@hauntology/shared/ghost/types";
import { anchorSeedOf, planClientAnchors } from "./anchors";
import { createPoseLimiter, POSE_MIN_INTERVAL_MS, type Pose } from "./pose-limit";

const bounds: Bounds = { min: [-15, -1, -15], max: [15, 6, 15] };
const spawn: Vec3 = [0, 1.6, 0];
const flatFloor = () => 0;

describe("planClientAnchors (ghost-engine 6.3, client placement over a fake floor)", () => {
  it("places three anchors that pass the server's check", () => {
    const anchors = planClientAnchors({ worldId: "w-1", spawn, bounds, sampler: flatFloor });
    expect(anchors).toBeDefined();
    expect(anchors).toHaveLength(3);
    expect(validateAnchors(anchors, { spawn, bounds, walkRadius: walkRadiusOf(bounds), sampler: flatFloor }).ok).toBe(true);
  });

  it("is the same for the same world id and differs between ids", () => {
    const a = planClientAnchors({ worldId: "w-1", spawn, bounds, sampler: flatFloor });
    const b = planClientAnchors({ worldId: "w-1", spawn, bounds, sampler: flatFloor });
    const c = planClientAnchors({ worldId: "w-2", spawn, bounds, sampler: flatFloor });
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
    expect(anchorSeedOf("w-1")).not.toBe(anchorSeedOf("w-2"));
  });

  it("stands on the floor the sampler reports", () => {
    const anchors = planClientAnchors({ worldId: "w-1", spawn, bounds, sampler: () => 0.25 });
    expect(anchors!.every((a) => a.pos[1] === 0.25)).toBe(true);
  });

  it("sends nothing without a floor sampler, so the server places the anchors", () => {
    expect(planClientAnchors({ worldId: "w-1", spawn, bounds, sampler: undefined })).toBeUndefined();
  });

  it("falls back to the ring when the floor has holes, and still passes the check", () => {
    const anchors = planClientAnchors({ worldId: "w-1", spawn, bounds, sampler: (x, z) => (x === spawn[0] && z === spawn[2] ? 0 : null) });
    expect(anchors).toBeDefined();
    expect(anchors).toHaveLength(3);
  });

  it("returns nothing for a sampler that throws", () => {
    expect(planClientAnchors({ worldId: "w-1", spawn, bounds, sampler: () => { throw new Error("raycast failed"); } })).toBeUndefined();
  });

  it("returns nothing when a small world cannot hold the set (the server then uses its own)", () => {
    const tiny: Bounds = { min: [-2, -1, -2], max: [2, 3, 2] };
    expect(planClientAnchors({ worldId: "w-1", spawn: [0, 1.6, 0], bounds: tiny, sampler: flatFloor })).toBeUndefined();
  });
});

describe("createPoseLimiter (at most 4 Hz)", () => {
  const harness = () => {
    let t = 1000;
    const timers: { at: number; fn: () => void; id: number }[] = [];
    let nextId = 1;
    const sent: Pose[] = [];
    const limiter = createPoseLimiter({
      send: (p) => sent.push(p),
      now: () => t,
      setTimer: (fn, ms) => { const id = nextId++; timers.push({ at: t + ms, fn, id }); return id; },
      clearTimer: (h) => { const i = timers.findIndex((x) => x.id === h); if (i >= 0) timers.splice(i, 1); },
    });
    const advance = (ms: number) => {
      t += ms;
      for (const due of timers.filter((x) => x.at <= t).sort((a, b) => a.at - b.at)) {
        timers.splice(timers.indexOf(due), 1);
        due.fn();
      }
    };
    return { limiter, sent, advance };
  };
  const pose = (x: number): Pose => ({ pos: [x, 1.6, 0], yaw: 0 });

  it("sends the first pose at once", () => {
    const h = harness();
    h.limiter.push(pose(1));
    expect(h.sent).toEqual([pose(1)]);
  });

  it("holds poses inside the interval and sends only the newest when it has passed", () => {
    const h = harness();
    h.limiter.push(pose(1));
    h.advance(50);
    h.limiter.push(pose(2));
    h.advance(50);
    h.limiter.push(pose(3));
    expect(h.sent).toHaveLength(1);
    h.advance(POSE_MIN_INTERVAL_MS);
    expect(h.sent).toEqual([pose(1), pose(3)]);
  });

  it("never sends more than 4 in any second under a 60 Hz stream", () => {
    const h = harness();
    const times: number[] = [];
    let clock = 0;
    const sent: Pose[] = [];
    for (let i = 0; i < 180; i++) {
      h.limiter.push(pose(i));
      h.advance(16);
      clock += 16;
      if (h.sent.length > sent.length) { times.push(clock); sent.push(...h.sent.slice(sent.length)); }
    }
    expect(h.sent.length).toBeLessThanOrEqual(Math.ceil((180 * 16) / POSE_MIN_INTERVAL_MS) + 1);
    expect(h.sent.length).toBeGreaterThan(8);
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(POSE_MIN_INTERVAL_MS - 16);
  });

  it("flush sends the held pose now, cancel drops it", () => {
    const a = harness();
    a.limiter.push(pose(1));
    a.limiter.push(pose(2));
    a.limiter.flush();
    expect(a.sent).toEqual([pose(1), pose(2)]);
    const b = harness();
    b.limiter.push(pose(1));
    b.limiter.push(pose(2));
    b.limiter.cancel();
    b.advance(1000);
    expect(b.sent).toEqual([pose(1)]);
  });

  it("sends the next pose at once after a quiet spell", () => {
    const h = harness();
    h.limiter.push(pose(1));
    h.advance(2000);
    h.limiter.push(pose(2));
    expect(h.sent).toEqual([pose(1), pose(2)]);
  });
});
