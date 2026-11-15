import { JOB_TIMEOUT_MS, POLL_MS } from "@hauntology/shared/world/job";
import { describe, expect, it } from "vitest";
import { FakeIngestor, FakeWorldLabs, MemoryImageStore, MemorySpendGuard } from "../worlds/fakes";
import { fakeState } from "../worlds/fake-cloudflare";
import { sampleManifest } from "../worlds/test-kit";
import { WorldJob, type JobDeps } from "./world-job";

const T0 = Date.UTC(2026, 10, 15, 12, 0, 0);
const WORLD = "w-aaaaaaaaaaaaaaaaaaaaaa";
const OWNER = "sid-owner-0000000000000";
const PNG = Uint8Array.from([137, 80, 78, 71, 9]);

function setup(over: { deps?: boolean } = {}) {
  const parts = fakeState();
  const clock = { t: T0 };
  const guard = new MemorySpendGuard(undefined, () => clock.t);
  const upstream = new FakeWorldLabs();
  const ingestor = new FakeIngestor(sampleManifest);
  const images = new MemoryImageStore().put({ id: "img-1", ownerSid: OWNER, sha256: "ab".repeat(32), moderation: "safe", contentType: "image/png" }, PNG);
  const guardPort = { commit: (t: never) => guard.commit(t), release: (t: never) => guard.release(t), setKill: async (on: boolean) => { guard.killed = on; } };
  const failures = { commit: 0, release: 0 };
  const calls = { commit: 0, release: 0 };
  const wrapped = {
    commit: async (t: never) => { calls.commit++; if (failures.commit > 0) { failures.commit--; throw new Error("down"); } return guardPort.commit(t); },
    release: async (t: never) => { calls.release++; if (failures.release > 0) { failures.release--; throw new Error("down"); } return guardPort.release(t); },
    setKill: guardPort.setKill,
  };
  const deps: JobDeps = { upstream, ingestor, images, guard: wrapped };
  const job = new WorldJob(parts.state, {}, over.deps === false ? undefined : deps, () => clock.t, () => 0.5);
  const call = async (path: string, method: string, body?: unknown) => {
    const res = await job.fetch(new Request(`https://world-job${path}`, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
    const text = await res.text();
    return { status: res.status, json: text === "" ? null : (JSON.parse(text) as unknown) };
  };
  const record = async () => (await call("/record", "GET")).json as { status: string; failure?: { code: string; quotaReturned: boolean; retryAllowed: boolean }; manifest?: unknown } | null;
  const begin = async () => {
    await call("/record", "PUT", { id: WORLD, kind: "user", ownerSid: OWNER, status: "queued", imageId: "img-1" });
    const r = await guard.reserve({ meter: "world", sessionId: OWNER, ipHash: "ip", now: clock.t });
    if (!r.ok) throw new Error("reserve refused");
    const res = await call("/start", "POST", { ticket: r.ticket, imageId: "img-1", ownerSid: OWNER });
    return { ticket: r.ticket, res };
  };
  /** Wakes the job at each alarm it sets, until it sets none or `limit` wakes have run. */
  const run = async (limit = 200) => {
    let n = 0;
    while (parts.alarm.at !== null && n < limit) {
      clock.t = Math.max(clock.t, parts.alarm.at);
      parts.alarm.at = null; // the runtime clears an alarm as its handler starts
      await job.alarm();
      n++;
    }
    return n;
  };
  return { parts, clock, guard, upstream, ingestor, images, deps, job, call, record, begin, run, failures, calls };
}

describe("start", () => {
  it("records the job, wakes it at once, and answers 202; a repeat changes nothing", async () => {
    const t = setup();
    const { res } = await t.begin();
    expect(res).toEqual({ status: 202, json: { ok: true } });
    expect(t.parts.alarm.at).toBe(T0);
    const sets = t.parts.alarm.sets.length;
    expect((await t.call("/start", "POST", { ticket: { id: "other", meter: "world", sessionId: OWNER, issuedAt: 1 }, imageId: "img-1", ownerSid: OWNER })).status).toBe(200);
    expect(t.parts.alarm.sets).toHaveLength(sets);
    expect(t.upstream.generated).toHaveLength(0); // nothing is called until the wake
  });

  it("answers 503 and spends nothing when no world service is wired", async () => {
    const t = setup({ deps: false });
    await t.call("/record", "PUT", { id: WORLD, kind: "user", ownerSid: OWNER, status: "queued" });
    const res = await t.call("/start", "POST", { ticket: { id: "t", meter: "world", sessionId: OWNER, issuedAt: 1 }, imageId: "img-1", ownerSid: OWNER });
    expect(res).toEqual({ status: 503, json: { ok: false, code: "world_gen_disabled" } });
    expect(t.parts.alarm.at).toBeNull();
  });

  it("refuses a body that does not fit, a ticket that is not for the world meter, the wrong owner, and a world with no record", async () => {
    const t = setup();
    await t.call("/record", "PUT", { id: WORLD, kind: "user", ownerSid: OWNER, status: "queued" });
    const ok = { ticket: { id: "t", meter: "world", sessionId: OWNER, issuedAt: 1 }, imageId: "img-1", ownerSid: OWNER };
    const bad: unknown[] = [
      {}, [], "x", null, { ...ok, ticket: { ...ok.ticket, meter: "image" } }, { ...ok, ticket: { ...ok.ticket, id: "" } }, { ...ok, ticket: { ...ok.ticket, issuedAt: "x" } },
      { ...ok, ticket: null }, { ...ok, imageId: "a/b" }, { ...ok, imageId: 5 }, { ...ok, ownerSid: "sid-thief" }, { ...ok, ownerSid: undefined },
    ];
    for (const b of bad) expect((await t.call("/start", "POST", b)).status, JSON.stringify(b)).toBe(400);
    expect(t.parts.alarm.at).toBeNull();
    expect((await setup().call("/start", "POST", ok)).status).toBe(400); // no record
    expect((await t.call("/start", "GET")).status).toBe(405);
  });
});

describe("the picture's content type", () => {
  it("is the one the bytes were stored with, not the one the store's lookup reports (the real store's lookup always says octet-stream)", async () => {
    const t = setup();
    const real = t.images;
    // Like CloudflareImageStore: `find` knows no content type, `read` has the stored one.
    t.deps.images = {
      find: async (id) => { const i = await real.find(id); return i === null ? null : { ...i, contentType: "application/octet-stream" }; },
      read: (id) => real.read(id),
    };
    const job = new WorldJob(t.parts.state, {}, t.deps, () => t.clock.t, () => 0.5);
    const call = (path: string, body: unknown) => job.fetch(new Request(`https://world-job${path}`, { method: path === "/record" ? "PUT" : "POST", body: JSON.stringify(body) }));
    await call("/record", { id: WORLD, kind: "user", ownerSid: OWNER, status: "queued", imageId: "img-1" });
    const r = await t.guard.reserve({ meter: "world", sessionId: OWNER, ipHash: "ip", now: t.clock.t });
    if (!r.ok) throw new Error("reserve refused");
    await call("/start", { ticket: r.ticket, imageId: "img-1", ownerSid: OWNER });
    t.parts.alarm.at = null;
    await job.alarm();
    expect(t.upstream.generated[0]).toEqual({ image: PNG, contentType: "image/png", name: WORLD });
  });
});

describe("the job", () => {
  it("makes a world: generate, poll until done, ingest, ready, and the unit stays spent", async () => {
    const t = setup();
    t.upstream.pollScript = [{ ok: true, state: "pending" }, { ok: true, state: "pending" }, { ok: true, state: "done" }];
    const { ticket } = await t.begin();
    await t.run();

    expect(t.upstream.generated).toHaveLength(1);
    expect(t.upstream.generated[0]).toEqual({ image: PNG, contentType: "image/png", name: WORLD });
    expect(t.upstream.polled).toEqual(["op-1", "op-1", "op-1"]);
    expect(t.ingestor.calls).toEqual([{ worldId: WORLD, operationId: "op-1", ownerSid: OWNER, title: "A place", brief: "", source: "upload", createdAt: expect.any(Number) }]);
    const rec = await t.record();
    expect(rec?.status).toBe("ready");
    expect(rec?.manifest).toEqual(sampleManifest(WORLD));
    expect(t.guard.stateOf(ticket.id)).toBe("committed");
    expect(t.parts.alarm.at).toBeNull();
  });

  it("gives ingest the record's title, Place Brief and origin, and the time", async () => {
    const t = setup();
    await t.call("/record", "PUT", { id: WORLD, kind: "user", ownerSid: OWNER, status: "queued", imageId: "img-1", title: "The kitchen", brief: "A quiet kitchen.", source: "sketch" });
    const r = await t.guard.reserve({ meter: "world", sessionId: OWNER, ipHash: "ip", now: T0 });
    if (!r.ok) throw new Error("reserve refused");
    await t.call("/start", "POST", { ticket: r.ticket, imageId: "img-1", ownerSid: OWNER });
    await t.run();
    expect(t.ingestor.calls[0]).toMatchObject({ title: "The kitchen", brief: "A quiet kitchen.", source: "sketch" });
    expect(t.ingestor.calls[0]?.createdAt).toBeGreaterThanOrEqual(T0);
  });

  it("shows each state on the record as it goes", async () => {
    const t = setup();
    t.upstream.pollScript = [{ ok: true, state: "pending" }, { ok: true, state: "done" }];
    await t.begin();
    const seen: string[] = [(await t.record())!.status];
    for (let i = 0; i < 6 && t.parts.alarm.at !== null; i++) {
      t.clock.t = Math.max(t.clock.t, t.parts.alarm.at);
      t.parts.alarm.at = null;
      await t.job.alarm();
      seen.push((await t.record())!.status);
    }
    expect(seen).toEqual(["queued", "generating", "generating", "ingesting", "ready"]);
  });

  it("polls about every 10 seconds, with the jitter the random number gives", async () => {
    const t = setup();
    t.upstream.pollScript = [{ ok: true, state: "pending" }, { ok: true, state: "pending" }, { ok: true, state: "done" }];
    await t.begin();
    const times: number[] = [];
    while (t.parts.alarm.at !== null) {
      times.push(t.parts.alarm.at);
      t.clock.t = t.parts.alarm.at;
      t.parts.alarm.at = null;
      await t.job.alarm();
    }
    // wake 0 starts, wakes 1 to 3 poll, 4 ingests
    expect(times[1]! - times[0]!).toBe(POLL_MS);
    expect(times[2]! - times[1]!).toBe(POLL_MS);
  });

  it("waits and tries again when the world service is rate limited, honouring how long it said", async () => {
    const t = setup();
    t.upstream.generateScript = [{ ok: false, kind: "rate_limited", retryAfterMs: 90_000 }, { ok: true, operationId: "op-9" }];
    await t.begin();
    t.parts.alarm.at = null;
    await t.job.alarm();
    expect(t.parts.alarm.at).toBe(T0 + 90_000);
    expect((await t.record())?.status).toBe("queued");
    await t.run();
    expect(t.upstream.generated).toHaveLength(2);
    expect((await t.record())?.status).toBe("ready");
  });

  it("treats a thrown call and a server fault as a pause, and goes on", async () => {
    const t = setup();
    t.upstream.pollScript = [async () => { throw new Error("network"); }, { ok: false, kind: "transient" }, { ok: true, state: "done" }];
    const { ticket } = await t.begin();
    await t.run();
    expect((await t.record())?.status).toBe("ready");
    expect(t.guard.stateOf(ticket.id)).toBe("committed");
  });

  it("waits and tries again when asking the service throws, before there is an operation too", async () => {
    const t = setup();
    t.upstream.generateScript = [async () => { throw new Error("network"); }, { ok: true, operationId: "op-3" }];
    await t.begin();
    t.parts.alarm.at = null;
    await t.job.alarm();
    expect((await t.record())?.status).toBe("queued");
    expect(t.parts.alarm.at).toBe(T0 + 20_000); // a pause, not a failure and not a poll
    await t.run();
    expect(t.upstream.generated).toHaveLength(2);
    expect((await t.record())?.status).toBe("ready");
  });

  it("fails when the world service is out of credits: the unit comes back, worlds are closed, no retry is offered", async () => {
    const t = setup();
    t.upstream.generateScript = [{ ok: false, kind: "no_credits" }];
    const { ticket } = await t.begin();
    await t.run();
    const rec = await t.record();
    expect(rec).toMatchObject({ status: "failed", failure: { code: "upstream_no_credits", quotaReturned: true, retryAllowed: false } });
    expect(t.guard.stateOf(ticket.id)).toBe("released");
    expect((await t.guard.status()).killed).toBe(true);
    expect(t.upstream.generated).toHaveLength(1); // never retried
  });

  it("fails when the world service refuses the picture, or gives up on the operation: the unit comes back, the switch stays off", async () => {
    for (const script of [{ gen: [{ ok: false as const, kind: "rejected" as const }], poll: undefined }, { gen: undefined, poll: [{ ok: true as const, state: "failed" as const }] }]) {
      const t = setup();
      if (script.gen) t.upstream.generateScript = script.gen;
      if (script.poll) t.upstream.pollScript = script.poll;
      const { ticket } = await t.begin();
      await t.run();
      expect(await t.record()).toMatchObject({ status: "failed", failure: { code: "upstream_rejected", quotaReturned: true, retryAllowed: false } });
      expect(t.guard.stateOf(ticket.id)).toBe("released");
      expect((await t.guard.status()).killed).toBe(false);
    }
  });

  it("fails with a timeout after 20 minutes of the service never finishing, and releases once", async () => {
    const t = setup();
    t.upstream.pollScript = [{ ok: true, state: "pending" }];
    const { ticket } = await t.begin();
    await t.run();
    expect(await t.record()).toMatchObject({ status: "failed", failure: { code: "timeout", quotaReturned: true, retryAllowed: true } });
    expect(t.guard.stateOf(ticket.id)).toBe("released");
    expect(t.clock.t).toBeGreaterThanOrEqual(T0 + JOB_TIMEOUT_MS);
    expect(t.clock.t).toBeLessThan(T0 + JOB_TIMEOUT_MS + 1000);
    expect(t.parts.alarm.at).toBeNull();
  });

  it("fails with a timeout when the service keeps failing, with waits that grow", async () => {
    const t = setup();
    t.upstream.generateScript = [{ ok: false, kind: "transient" }];
    const { ticket } = await t.begin();
    const gaps: number[] = [];
    let last = t.clock.t;
    while (t.parts.alarm.at !== null) {
      gaps.push(t.parts.alarm.at - last);
      last = t.clock.t = t.parts.alarm.at;
      t.parts.alarm.at = null;
      await t.job.alarm();
    }
    expect(gaps.slice(1, 5)).toEqual([20_000, 40_000, 80_000, 120_000]);
    expect(await t.record()).toMatchObject({ status: "failed", failure: { code: "timeout" } });
    expect(t.guard.stateOf(ticket.id)).toBe("released");
  });

  it("fails when ingest fails, or hands back a manifest that does not fit, and releases", async () => {
    for (const script of [[{ ok: false as const, code: "ingest_failed" as const }], [{ ok: true as const, manifest: { ...sampleManifest(WORLD), assets: { splat: [] } } }]]) {
      const t = setup();
      t.ingestor.script = script as never;
      const { ticket } = await t.begin();
      await t.run();
      expect(await t.record()).toMatchObject({ status: "failed", failure: { code: "ingest_failed", quotaReturned: true, retryAllowed: true } });
      expect(t.guard.stateOf(ticket.id)).toBe("released");
      expect((await t.record())?.manifest).toBeUndefined();
    }
  });

  it("waits and tries ingest again when the service rate limits it", async () => {
    const t = setup();
    t.ingestor.script = [{ ok: false, kind: "rate_limited" } as never, { ok: true, manifest: sampleManifest(WORLD) }];
    await t.begin();
    await t.run();
    expect(t.ingestor.calls).toHaveLength(2);
    expect((await t.record())?.status).toBe("ready");
  });

  it("fails when the picture is gone before the job could send it", async () => {
    const t = setup();
    const { ticket } = await t.begin();
    t.images.images.delete("img-1");
    await t.run();
    expect(await t.record()).toMatchObject({ status: "failed", failure: { code: "upstream_rejected" } });
    expect(t.guard.stateOf(ticket.id)).toBe("released");
    expect(t.upstream.generated).toHaveLength(0);
  });

  it("sends the service the world's own id as the name, and nothing the visitor wrote", async () => {
    const t = setup();
    await t.begin();
    await t.run();
    expect(JSON.stringify(t.upstream.generated[0]?.name)).toBe(JSON.stringify(WORLD));
    expect(Object.keys(t.upstream.generated[0] ?? {}).sort()).toEqual(["contentType", "image", "name"]);
  });

  it("settles a ticket once: later wakes of a finished job do nothing", async () => {
    const t = setup();
    const { ticket } = await t.begin();
    await t.run();
    const used = t.guard.usedOn("world", OWNER);
    for (let i = 0; i < 3; i++) await t.job.alarm();
    expect(t.guard.usedOn("world", OWNER)).toBe(used);
    expect(t.guard.stateOf(ticket.id)).toBe("committed");
    // Nothing was called again: not the service, not ingest, not the guard.
    expect(t.upstream.generated).toHaveLength(1);
    expect(t.upstream.polled).toHaveLength(1);
    expect(t.ingestor.calls).toHaveLength(1);
    expect(t.calls).toEqual({ commit: 1, release: 0 });
    expect(t.parts.alarm.at).toBeNull();
  });

  it("keeps an effect it could not settle and tries again soon, settling once", async () => {
    const t = setup();
    t.failures.commit = 2;
    const { ticket } = await t.begin();
    // run until the job is ready
    while (t.parts.alarm.at !== null && (await t.record())?.status !== "ready") {
      t.clock.t = Math.max(t.clock.t, t.parts.alarm.at);
      t.parts.alarm.at = null;
      await t.job.alarm();
    }
    expect((await t.record())?.status).toBe("ready");
    expect(t.guard.stateOf(ticket.id)).toBe("reserved"); // the commit failed
    expect(t.parts.alarm.at).toBe(t.clock.t + 30_000);
    await t.run();
    expect(t.guard.stateOf(ticket.id)).toBe("committed");
    expect(t.failures.commit).toBe(0);
  });

  it("keeps a release it could not deliver, too", async () => {
    const t = setup();
    t.upstream.generateScript = [{ ok: false, kind: "rejected" }];
    t.failures.release = 1;
    const { ticket } = await t.begin();
    await t.run();
    expect(t.guard.stateOf(ticket.id)).toBe("released");
    expect(t.failures.release).toBe(0);
  });
});

describe("deleting a world while its job is unfinished", () => {
  it("gives the unit back when nothing was asked of the service yet, and stops the job", async () => {
    const t = setup();
    const { ticket } = await t.begin();
    expect((await t.call("/record", "DELETE")).status).toBe(204);
    expect(t.guard.stateOf(ticket.id)).toBe("released");
    expect(t.parts.alarm.at).toBeNull();
    expect(t.parts.data.size).toBe(0);
    await t.job.alarm();
    expect(t.upstream.generated).toHaveLength(0);
  });

  it("keeps the unit spent once the service was asked, because it may have charged", async () => {
    const t = setup();
    t.upstream.pollScript = [{ ok: true, state: "pending" }];
    const { ticket } = await t.begin();
    t.parts.alarm.at = null;
    await t.job.alarm(); // queued -> generating
    await t.call("/record", "DELETE");
    expect(t.guard.stateOf(ticket.id)).toBe("committed");
    expect(t.parts.alarm.at).toBeNull();
  });

  it("does not settle a job that already finished a second time", async () => {
    const t = setup();
    const { ticket } = await t.begin();
    await t.run();
    await t.call("/record", "DELETE");
    expect(t.guard.stateOf(ticket.id)).toBe("committed");
    expect(t.guard.usedOn("world", OWNER)).toBe(1);
    expect(t.calls).toEqual({ commit: 1, release: 0 }); // no second settling
  });

  it("settles what a finished job still owed", async () => {
    const t = setup();
    t.failures.commit = 1;
    const { ticket } = await t.begin();
    while (t.parts.alarm.at !== null && (await t.record())?.status !== "ready") {
      t.clock.t = Math.max(t.clock.t, t.parts.alarm.at);
      t.parts.alarm.at = null;
      await t.job.alarm();
    }
    await t.call("/record", "DELETE");
    expect(t.guard.stateOf(ticket.id)).toBe("committed");
  });
});

describe("a job with no wiring", () => {
  it("does nothing on a wake", async () => {
    const t = setup({ deps: false });
    await t.job.alarm();
    expect(t.parts.data.size).toBe(0);
  });
});
