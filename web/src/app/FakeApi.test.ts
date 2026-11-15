import type { ApiResult } from "@hauntology/shared/app/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoOptions, loadDemoApi, wantsDemo } from "./demo";
import { createFakeApi } from "./FakeApi";

const photo = new Blob([new Uint8Array(10)], { type: "image/jpeg" });
const value = <T>(r: ApiResult<T>): T => {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}`);
  return r.value;
};

afterEach(() => vi.unstubAllEnvs());

describe("createFakeApi", () => {
  it("answers through the ShellApi, on the injected clock", async () => {
    let clock = 1_000;
    const api = createFakeApi({ latencyMs: 0, now: () => clock, stageMs: { queued: 100, generating: 100, ingesting: 100 } });
    expect(value(await api.gallery())).toHaveLength(6);
    const { imageId } = value(await api.uploadPhoto(photo));
    const q = value(await api.quote(imageId));
    const { worldId } = value(await api.createWorld({ imageId, confirmToken: q.confirmToken }));
    expect(value(await api.world(worldId)).status).toBe("queued");
    clock += 150;
    expect(value(await api.world(worldId)).status).toBe("generating");
    clock += 1_000;
    expect(value(await api.world(worldId)).status).toBe("ready");
    expect(value(await api.session()).lastWorldId).toBe(worldId);
  });

  it("waits before every answer", async () => {
    const waits: number[] = [];
    const api = createFakeApi({ latencyMs: 150, sleep: async (ms) => { waits.push(ms); } });
    await api.quota();
    await api.session();
    await api.gallery();
    expect(waits).toEqual([150, 150, 150]);
  });

  it("lets a test make the next call fail", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    api.backend.failNext("gallery", "rate_limited");
    expect(await api.gallery()).toMatchObject({ ok: false, code: "rate_limited" });
    expect((await api.gallery()).ok).toBe(true);
  });

  it("runs the Zero-Quota Path with the options from the query", async () => {
    const api = createFakeApi({ latencyMs: 0, ...demoOptions("?demo=1&zero=1") });
    expect(value(await api.quota())).toEqual({ world: 0, image: 0, llm: 0, tts: 0, stt: 0, live: 0 });
    expect(value(await api.session()).flags.worldGenEnabled).toBe(false);
    expect(value(await api.playStart({ worldId: "attic-room" })).view.ended).toBe(false);
  });
});

describe("demo switches", () => {
  it("wants the demo only for demo=1", () => {
    expect(wantsDemo("?demo=1")).toBe(true);
    expect(wantsDemo("?x=2&demo=1&y=3")).toBe(true);
    for (const s of ["", "?demo=0", "?demo=true", "?demo=", "?Demo=1", "?demo=1x", "?xdemo=1"]) expect(wantsDemo(s), s).toBe(false);
  });

  it("reads the extra switches", () => {
    expect(demoOptions("?demo=1")).toEqual({});
    expect(demoOptions("?demo=1&fast=1").stageMs).toEqual({ queued: 400, generating: 1200, ingesting: 400 });
    expect(demoOptions("?demo=1&zero=1")).toEqual({
      quota: { world: 0, image: 0, llm: 0, tts: 0, stt: 0, live: 0 }, flags: { worldGenEnabled: false },
    });
    expect(demoOptions("?demo=1&turnstile=1").needsTurnstile).toBe(true);
    expect(demoOptions("?demo=1&fail=1").worldOutcome).toBe("failed");
    expect(demoOptions("?demo=1&fast=0&zero=yes")).toEqual({});
  });
});

describe("loadDemoApi", () => {
  it("gives the fake API for ?demo=1 on a development build", async () => {
    const api = await loadDemoApi("?demo=1&fast=1");
    expect(api).not.toBeNull();
    expect(value(await api!.gallery())).toHaveLength(6);
  });

  it("gives nothing without ?demo=1", async () => {
    expect(await loadDemoApi("")).toBeNull();
    expect(await loadDemoApi("?demo=0")).toBeNull();
  });

  it("gives nothing on a production build, even with ?demo=1", async () => {
    vi.stubEnv("PROD", true);
    expect(await loadDemoApi("?demo=1")).toBeNull();
  });
});
