import type { ApiResult, WorldStatus } from "@hauntology/shared/app/api";
import { OVERDUE_MS, POLL_MAX_MS, POLL_MIN_MS } from "@hauntology/shared/app/stage";
import type { JobState } from "@hauntology/shared/app/types";
import { ErrorCode } from "@hauntology/shared/errors";
import { describe, expect, it } from "vitest";
import { manualClock } from "../../test/clock";
import { createHauntController } from "./controller";

const clock = manualClock;

function setup(answers: Array<ApiResult<WorldStatus> | ((n: number) => ApiResult<WorldStatus>)>, opts: { visible?: boolean } = {}) {
  const c = clock();
  let visible = opts.visible ?? true;
  const listeners = new Set<() => void>();
  let calls = 0;
  const api = {
    world: async (id: string): Promise<ApiResult<WorldStatus>> => {
      expect(id).toBe("w1");
      const a = answers[Math.min(calls, answers.length - 1)]!;
      calls++;
      return typeof a === "function" ? a(calls) : a;
    },
  };
  const ctl = createHauntController({
    api, worldId: "w1", now: c.now, scheduler: c.scheduler,
    visible: () => visible,
    onVisibility: (l) => { listeners.add(l); return () => void listeners.delete(l); },
  });
  return {
    c, ctl, calls: () => calls, listeners: () => listeners.size,
    setVisible: async (v: boolean) => { visible = v; for (const l of [...listeners]) l(); await c.advance(0); },
  };
}

const status = (s: JobState, extra: Partial<WorldStatus> = {}): ApiResult<WorldStatus> => ({ ok: true, value: { id: "w1", status: s, ...extra } });
const fail = (code: ErrorCode, retryAfterSec?: number): ApiResult<WorldStatus> => ({ ok: false, code, ...(retryAfterSec === undefined ? {} : { retryAfterSec }) });

describe("HauntController: polling", () => {
  it("asks at once, shows the label for the job's state, and asks again after the poll gap", async () => {
    const { c, ctl, calls } = setup([status("queued"), status("generating", { title: "Your place" }), status("ingesting"), status("ready")]);
    expect(ctl.getSnapshot().stage).toBeNull();
    ctl.begin();
    ctl.begin();
    await ctl.settled();
    expect(calls()).toBe(1);
    expect(ctl.getSnapshot().stage).toBe("queued");
    expect(c.pending()).toEqual([POLL_MIN_MS]);
    await c.advance(POLL_MIN_MS);
    expect(ctl.getSnapshot()).toMatchObject({ stage: "dreaming", title: "Your place" });
    await c.advance(POLL_MIN_MS);
    expect(ctl.getSnapshot().stage).toBe("stitching");
    await c.advance(POLL_MIN_MS);
    expect(ctl.getSnapshot().stage).toBe("ready");
    expect(calls()).toBe(4);
  });

  it("stops asking once the world is ready, and once it has failed, and keeps the failure", async () => {
    const ready = setup([status("ready")]);
    ready.ctl.begin();
    await ready.ctl.settled();
    expect(ready.c.pending()).toEqual([]);
    await ready.c.advance(60_000);
    expect(ready.calls()).toBe(1);

    const failure = { code: ErrorCode.upstream_rejected, quotaReturned: true, retryAllowed: false };
    const failed = setup([status("failed", { failure })]);
    failed.ctl.begin();
    await failed.ctl.settled();
    expect(failed.ctl.getSnapshot()).toMatchObject({ stage: "failed", failure });
    await failed.c.advance(60_000);
    expect(failed.calls()).toBe(1);
  });

  it("tells subscribers about each change, and stops when they leave", async () => {
    const { c, ctl } = setup([status("queued"), status("ready")]);
    let n = 0;
    const off = ctl.subscribe(() => n++);
    ctl.begin();
    await ctl.settled();
    const first = n;
    expect(first).toBeGreaterThan(0);
    off();
    await c.advance(POLL_MIN_MS);
    expect(n).toBe(first);
    expect(ctl.getSnapshot().stage).toBe("ready");
  });
});

describe("HauntController: a hidden tab", () => {
  it("polls once, then waits while the tab is hidden, and polls at once when it is shown after a long time", async () => {
    const s = setup([status("queued"), status("generating")], { visible: false });
    s.ctl.begin();
    await s.ctl.settled();
    expect(s.calls()).toBe(1);
    expect(s.c.pending()).toEqual([]);
    await s.c.advance(10 * 60_000);
    expect(s.calls()).toBe(1);
    await s.setVisible(true);
    await s.c.advance(0);
    expect(s.calls()).toBe(2);
    expect(s.ctl.getSnapshot().stage).toBe("dreaming");
  });

  it("stops the timer when the tab is hidden mid-wait", async () => {
    const s = setup([status("queued")]);
    s.ctl.begin();
    await s.ctl.settled();
    expect(s.c.pending()).toHaveLength(1);
    await s.setVisible(false);
    expect(s.c.pending()).toEqual([]);
    await s.c.advance(60_000);
    expect(s.calls()).toBe(1);
  });
});

describe("HauntController: trouble", () => {
  it("waits out a rate limit, and says nothing is wrong with the place", async () => {
    const s = setup([status("queued"), fail(ErrorCode.rate_limited, 20), status("generating")]);
    s.ctl.begin();
    await s.ctl.settled();
    await s.c.advance(POLL_MIN_MS);
    expect(s.calls()).toBe(2);
    expect(s.ctl.getSnapshot()).toMatchObject({ stage: "queued", stale: true });
    await s.c.advance(19_000);
    expect(s.calls()).toBe(2);
    await s.c.advance(1_000);
    expect(s.calls()).toBe(3);
    expect(s.ctl.getSnapshot()).toMatchObject({ stage: "dreaming", stale: false });
  });

  it("keeps the last Stage, marks it old, and tries again a little later after any other failure", async () => {
    const s = setup([status("generating"), fail(ErrorCode.network_error), status("ingesting")]);
    s.ctl.begin();
    await s.ctl.settled();
    await s.c.advance(POLL_MIN_MS);
    expect(s.ctl.getSnapshot()).toMatchObject({ stage: "dreaming", stale: true });
    expect(s.c.pending()).toEqual([POLL_MAX_MS]);
    await s.c.advance(POLL_MAX_MS);
    expect(s.ctl.getSnapshot()).toMatchObject({ stage: "stitching", stale: false });
  });

  it("leaves for the Expired Screen, and stops, when the world is gone or the Session ended", async () => {
    for (const code of [ErrorCode.world_not_found, ErrorCode.session_expired]) {
      const s = setup([status("queued"), fail(code)]);
      s.ctl.begin();
      await s.ctl.settled();
      await s.c.advance(POLL_MIN_MS);
      expect(s.ctl.getSnapshot().leaveTo, code).toEqual({ screen: "expired" });
      await s.c.advance(60_000);
      expect(s.calls(), code).toBe(2);
      // Hiding and showing the tab does not start it asking again.
      await s.setVisible(false);
      await s.setVisible(true);
      await s.c.advance(60_000);
      expect(s.calls(), code).toBe(2);
    }
  });

  it("says the wait is long after 15 minutes, never cancels, and keeps asking", async () => {
    const s = setup([status("generating")]);
    s.ctl.begin();
    await s.ctl.settled();
    await s.c.advance(OVERDUE_MS - POLL_MIN_MS);
    expect(s.ctl.getSnapshot().overdue).toBe(false);
    await s.c.advance(2 * POLL_MIN_MS);
    expect(s.ctl.getSnapshot()).toMatchObject({ overdue: true, stage: "dreaming" });
    const before = s.calls();
    await s.c.advance(30_000);
    expect(s.calls()).toBeGreaterThan(before);
  });

  it("starts the 15 minutes when it begins, not later", async () => {
    const s = setup([status("generating")]);
    await s.c.advance(10 * 60_000);
    s.ctl.begin();
    await s.ctl.settled();
    // 14 minutes after this controller began is not 15, however long the page had been open.
    await s.c.advance(14 * 60_000);
    expect(s.ctl.getSnapshot().overdue).toBe(false);
    await s.c.advance(65_000);
    expect(s.ctl.getSnapshot().overdue).toBe(true);
  });

  it("never says the wait is long for a place that is ready or has failed", async () => {
    const s = setup([status("ready")]);
    s.ctl.begin();
    await s.ctl.settled();
    await s.c.advance(OVERDUE_MS + 60_000);
    expect(s.ctl.getSnapshot().overdue).toBe(false);
  });
});

describe("HauntController: leaving", () => {
  it("stops the timer and the listener, and ignores an answer that arrives late", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const c = clock();
    const listeners = new Set<() => void>();
    const ctl = createHauntController({
      api: { world: async () => { await gate; return status("ready"); } },
      worldId: "w1", now: c.now, scheduler: c.scheduler, visible: () => true,
      onVisibility: (l) => { listeners.add(l); return () => void listeners.delete(l); },
    });
    ctl.begin();
    expect(listeners.size).toBe(1);
    ctl.destroy();
    expect(listeners.size).toBe(0);
    release();
    await ctl.settled();
    expect(ctl.getSnapshot().stage).toBeNull();
    expect(c.pending()).toEqual([]);
  });

  it("can begin again after a destroy (a StrictMode remount), but not after the world is gone", async () => {
    const s = setup([status("queued"), status("generating")]);
    s.ctl.begin();
    await s.ctl.settled();
    s.ctl.destroy();
    expect(s.c.pending()).toEqual([]);
    s.ctl.begin();
    await s.ctl.settled();
    expect(s.calls()).toBe(2);
    expect(s.listeners()).toBe(1);
    expect(s.c.pending()).toEqual([POLL_MIN_MS]);

    const gone = setup([fail(ErrorCode.world_not_found)]);
    gone.ctl.begin();
    await gone.ctl.settled();
    gone.ctl.destroy();
    gone.ctl.begin();
    await gone.ctl.settled();
    expect(gone.calls()).toBe(1);
  });

  it("asks only one question at a time", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let asked = 0;
    const s = createHauntController({
      api: { world: async () => { asked++; await gate; return status("queued"); } },
      worldId: "w1", now: () => 1, scheduler: clock().scheduler, visible: () => true, onVisibility: () => () => {},
    });
    s.begin();
    s.begin();
    expect(asked).toBe(1);
    release();
    await s.settled();
  });
});
