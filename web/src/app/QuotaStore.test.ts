import type { ApiResult } from "@hauntology/shared/app/api";
import type { QuotaSnapshot, SessionRecord } from "@hauntology/shared/app/types";
import { describe, expect, it, vi } from "vitest";
import { createFakeApi } from "./FakeApi";
import { capabilitiesOf, createQuotaStore } from "./QuotaStore";

const flags = { worldGenEnabled: true, dayCapReached: false, totalCapReached: false, voiceEnabled: true, liveEnabled: false, partyEnabled: true, puzzlesEnabled: true, ghostModel: false };
const session: SessionRecord = { ackNotice: false, flags };
const quota: QuotaSnapshot = { world: 2, image: 8, llm: 40, tts: 40, stt: 20, live: 30 };

/** An API whose two boot calls are counted and answer when the test says so. */
function controlled() {
  let resolveSession!: (r: ApiResult<SessionRecord>) => void;
  let resolveQuota!: (r: ApiResult<QuotaSnapshot>) => void;
  const calls = { session: 0, quota: 0 };
  const api = {
    session: () => { calls.session++; return new Promise<ApiResult<SessionRecord>>((r) => { resolveSession = r; }); },
    quota: () => { calls.quota++; return new Promise<ApiResult<QuotaSnapshot>>((r) => { resolveQuota = r; }); },
  };
  return { api, calls, answer: (s: ApiResult<SessionRecord>, q: ApiResult<QuotaSnapshot>) => { resolveSession(s); resolveQuota(q); } };
}
const okS = (s: SessionRecord = session): ApiResult<SessionRecord> => ({ ok: true, value: s });
const okQ = (q: QuotaSnapshot = quota): ApiResult<QuotaSnapshot> => ({ ok: true, value: q });

describe("QuotaStore", () => {
  it("starts idle and asks for nothing until load()", () => {
    const c = controlled();
    const store = createQuotaStore(c.api);
    expect(store.getSnapshot()).toEqual({ status: "idle" });
    expect(c.calls).toEqual({ session: 0, quota: 0 });
  });

  it("makes one session request and one quota request, however many callers ask", async () => {
    const c = controlled();
    const store = createQuotaStore(c.api);
    const callers = Array.from({ length: 10 }, () => store.load());
    expect(store.getSnapshot()).toEqual({ status: "loading" });
    c.answer(okS(), okQ());
    const results = await Promise.all(callers);
    expect(c.calls).toEqual({ session: 1, quota: 1 });
    for (const r of results) expect(r).toBe(store.getSnapshot());
    expect(store.getSnapshot()).toEqual({ status: "ready", session, quota });
    await store.load();
    expect(c.calls).toEqual({ session: 1, quota: 1 });
  });

  it("is ready only when both answers are in", async () => {
    const c = controlled();
    const store = createQuotaStore(c.api);
    const done = store.load();
    expect(store.getSnapshot().status).toBe("loading");
    c.answer(okS(), okQ());
    await done;
    expect(store.getSnapshot().status).toBe("ready");
  });

  it("fails with the session's code first, else the quota's, and carries retryAfterSec", async () => {
    const a = controlled();
    const s1 = createQuotaStore(a.api);
    const d1 = s1.load();
    a.answer({ ok: false, code: "bad_origin" }, { ok: false, code: "rate_limited", retryAfterSec: 9 });
    await d1;
    expect(s1.getSnapshot()).toEqual({ status: "failed", code: "bad_origin" });

    const b = controlled();
    const s2 = createQuotaStore(b.api);
    const d2 = s2.load();
    b.answer(okS(), { ok: false, code: "rate_limited", retryAfterSec: 9 });
    await d2;
    expect(s2.getSnapshot()).toEqual({ status: "failed", code: "rate_limited", retryAfterSec: 9 });
  });

  it("does not ask again after a failure unless retry() is called, and retry asks once more", async () => {
    const api = { session: vi.fn(async () => okS()), quota: vi.fn<() => Promise<ApiResult<QuotaSnapshot>>>() };
    api.quota.mockResolvedValueOnce({ ok: false, code: "network_error" }).mockResolvedValue(okQ());
    const store = createQuotaStore(api);
    await store.load();
    expect(store.getSnapshot()).toEqual({ status: "failed", code: "network_error" });
    await store.load();
    expect(api.quota).toHaveBeenCalledTimes(1);

    const again = store.retry();
    const again2 = store.retry();
    await Promise.all([again, again2]);
    expect(store.getSnapshot()).toEqual({ status: "ready", session, quota });
    expect(api.quota).toHaveBeenCalledTimes(2);
    expect(api.session).toHaveBeenCalledTimes(2);
  });

  it("retry() changes nothing once the store is loading or ready", async () => {
    const c = controlled();
    const store = createQuotaStore(c.api);
    const first = store.load();
    const during = store.retry();
    c.answer(okS(), okQ());
    await Promise.all([first, during]);
    await store.retry();
    expect(c.calls).toEqual({ session: 1, quota: 1 });
  });

  it("tells every subscriber about each change, and a stopped subscriber hears nothing", async () => {
    const c = controlled();
    const store = createQuotaStore(c.api);
    const a = vi.fn();
    const b = vi.fn();
    const stopA = store.subscribe(a);
    store.subscribe(b);
    const done = store.load();
    c.answer(okS(), okQ());
    await done;
    expect(a).toHaveBeenCalledTimes(2); // loading, ready
    expect(b).toHaveBeenCalledTimes(2);
    stopA();
    store.setQuota({ ...quota, world: 1 });
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(3);
  });

  it("gives the same snapshot object until something changes", async () => {
    const c = controlled();
    const store = createQuotaStore(c.api);
    const done = store.load();
    c.answer(okS(), okQ());
    await done;
    const before = store.getSnapshot();
    expect(store.getSnapshot()).toBe(before);
    store.setNoticeAcked();
    store.setNoticeAcked();
    const after = store.getSnapshot();
    expect(after).not.toBe(before);
    expect(after).toMatchObject({ session: { ackNotice: true } });
    store.setNoticeAcked(); // already acknowledged: no change, no notification
    expect(store.getSnapshot()).toBe(after);
  });

  it("takes a newer Quota Snapshot from a later call, but not before the boot data is in", async () => {
    const c = controlled();
    const store = createQuotaStore(c.api);
    store.setQuota({ ...quota, world: 0 });
    store.setNoticeAcked();
    expect(store.getSnapshot()).toEqual({ status: "idle" });
    const done = store.load();
    store.setQuota({ ...quota, world: 0 });
    expect(store.getSnapshot()).toEqual({ status: "loading" });
    c.answer(okS(), okQ());
    await done;
    store.setQuota({ ...quota, world: 1, image: 7 });
    expect(store.getSnapshot()).toEqual({ status: "ready", session, quota: { ...quota, world: 1, image: 7 } });
  });

  it("works with the demo FakeApi, and the Zero-Quota Path turns off drawing and uploading", async () => {
    const normal = createQuotaStore(createFakeApi({ latencyMs: 0 }));
    await normal.load();
    expect(capabilitiesOf(normal.getSnapshot())).toEqual({ canDraw: true, canUpload: true, canGallery: true });

    const zero = createQuotaStore(createFakeApi({ latencyMs: 0, quota: { world: 0, image: 0, llm: 0, tts: 0, stt: 0, live: 0 }, flags: { worldGenEnabled: false } }));
    await zero.load();
    expect(capabilitiesOf(zero.getSnapshot())).toEqual({ canDraw: false, canUpload: false, canGallery: true, reason: "kill_switch" });
  });

  it("has no capabilities until it is ready", () => {
    expect(capabilitiesOf({ status: "idle" })).toBeNull();
    expect(capabilitiesOf({ status: "loading" })).toBeNull();
    expect(capabilitiesOf({ status: "failed", code: "timeout" })).toBeNull();
  });
});
