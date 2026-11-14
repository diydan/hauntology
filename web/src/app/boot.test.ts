import type { ApiResult, ShellApi } from "@hauntology/shared/app/api";
import { guardRoute } from "@hauntology/shared/app/routes";
import type { ResumeFacts, Route, SessionRecord } from "@hauntology/shared/app/types";
import { describe, expect, it, vi } from "vitest";
import { freshFlow, loadResumeFacts, runBoot, startPlan } from "./boot";
import { createFakeApi } from "./FakeApi";
import { createQuotaStore } from "./QuotaStore";
import { createRouter } from "./router";
import { fakeHistory } from "../test/fakeHistory";

const flags = { worldGenEnabled: true, dayCapReached: false, totalCapReached: false, voiceEnabled: true, liveEnabled: false };
const W = "w-last";
const own = (extra: Partial<SessionRecord> = {}): SessionRecord => ({ ackNotice: false, flags, lastWorldId: W, lastPlayId: "p-last", ...extra });
const none: SessionRecord = { ackNotice: false, flags };
const ready: ResumeFacts = { worldStatus: "ready", playLive: false };
const live: ResumeFacts = { worldStatus: "ready", playLive: true };
const making: ResumeFacts = { worldStatus: "generating", playLive: false };
const missing: ResumeFacts = { worldStatus: "missing", playLive: false };

const view = (ended: boolean) => ({ found: [], anchors: [], hauntLevel: 0, ghostVisible: false, ended, journal: [], atmosphere: null });
const okWorld = (status: "ready" | "queued" | "failed"): ApiResult<{ id: string; status: typeof status }> => ({ ok: true, value: { id: W, status } });

describe("loadResumeFacts", () => {
  it("asks nothing when the Session has no last world", async () => {
    const api = { world: vi.fn(), playGet: vi.fn() };
    expect(await loadResumeFacts(api, none)).toBeNull();
    expect(api.world).not.toHaveBeenCalled();
  });

  it("reports the world's status and whether the play session is alive", async () => {
    const api = { world: vi.fn(async () => okWorld("ready")), playGet: vi.fn(async () => ({ ok: true, value: { worldId: W, view: view(false) } }) as never) };
    expect(await loadResumeFacts(api, own())).toEqual({ worldStatus: "ready", playLive: true });
    api.playGet.mockResolvedValue({ ok: true, value: { worldId: W, view: view(true) } } as never);
    expect(await loadResumeFacts(api, own())).toEqual({ worldStatus: "ready", playLive: false });
    api.playGet.mockResolvedValue({ ok: false, code: "session_not_found" } as never);
    expect(await loadResumeFacts(api, own())).toEqual({ worldStatus: "ready", playLive: false });
  });

  it("does not ask about a play session when there is none, or when the world is gone", async () => {
    const api = { world: vi.fn(async () => okWorld("queued")), playGet: vi.fn() };
    expect(await loadResumeFacts(api, own({ lastPlayId: undefined }))).toEqual({ worldStatus: "queued", playLive: false });
    api.world.mockResolvedValue({ ok: false, code: "world_not_found" } as never);
    expect(await loadResumeFacts(api, own())).toEqual({ worldStatus: "missing", playLive: false });
    expect(api.playGet).not.toHaveBeenCalled();
  });

  it("gives no answer when the question itself failed", async () => {
    for (const code of ["network_error", "shell_crash", "rate_limited"] as const) {
      const api = { world: vi.fn(async () => ({ ok: false, code }) as never), playGet: vi.fn() };
      expect(await loadResumeFacts(api, own()), code).toBeNull();
    }
  });
});

describe("startPlan", () => {
  it("opens Home as Home when there is nothing to resume", () => {
    expect(startPlan({ screen: "home" }, none, null)).toEqual({ route: { screen: "home" }, flow: freshFlow(none) });
    expect(startPlan({ screen: "home" }, own(), null).route).toEqual({ screen: "home" });
    expect(startPlan({ screen: "home" }, own(), missing).route).toEqual({ screen: "home" });
  });

  it("sends `/` to the last world: Play when it is ready or being played, Haunt while it is made", () => {
    expect(startPlan({ screen: "home" }, own(), live).route).toEqual({ screen: "play", worldId: W });
    expect(startPlan({ screen: "home" }, own(), ready).route).toEqual({ screen: "play", worldId: W });
    expect(startPlan({ screen: "home" }, own(), making).route).toEqual({ screen: "haunt", worldId: W });
    const plan = startPlan({ screen: "home" }, own({ ackNotice: true }), ready);
    expect(plan.flow).toEqual({ worldId: W, ghostReady: true, noticeAcked: true, playEnded: false });
  });

  it("never overrides a deep link that passes its guard", () => {
    const deep: Route[] = [
      { screen: "gallery" }, { screen: "create" }, { screen: "expired" }, { screen: "not_found" },
    ];
    for (const route of deep) {
      for (const facts of [null, ready, live, making, missing]) {
        expect(startPlan(route, own(), facts).route, `${route.screen}`).toEqual(route);
      }
    }
  });

  it("keeps a world route for the last world when the resumed state allows it", () => {
    expect(startPlan({ screen: "play", worldId: W }, own(), live).route).toEqual({ screen: "play", worldId: W });
    expect(startPlan({ screen: "play", worldId: W }, own(), ready).route).toEqual({ screen: "play", worldId: W });
    expect(startPlan({ screen: "haunt", worldId: W }, own(), ready).route).toEqual({ screen: "haunt", worldId: W });
    expect(startPlan({ screen: "haunt", worldId: W }, own(), making).route).toEqual({ screen: "haunt", worldId: W });
  });

  it("moves a stale world route to where the guard says", () => {
    expect(startPlan({ screen: "play", worldId: W }, own(), making).route).toEqual({ screen: "haunt", worldId: W });
    expect(startPlan({ screen: "end", worldId: W }, own(), ready).route).toEqual({ screen: "play", worldId: W });
    expect(startPlan({ screen: "confirm" }, own(), ready).route).toEqual({ screen: "create" });
  });

  it("sends a world that the API no longer knows to Expired", () => {
    for (const screen of ["haunt", "play", "end"] as const) {
      expect(startPlan({ screen, worldId: W }, own(), missing).route, screen).toEqual({ screen: "expired" });
    }
  });

  it("sends a world route to the Gallery when it is not this Session's world, or nothing is known", () => {
    for (const screen of ["haunt", "play", "end"] as const) {
      expect(startPlan({ screen, worldId: "w-other" }, own(), ready).route, `other ${screen}`).toEqual({ screen: "gallery" });
      expect(startPlan({ screen, worldId: W }, own(), null).route, `offline ${screen}`).toEqual({ screen: "gallery" });
      expect(startPlan({ screen, worldId: W }, none, null).route, `no session ${screen}`).toEqual({ screen: "gallery" });
    }
  });

  it("a different world is not the missing one: it goes to the Gallery, not Expired", () => {
    for (const screen of ["haunt", "play", "end"] as const) {
      expect(startPlan({ screen, worldId: "w-other" }, own(), missing).route, screen).toEqual({ screen: "gallery" });
    }
  });

  it("whatever it plans, the planned route passes its own guard", () => {
    const routes: Route[] = [
      { screen: "home" }, { screen: "gallery" }, { screen: "create" }, { screen: "confirm" }, { screen: "expired" }, { screen: "not_found" },
      ...(["haunt", "play", "end"] as const).flatMap((screen) => [{ screen, worldId: W }, { screen, worldId: "w-other" }]),
    ];
    for (const route of routes) {
      for (const session of [none, own()]) {
        for (const facts of [null, ready, live, making, missing, { worldStatus: "failed" as const, playLive: false }]) {
          const plan = startPlan(route, session, facts);
          expect(guardRoute(plan.route, plan.flow).allow || plan.route.screen === "expired", `${route.screen}/${route.worldId} -> ${plan.route.screen}`).toBe(true);
        }
      }
    }
  });
});

describe("runBoot", () => {
  const setup = (path = "/gallery") => {
    const api = createFakeApi({ latencyMs: 0 });
    const router = createRouter(fakeHistory(path));
    const quota = createQuotaStore(api);
    const start = vi.spyOn(router, "start");
    return { api, router, quota, start };
  };

  it("loads the boot data and starts the router with the plan for the address", async () => {
    const d = setup("/confirm");
    await runBoot(d);
    expect(d.start).toHaveBeenCalledTimes(1);
    expect(d.router.getSnapshot()).toMatchObject({ ready: true, route: { screen: "create" } });
  });

  it("starts the router once when two callers run it at the same time", async () => {
    const d = setup();
    await Promise.all([runBoot(d), runBoot(d), runBoot(d)]);
    expect(d.start).toHaveBeenCalledTimes(1);
  });

  it("asks nothing more once the router has been started", async () => {
    const d = setup("/");
    const photo = new Blob([new Uint8Array(10)], { type: "image/jpeg" });
    const up = await d.api.uploadPhoto(photo);
    if (!up.ok) throw new Error("upload");
    const q = await d.api.quote(up.value.imageId);
    if (!q.ok) throw new Error("quote");
    await d.api.createWorld({ imageId: up.value.imageId, confirmToken: q.value.confirmToken });
    const world = vi.spyOn(d.api, "world");
    await runBoot(d);
    expect(world).toHaveBeenCalledTimes(1);
    await runBoot(d);
    expect(world).toHaveBeenCalledTimes(1);
    expect(d.start).toHaveBeenCalledTimes(1);
  });

  it("starts nothing for a caller that is gone, at either wait", async () => {
    const early = setup();
    await runBoot(early, () => false);
    expect(early.start).not.toHaveBeenCalled();

    const late = setup();
    let calls = 0;
    await runBoot(late, () => ++calls === 1);
    expect(late.start).not.toHaveBeenCalled();
  });

  it("starts nothing when the boot data could not be loaded", async () => {
    const d = setup();
    const broken = { ...d.api, session: async () => ({ ok: false, code: "network_error" }) } as ShellApi;
    const quota = createQuotaStore(broken);
    await runBoot({ ...d, quota });
    expect(d.start).not.toHaveBeenCalled();
    expect(quota.getSnapshot().status).toBe("failed");
  });
});
