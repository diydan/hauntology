import { describe, expect, it } from "vitest";
import { QuoteSchema as ShellQuoteSchema, QuotaSnapshotSchema, WorldStatusSchema } from "../app/api-schemas";
import { JOB_STATES, type JobState } from "../app/types";
import type { WorldManifest } from "./manifest";
import { JobStatusSchema, QuotaSchema, QuoteSchema, WorldManifestSchema, progressLabel, type JobStatus } from "./responses";

const manifestOf = (id: string): WorldManifest => ({
  id,
  title: "The kitchen",
  createdAt: 1_800_000_000_000,
  source: "upload",
  assets: { splat: [{ path: "splat-500k.spz", bytes: 10, lod: "500k" }], collider: { path: "collider.glb", bytes: 4 }, thumb: { path: "thumb.jpg", bytes: 3 } },
  orientation: { upFix: [0, 0, 0, 1], scale: 1 },
  spawn: { position: [0, 1.6, 0], yaw: 0 },
  floorY: 0,
  bounds: { min: [-5, 0, -5], max: [5, 3, 5] },
  brief: "A narrow kitchen with a window over the sink.",
});
const FAILURE = { code: "upstream_rejected", quotaReturned: true, retryAllowed: false } as const;
const LABELS: Record<JobState, string> = { queued: "Queued", generating: "Dreaming", ingesting: "Stitching", ready: "Ready", failed: "It did not work" };

describe("the schemas are written once", () => {
  it("are the ones the shell reads", () => {
    expect(QuotaSchema).toBe(QuotaSnapshotSchema);
    expect(QuoteSchema).toBe(ShellQuoteSchema);
    expect(WorldManifestSchema.safeParse(manifestOf("w-1")).success).toBe(true);
  });
});

describe("QuotaSchema", () => {
  it("is the six meters, whole numbers from none up, and nothing else is kept", () => {
    expect(QuotaSchema.parse({ world: 2, image: 8, llm: 40, tts: 40, stt: 20, live: 30 })).toEqual({ world: 2, image: 8, llm: 40, tts: 40, stt: 20, live: 30 });
    const good = { world: 0, image: 0, llm: 0, tts: 0, stt: 0, live: 0 };
    for (const meter of Object.keys(good)) {
      expect(QuotaSchema.safeParse({ ...good, [meter]: -1 }).success, `${meter} -1`).toBe(false);
      expect(QuotaSchema.safeParse({ ...good, [meter]: 1.5 }).success, `${meter} 1.5`).toBe(false);
      expect(QuotaSchema.safeParse({ ...good, [meter]: "2" }).success, `${meter} text`).toBe(false);
      const { [meter as keyof typeof good]: _gone, ...rest } = good;
      expect(QuotaSchema.safeParse(rest).success, `no ${meter}`).toBe(false);
    }
    expect(QuotaSchema.parse({ ...good, sid: "someone else" })).toEqual(good);
  });
});

describe("QuoteSchema", () => {
  const quota = { world: 1, image: 1, llm: 1, tts: 1, stt: 1, live: 1 };
  const quote = { imageUrl: "/api/images/img-1", quota, confirmToken: "token", needsTurnstile: false };
  it("is an address on this origin, the quota, the token and the Turnstile switch (and its site key only when it is on)", () => {
    expect(QuoteSchema.parse(quote)).toEqual(quote);
    expect(QuoteSchema.parse({ ...quote, needsTurnstile: true, turnstileSiteKey: "0xSITE" }).turnstileSiteKey).toBe("0xSITE");
  });
  it("refuses an address off this origin, a missing token, and a quota that does not fit", () => {
    for (const imageUrl of ["https://cdn.example/x.jpg", "//cdn.example/x.jpg", "api/images/x", "/a b", "/a\\b", ""]) expect(QuoteSchema.safeParse({ ...quote, imageUrl }).success, imageUrl).toBe(false);
    expect(QuoteSchema.safeParse({ ...quote, confirmToken: "" }).success).toBe(false);
    expect(QuoteSchema.safeParse({ ...quote, confirmToken: "x".repeat(513) }).success).toBe(false);
    expect(QuoteSchema.safeParse({ ...quote, quota: { ...quota, world: -1 } }).success).toBe(false);
    expect(QuoteSchema.safeParse({ ...quote, needsTurnstile: "no" }).success).toBe(false);
    expect(QuoteSchema.safeParse({ ...quote, turnstileSiteKey: "" }).success).toBe(false);
  });
});

describe("progressLabel", () => {
  it("is a plain word for each of the five states, the same the Haunt screen shows", () => {
    for (const state of JOB_STATES) expect(progressLabel(state), state).toBe(LABELS[state]);
    expect(new Set(JOB_STATES.map(progressLabel)).size).toBe(5);
  });
});

describe("JobStatusSchema (Requirements 7.3 and 8.2)", () => {
  const base = (status: JobState, over: Record<string, unknown> = {}) => ({ id: "w-1", status, label: LABELS[status], ...over });

  it("takes the status of each state, with the manifest exactly for a ready world", () => {
    for (const status of JOB_STATES) {
      const extra = status === "ready" ? { manifest: manifestOf("w-1") } : status === "failed" ? { failure: FAILURE } : {};
      const s = JobStatusSchema.parse(base(status, { title: "The kitchen", thumbUrl: "/api/worlds/w-1/assets/thumb.jpg", ...extra }));
      expect(s.status).toBe(status);
      expect(s.label).toBe(LABELS[status]);
    }
  });

  /** The rules, written out a second way: what a status of this shape must be for the schema to take it. */
  const oracle = (c: { status: JobState; label: string; manifest: "none" | "own" | "other"; failure: boolean; shared: "none" | "on" | "off" }): boolean =>
    c.label === LABELS[c.status] &&
    (c.status === "ready" ? c.manifest === "own" : c.manifest === "none") &&
    (c.status === "failed" || !c.failure) &&
    (c.status === "ready" || c.shared !== "on");

  it("takes exactly the shapes the rules allow, over every combination of state, label, manifest, failure and link (checked against the rules written out again)", () => {
    let taken = 0;
    let total = 0;
    for (const status of JOB_STATES) {
      for (const label of [LABELS[status], "Ready", "", "queued"]) {
        for (const manifest of ["none", "own", "other"] as const) {
          for (const failure of [false, true]) {
            for (const shared of ["none", "on", "off"] as const) {
              const value = {
                ...base(status, { label }),
                ...(manifest === "none" ? {} : { manifest: manifestOf(manifest === "own" ? "w-1" : "w-other") }),
                ...(failure ? { failure: FAILURE } : {}),
                ...(shared === "none" ? {} : { shared: shared === "on" }),
              };
              const want = oracle({ status, label, manifest, failure, shared });
              expect(JobStatusSchema.safeParse(value).success, JSON.stringify({ status, label, manifest, failure, shared })).toBe(want);
              total++;
              if (want) taken++;
            }
          }
        }
      }
    }
    expect(total).toBe(5 * 4 * 3 * 2 * 3);
    expect(taken).toBeGreaterThan(10);
  });

  it("is a status the shell reads too: every JobStatus is a WorldStatus", () => {
    const ready: JobStatus = JobStatusSchema.parse(base("ready", { manifest: manifestOf("w-1"), title: "T", shared: true }));
    const view = WorldStatusSchema.parse(ready);
    expect(view).toEqual({ id: "w-1", status: "ready", title: "T", shared: true });
    expect(view).not.toHaveProperty("manifest");
  });

  it("refuses a thumbnail that is not on this origin, and a manifest that does not fit", () => {
    expect(JobStatusSchema.safeParse(base("queued", { thumbUrl: "https://cdn.worldlabs.example/t.jpg" })).success).toBe(false);
    expect(JobStatusSchema.safeParse(base("ready", { manifest: { ...manifestOf("w-1"), assets: {} } })).success).toBe(false);
  });
});
