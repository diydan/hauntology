import type { ApiResult } from "@hauntology/shared/app/api";
import { describe, expect, it, vi } from "vitest";
import { createApiClient, parseRetryAfter, type OnlineSource } from "./ApiClient";

type Call = { url: string; init: RequestInit };

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

/** A `fetch` that answers from a queue and records every call. A function in the queue may throw. */
function scripted(...answers: Array<Response | (() => Response | Promise<Response>)>) {
  const calls: Call[] = [];
  let i = 0;
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const a = answers[Math.min(i++, answers.length - 1)]!;
    return typeof a === "function" ? a() : a;
  }) as typeof fetch;
  return { fetch: fn, calls };
}

const alwaysOnline: OnlineSource = { isOnline: () => true, whenOnline: async () => true };
const flags = { worldGenEnabled: true, dayCapReached: false, totalCapReached: false, voiceEnabled: true, liveEnabled: false };
const session = { ackNotice: false, flags };
const quota = { world: 2, image: 8, llm: 40, tts: 40, stt: 20, live: 30 };
const failure = <T>(r: ApiResult<T>) => {
  if (r.ok) throw new Error("expected a failure");
  return r;
};

describe("routes and requests", () => {
  it("sends every call to its route with the right method, on this origin, with credentials", async () => {
    const s = scripted(json(session), new Response(null, { status: 204 }), json(quota));
    const api = createApiClient({ fetch: s.fetch, online: alwaysOnline });
    await api.session();
    await api.ackNotice();
    await api.quota();
    expect(s.calls.map((c) => `${c.init.method} ${c.url}`)).toEqual(["GET /api/session", "POST /api/session/ack-notice", "GET /api/quota"]);
    for (const c of s.calls) expect(c.init.credentials).toBe("same-origin");
  });

  it("encodes ids into paths and sends JSON bodies", async () => {
    const s = scripted(json({ ok: false, code: "world_not_found" }, 404));
    const api = createApiClient({ fetch: s.fetch, online: alwaysOnline });
    await api.world("a/b?c");
    await api.deleteWorld("w 1");
    await api.playTurn("p/1", { input: { text: "hi" }, pose: { pos: [0, 0, 0], yaw: 0 } });
    await api.searchPlaces("lis");
    expect(s.calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      "GET /api/worlds/a%2Fb%3Fc", "DELETE /api/worlds/w%201", "POST /api/play/p%2F1/turn", "POST /api/conditions/search",
    ]);
    expect(s.calls[2]!.init.body).toBe(JSON.stringify({ input: { text: "hi" }, pose: { pos: [0, 0, 0], yaw: 0 } }));
    expect(s.calls[3]!.init.body).toBe(JSON.stringify({ q: "lis" }));
    expect(s.calls[3]!.init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("uploads a photo as form data and a sketch as base64 PNG", async () => {
    const s = scripted(json({ imageId: "img-1", imageUrl: "/api/uploads/img-1.png" }), json({ candidates: [], quota }));
    const api = createApiClient({ fetch: s.fetch, online: alwaysOnline });
    const photo = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    const up = await api.uploadPhoto(photo);
    expect(up).toEqual({ ok: true, value: { imageId: "img-1", imageUrl: "/api/uploads/img-1.png" } });
    const form = s.calls[0]!.init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("photo")).toBeInstanceOf(Blob);
    expect(s.calls[0]!.init.headers).toBeUndefined();

    await api.sketchRender(new Blob([new Uint8Array([104, 105])], { type: "image/png" }), "a stair");
    expect(JSON.parse(s.calls[1]!.init.body as string)).toEqual({ sketchPng: "aGk=", caption: "a stair" });
  });

  it("sends a listened clip as the raw body with its own type", async () => {
    const s = scripted(json({ transcript: "hello" }));
    const api = createApiClient({ fetch: s.fetch, online: alwaysOnline });
    const clip = new Blob([new Uint8Array(4)], { type: "audio/webm" });
    expect(await api.listen(clip)).toEqual({ ok: true, value: { transcript: "hello" } });
    expect(s.calls[0]!.init.body).toBe(clip);
    expect(s.calls[0]!.init.headers).toEqual({ "Content-Type": "audio/webm" });
  });
});

describe("answers", () => {
  it("returns the typed value, treats 204 as null, and drops fields the shell does not know", async () => {
    const s = scripted(json({ ...session, seed: "hidden" }), new Response(null, { status: 204 }), json(null));
    const api = createApiClient({ fetch: s.fetch, online: alwaysOnline });
    const r = await api.session();
    expect(r).toEqual({ ok: true, value: session });
    expect(await api.ackNotice()).toEqual({ ok: true, value: null });
    expect(await api.deleteWorld("w")).toEqual({ ok: true, value: null });
  });

  it("returns a known code from a failure body, and never the server's message", async () => {
    const s = scripted(json({ ok: false, code: "quota_day", message: "upstream.example.com refused: key sk-123" }, 402));
    const r = failure(await createApiClient({ fetch: s.fetch, online: alwaysOnline }).quote("img-1"));
    expect(r).toEqual({ ok: false, code: "quota_day" });
    expect("message" in r).toBe(false);
  });

  it("turns an unknown code, a missing code and a body that is not JSON into shell_crash", async () => {
    const answers = [
      json({ ok: false, code: "kaboom" }, 500), json({ ok: false }, 500), json({ ok: false, code: 7 }, 500),
      json({ ok: false, code: "toString" }, 500), json(null, 500), json([1], 500),
      new Response("<html>oops</html>", { status: 502 }), new Response("", { status: 500 }),
    ];
    const api = createApiClient({ ...scripted(...answers), online: alwaysOnline });
    for (let i = 0; i < answers.length; i++) expect(await api.quota(), `answer ${i}`).toEqual({ ok: false, code: "shell_crash" });
  });

  it("does not trust a body that does not fit its schema", async () => {
    const bad = [
      { ...session, flags: { ...flags, voiceEnabled: "yes" } },
      { ackNotice: false },
      [],
      "text",
    ];
    for (const b of bad) {
      const api = createApiClient({ ...scripted(json(b)), online: alwaysOnline });
      expect(await api.session(), JSON.stringify(b)).toEqual({ ok: false, code: "shell_crash" });
    }
    const api = createApiClient({ ...scripted(new Response("{not json", { status: 200 })), online: alwaysOnline });
    expect(await api.quota()).toEqual({ ok: false, code: "shell_crash" });
  });

  it("refuses an image URL that is not a path on this origin", async () => {
    const urls = ["https://cdn.worldlabs.example/x.png", "//cdn.example.com/x.png", "data:image/png;base64,AAAA", "api/x.png"];
    for (const imageUrl of urls) {
      const api = createApiClient({ ...scripted(json({ imageId: "img-1", imageUrl })), online: alwaysOnline });
      expect(await api.uploadPhoto(new Blob([new Uint8Array(1)])), imageUrl).toEqual({ ok: false, code: "shell_crash" });
    }
    const gallery = [{ id: "g1", title: "Attic", description: "d", thumbUrl: "https://elsewhere.example/t.jpg", attribution: "a" }];
    const api = createApiClient({ ...scripted(json(gallery)), online: alwaysOnline });
    expect(await api.gallery()).toEqual({ ok: false, code: "shell_crash" });
  });
});

describe("rate limits", () => {
  it("reads Retry-After on a 429", async () => {
    const s = scripted(json({ ok: false, code: "rate_limited" }, 429, { "Retry-After": "7" }));
    expect(await createApiClient({ fetch: s.fetch, online: alwaysOnline }).quota()).toEqual({ ok: false, code: "rate_limited", retryAfterSec: 7 });
  });

  it("uses the default when the header is missing or unusable, and keeps a known code", async () => {
    for (const header of [undefined, "soon", "", "-5", "1.5", "99999999"]) {
      const h: Record<string, string> = header === undefined ? {} : { "Retry-After": header };
      const api = createApiClient({ ...scripted(json({ ok: false, code: "quota_session" }, 429, h)), online: alwaysOnline, defaultRetryAfterSec: 12 });
      expect(await api.quota(), String(header)).toEqual({ ok: false, code: "quota_session", retryAfterSec: 12 });
    }
  });

  it("reads an HTTP date, and a 429 with no known code is rate_limited", async () => {
    const date = new Date(100_000 + 30_000).toUTCString();
    const api = createApiClient({ ...scripted(new Response("busy", { status: 429, headers: { "Retry-After": date } })), online: alwaysOnline, now: () => 100_000 });
    const r = failure(await api.quota());
    expect(r.code).toBe("rate_limited");
    expect(r.retryAfterSec).toBeGreaterThanOrEqual(29);
    expect(r.retryAfterSec).toBeLessThanOrEqual(30);
  });

  it("only a 429 carries retryAfterSec", async () => {
    const s = scripted(json({ ok: false, code: "timeout" }, 504, { "Retry-After": "9" }));
    const r = failure(await createApiClient({ fetch: s.fetch, online: alwaysOnline }).quota());
    expect("retryAfterSec" in r).toBe(false);
  });

  it("parseRetryAfter reads seconds and dates and refuses the rest", () => {
    expect(parseRetryAfter(null, 0)).toBeNull();
    expect(parseRetryAfter("0", 0)).toBe(0);
    expect(parseRetryAfter(" 45 ", 0)).toBe(45);
    expect(parseRetryAfter("nonsense", 0)).toBeNull();
    expect(parseRetryAfter(new Date(5_000).toUTCString(), 10_000)).toBe(0);
  });
});

describe("offline and failures to connect", () => {
  it("a request that cannot connect is network_error, and nothing throws", async () => {
    const refuse = (): Response => { throw new TypeError("Failed to fetch"); };
    const api = createApiClient({ ...scripted(refuse), online: alwaysOnline });
    expect(await api.quota()).toEqual({ ok: false, code: "network_error" });
    expect(await api.createWorld({ imageId: "i", confirmToken: "t" })).toEqual({ ok: false, code: "network_error" });
    expect(await api.speak({ playId: "p", lineId: "l" })).toEqual({ ok: false, code: "network_error" });
  });

  it("a body that breaks while it is read is network_error", async () => {
    const broken = () => ({ ok: true, status: 200, headers: new Headers(), text: () => Promise.reject(new TypeError("aborted")) }) as unknown as Response;
    expect(await createApiClient({ ...scripted(broken), online: alwaysOnline }).quota()).toEqual({ ok: false, code: "network_error" });
  });

  it("a GET made while offline waits for the online event and tries again", async () => {
    const s = scripted(() => { throw new TypeError("offline"); }, json(quota));
    let onlineNow = false;
    const whenOnline = vi.fn(async () => { onlineNow = true; return true; });
    const api = createApiClient({ fetch: s.fetch, online: { isOnline: () => onlineNow, whenOnline } });
    expect(await api.quota()).toEqual({ ok: true, value: quota });
    expect(s.calls).toHaveLength(2);
    expect(whenOnline).toHaveBeenCalledTimes(1);
  });

  it("a GET gives up when the browser stays offline, and stops after the retry limit", async () => {
    const s = scripted(() => { throw new TypeError("offline"); });
    const never: OnlineSource = { isOnline: () => false, whenOnline: async () => false };
    expect(await createApiClient({ fetch: s.fetch, online: never }).quota()).toEqual({ ok: false, code: "network_error" });
    expect(s.calls).toHaveLength(1);

    const flaky = scripted(() => { throw new TypeError("offline"); });
    const back: OnlineSource = { isOnline: () => false, whenOnline: async () => true };
    expect(await createApiClient({ fetch: flaky.fetch, online: back, onlineRetries: 2 }).quota()).toEqual({ ok: false, code: "network_error" });
    expect(flaky.calls).toHaveLength(3);
  });

  it("a GET that fails while the browser says it is online is not retried", async () => {
    const s = scripted(() => { throw new TypeError("refused"); });
    expect(await createApiClient({ fetch: s.fetch, online: alwaysOnline }).quota()).toEqual({ ok: false, code: "network_error" });
    expect(s.calls).toHaveLength(1);
  });

  it("a POST is never retried, not even after coming back online", async () => {
    const s = scripted(() => { throw new TypeError("offline"); }, new Response(null, { status: 204 }));
    const whenOnline = vi.fn(async () => true);
    const api = createApiClient({ fetch: s.fetch, online: { isOnline: () => false, whenOnline } });
    expect(await api.createWorld({ imageId: "i", confirmToken: "t" })).toEqual({ ok: false, code: "network_error" });
    expect(await api.ackNotice()).toMatchObject({ ok: true });
    expect(s.calls.map((c) => c.init.method)).toEqual(["POST", "POST"]);
    expect(whenOnline).not.toHaveBeenCalled();
  });

  it("a request that never answers is aborted and is network_error", async () => {
    const hang = (async (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as typeof fetch;
    expect(await createApiClient({ fetch: hang, online: alwaysOnline, timeoutMs: 20 }).quota()).toEqual({ ok: false, code: "network_error" });
  });
});

describe("speak", () => {
  it("returns the audio for an audio answer", async () => {
    const audio = new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
    const s = scripted(audio);
    const r = await createApiClient({ fetch: s.fetch, online: alwaysOnline }).speak({ playId: "p-1", lineId: "l-1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.audio.size).toBe(3);
    expect(s.calls[0]!.url).toBe("/api/voice/speak");
    expect(s.calls[0]!.init.method).toBe("POST");
    expect(s.calls[0]!.init.body).toBe(JSON.stringify({ playId: "p-1", lineId: "l-1" }));
  });

  it("an answer that is not audio is shell_crash, and a refusal keeps its code", async () => {
    const api = createApiClient({ ...scripted(json({ hello: "world" }), json({ ok: false, code: "voice_unavailable" }, 503)), online: alwaysOnline });
    expect(await api.speak({ playId: "p", lineId: "l" })).toEqual({ ok: false, code: "shell_crash" });
    expect(await api.speak({ playId: "p", lineId: "l" })).toEqual({ ok: false, code: "voice_unavailable" });
  });
});
