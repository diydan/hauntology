import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ErrorCode } from "../errors";
import { quotaSnapshotArb, shellFlagsArb } from "./capabilities.arb";
import { confirmEventsArb } from "./confirm.arb";
import { advisedDelayArb, errorCodeArb, notErrorCodeArb } from "./errors-copy.arb";
import { playEventsArb } from "./play.arb";
import { DEFAULT_SEED, propParams } from "./prop-config";
import { anyPathArb, flowStateArb, routeArb, worldIdArb } from "./routes.arb";
import { jobStateArb, pollInputArb, sessionOrNullArb, sessionRecordArb } from "./session.arb";
import { inkBitmapArb, sketchDimsArb } from "./sketch-size.arb";
import { JOB_STATES } from "./types";

const sample = <T>(arb: fc.Arbitrary<T>, numRuns = 400): T[] => fc.sample(arb, { seed: DEFAULT_SEED, numRuns });

describe("propParams", () => {
  it("always sets a seed and at least 100 runs", () => {
    expect(propParams()).toEqual({ seed: DEFAULT_SEED, numRuns: 100 });
    expect(propParams(7, 250)).toEqual({ seed: 7, numRuns: 250 });
  });

  it("refuses fewer than 100 runs and a non-integer seed", () => {
    expect(() => propParams(1, 99)).toThrow(RangeError);
    expect(() => propParams(1.5)).toThrow(RangeError);
  });
});

describe("generators are reproducible", () => {
  it("give the same values for the same seed", () => {
    const arbs: fc.Arbitrary<unknown>[] = [routeArb, flowStateArb, confirmEventsArb, playEventsArb, sessionOrNullArb, pollInputArb, inkBitmapArb];
    for (const arb of arbs) {
      const a = JSON.stringify(sample(arb, 50), (_k, v) => (v instanceof Uint8ClampedArray ? Array.from(v) : v));
      const b = JSON.stringify(sample(arb, 50), (_k, v) => (v instanceof Uint8ClampedArray ? Array.from(v) : v));
      expect(a).toBe(b);
    }
  });
});

describe("routes and flow state", () => {
  it("world ids are opaque and at least 128 bits (22 base64url characters)", () => {
    for (const id of sample(worldIdArb)) expect(id).toMatch(/^[A-Za-z0-9_-]{22,43}$/);
  });

  it("only haunt, play and end carry a world id, and every screen is reachable", () => {
    const routes = sample(routeArb, 600);
    for (const r of routes) {
      const needs = r.screen === "haunt" || r.screen === "play" || r.screen === "end";
      expect("worldId" in r).toBe(needs);
    }
    expect(new Set(routes.map((r) => r.screen)).size).toBe(9);
  });

  it("flow states never hold an undefined optional field and reach both values of every flag", () => {
    const states = sample(flowStateArb, 600);
    for (const s of states) for (const v of Object.values(s)) expect(v).not.toBeUndefined();
    for (const key of ["ghostReady", "noticeAcked", "playEnded"] as const) {
      expect(new Set(states.map((s) => s[key])).size).toBe(2);
    }
    expect(states.some((s) => "pickedImageId" in s)).toBe(true);
    expect(states.some((s) => !("pickedImageId" in s))).toBe(true);
    expect(states.some((s) => "worldId" in s)).toBe(true);
    expect(states.some((s) => !("worldId" in s))).toBe(true);
  });

  it("paths include real routes, trailing slashes, query strings and text that is not a path", () => {
    const paths = sample(anyPathArb, 800);
    expect(paths.some((p) => /^\/(gallery|create|confirm)$/.test(p))).toBe(true);
    expect(paths.some((p) => /^\/(haunt|play|end)\/[A-Za-z0-9_-]{22,43}$/.test(p))).toBe(true);
    expect(paths.some((p) => p.endsWith("/") && p.length > 1)).toBe(true);
    expect(paths.some((p) => p.includes("?"))).toBe(true);
    expect(paths.some((p) => !p.startsWith("/"))).toBe(true);
  });
});

describe("quota, flags and errors", () => {
  it("quota counts are whole numbers from zero, and zero is reached on every meter", () => {
    const quotas = sample(quotaSnapshotArb);
    for (const q of quotas) for (const n of Object.values(q)) expect(Number.isInteger(n) && n >= 0).toBe(true);
    for (const m of ["world", "image", "llm", "tts"] as const) {
      expect(quotas.some((q) => q[m] === 0)).toBe(true);
      expect(quotas.some((q) => q[m] > 0)).toBe(true);
    }
  });

  it("flags reach all eight combinations", () => {
    const seen = new Set(sample(shellFlagsArb).map((f) => `${f.worldGenEnabled}${f.dayCapReached}${f.totalCapReached}`));
    expect(seen.size).toBe(8);
  });

  it("error codes are real codes, and the other strings are not", () => {
    const codes = Object.values(ErrorCode) as string[];
    for (const c of sample(errorCodeArb)) expect(codes).toContain(c);
    const others = sample(notErrorCodeArb, 600);
    for (const s of others) expect(codes).not.toContain(s);
    for (const tricky of ["toString", "constructor", "__proto__"]) expect(others).toContain(tricky);
  });

  it("advised delays are finite and include negative, zero and large values", () => {
    const delays = sample(advisedDelayArb, 600);
    for (const d of delays) expect(Number.isFinite(d)).toBe(true);
    expect(delays.some((d) => d < 0)).toBe(true);
    expect(delays.some((d) => d === 0)).toBe(true);
    expect(delays.some((d) => d > 120)).toBe(true);
  });
});

describe("event sequences reach the cases the properties need", () => {
  it("confirm sequences use every event kind, and `quote_ok` is followed by `enter` often", () => {
    const seqs = sample(confirmEventsArb, 300);
    const kinds = new Set(seqs.flat().map((e) => e.t));
    expect(kinds.size).toBe(8);
    const entered = seqs.filter((s) => {
      const q = s.findIndex((e) => e.t === "quote_ok");
      return q >= 0 && s.slice(q + 1).some((e) => e.t === "enter");
    });
    expect(entered.length).toBeGreaterThan(30);
    expect(seqs.some((s) => s.length === 0)).toBe(true);
  });

  it("play sequences use every event kind, and `ended` is both true and false", () => {
    const seqs = sample(playEventsArb, 300);
    expect(new Set(seqs.flat().map((e) => e.t)).size).toBe(6);
    const views = seqs.flat().flatMap((e) => (e.t === "view" ? [e] : []));
    expect(views.some((v) => v.ended)).toBe(true);
    expect(views.some((v) => !v.ended)).toBe(true);
    expect(new Set(views.map((v) => v.found))).toEqual(new Set([0, 1, 2, 3]));
  });
});

describe("session and polling inputs", () => {
  it("session records omit absent ids, and a missing session is null", () => {
    const records = sample(sessionRecordArb);
    for (const r of records) for (const v of Object.values(r)) expect(v).not.toBeUndefined();
    expect(records.some((r) => "lastWorldId" in r)).toBe(true);
    expect(records.some((r) => !("lastPlayId" in r))).toBe(true);
    const withNull = sample(sessionOrNullArb);
    expect(withNull.some((s) => s === null)).toBe(true);
    expect(withNull.some((s) => s !== null)).toBe(true);
  });

  it("job states cover all five", () => {
    expect(new Set(sample(jobStateArb))).toEqual(new Set(JOB_STATES));
  });

  it("poll inputs keep the timeline in order and reach overdue, hidden, rate-limited and terminal cases", () => {
    const inputs = sample(pollInputArb, 800);
    for (const p of inputs) {
      expect(p.startedAt).toBeLessThanOrEqual(p.lastPollAt);
      expect(p.lastPollAt).toBeLessThanOrEqual(p.now);
    }
    expect(inputs.some((p) => p.now - p.startedAt > 15 * 60_000)).toBe(true);
    expect(inputs.some((p) => p.now - p.startedAt <= 15 * 60_000)).toBe(true);
    expect(inputs.some((p) => !p.visible)).toBe(true);
    expect(inputs.some((p) => p.rateLimitedUntil !== null && p.rateLimitedUntil > p.now)).toBe(true);
    expect(inputs.some((p) => p.rateLimitedUntil === null)).toBe(true);
    expect(inputs.some((p) => p.stage === "ready" || p.stage === "failed")).toBe(true);
    expect(inputs.some((p) => p.now - p.lastPollAt > 5000)).toBe(true);
  });
});

describe("sketch generators", () => {
  it("dimensions are positive and include thin, small and over-512 canvases", () => {
    const dims = sample(sketchDimsArb, 800);
    for (const d of dims) expect(d.w >= 1 && d.h >= 1 && Number.isInteger(d.w) && Number.isInteger(d.h)).toBe(true);
    expect(dims.some((d) => d.w === 1 || d.h === 1)).toBe(true);
    expect(dims.some((d) => Math.max(d.w, d.h) <= 512)).toBe(true);
    expect(dims.some((d) => Math.max(d.w, d.h) > 512)).toBe(true);
  });

  it("bitmaps hold exactly the ink they report, and coverage straddles the 0.5% floor", () => {
    const items = sample(inkBitmapArb, 600);
    for (const { bitmap, inkPixels, coverage } of items) {
      const total = bitmap.width * bitmap.height;
      expect(bitmap.data.length).toBe(total * 4);
      let ink = 0;
      for (let i = 0; i < total; i++) if (bitmap.data[i * 4] === 0) ink++;
      expect(ink).toBe(inkPixels);
      expect(coverage).toBe(inkPixels / total);
    }
    expect(items.some((i) => i.coverage === 0)).toBe(true);
    expect(items.some((i) => i.coverage < 0.005 && i.coverage > 0)).toBe(true);
    expect(items.some((i) => i.coverage === 0.005)).toBe(true);
    expect(items.some((i) => i.coverage > 0.005)).toBe(true);
  });
});
