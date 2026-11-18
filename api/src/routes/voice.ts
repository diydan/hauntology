import { LISTEN_MAX_BYTES } from "@hauntology/shared/voice/limits";
import { SpeakRequestSchema } from "@hauntology/shared/voice/requests";
import { Hono, type Context } from "hono";
import type { AppEnv } from "../http/env";
import { SILENT } from "../log";
import { listenClip, memoryListenLimiter, type ListenDeps } from "../voice/listen";
import { speakLine, type SpeakDeps } from "../voice/speak";
import { readLimited } from "./uploads";
import { ipHashOf, readBody } from "./world-create";

export type VoiceRouteDeps = {
  speak: SpeakDeps;
  listen?: ListenDeps | undefined;
  /** Whether speech is on at all (`VOICE_ENABLED`). When it is off the route answers `voice_unavailable` and reads nothing, not even the cache. */
  enabled: (c: Context<AppEnv>) => boolean | Promise<boolean>;
};

/** The one body every refusal has. The client treats any answer that is not audio as "play nothing, show the Subtitle", so it never needs to know why. */
const UNAVAILABLE = { ok: false, code: "voice_unavailable" } as const;

/**
 * `POST /api/voice/speak` (ghost-voice 3.6, Requirements 1.1, 1.3, 1.5, 4.1, 4.2): `{ playId, lineId }` and nothing else.
 *
 * - The body is strict (`SpeakRequestSchema`): text of any kind, or any field that is not listed, is a `400`. The words spoken are the line's own,
 *   found on the server, so nothing a visitor writes ever reaches a speech model.
 * - The origin guard and the Session middleware have already run (every `/api` route): a game belongs to the Session that started it.
 * - A line that is not this Session's, has expired or never existed is the same `404`, so a line id tells nobody anything. A request with no Session
 *   of its own can own no line: it is that `404` at once and no Session cookie is made for it.
 * - Audio is `200 audio/mpeg`, never cached by anyone. Everything else a visitor can meet (speech off, a spent cap, a failed or slow model, a line with
 *   nothing to say) is `503` with the same body, which the client answers by showing the Subtitle alone.
 * - The service reads the Library and then the cache before it reserves anything, so a scripted line and a line already heard play with every cap spent.
 * - `prefetch: true` asks for Library or cached audio only and never pays: it is the same `200` when there is audio and `204 No Content` (nothing, and not
 *   an error) when there is not.
 * - Logs: one `voice.speak` counter line. Never a word, an id, the audio or an address.
 * Room speaking (`roomCode`, the Host's token) comes with ghost-voice 3.9.
 */
export function voiceRoutes(deps: VoiceRouteDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const log = deps.speak.log ?? SILENT;
  const listenLimiter = memoryListenLimiter();

  const refuse = (c: Context<AppEnv>, status: 400 | 404 | 503, outcome: string) => {
    log.info("voice.speak", { via: "none", outcome, paid: false, ms: 0 });
    return c.json(UNAVAILABLE, status);
  };

  routes.post("/speak", async (c) => {
    c.header("Cache-Control", "no-store");
    if (!(await deps.enabled(c))) return refuse(c, 503, "off");
    const body = await readBody(c, SpeakRequestSchema);
    if (body === null) return refuse(c, 400, "bad_body");
    if (c.get("sessionFresh")) {
      c.set("sessionNoCookie", true); // a visitor with no Session owns no game and no line: do not make one for them
      return refuse(c, 404, "no_line");
    }

    // The cache write can finish after the answer is sent; without an execution context (a test) it is awaited.
    let defer: ((work: Promise<unknown>) => void) | undefined;
    try {
      const ctx = c.executionCtx;
      defer = (work) => ctx.waitUntil(work);
    } catch {
      defer = undefined;
    }

    const who = { sessionId: c.get("session").sid, ipHash: await ipHashOf(c, c.env.HMAC_SECRET as string) };
    const r = await speakLine(deps.speak, who, body, defer);
    if (!r.ok) {
      if (r.reason === "not_ready") return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
      return c.json(UNAVAILABLE, r.reason === "no_line" ? 404 : 503);
    }
    return new Response(r.audio as unknown as BodyInit, { status: 200, headers: { "Content-Type": "audio/mpeg", "Content-Length": String(r.audio.byteLength), "Cache-Control": "no-store" } });
  });

  routes.post("/listen", async (c) => {
    c.header("Cache-Control", "no-store");
    const listenDeps = deps.listen;
    if (listenDeps === undefined || !(await deps.enabled(c))) {
      log.info("voice.listen", { outcome: "off", reason: "off", paid: false, ms: 0 });
      return c.json(UNAVAILABLE, 503);
    }
    if (c.get("sessionFresh")) {
      c.set("sessionNoCookie", true);
      log.info("voice.listen", { outcome: "no_session", reason: "no_session", paid: false, ms: 0 });
      return c.json({ ok: false, code: "session_expired" }, 401);
    }

    const maxBytes = listenDeps.maxBytes ?? LISTEN_MAX_BYTES;
    const raw = await readLimited(c.req.raw, maxBytes);
    if (raw === null) {
      log.info("voice.listen", { outcome: "too_long", reason: "clip_too_long", paid: false, ms: 0 });
      return c.json({ ok: false, code: "clip_too_long" }, 400);
    }

    const durationHeader = c.req.header("X-Clip-Duration-Ms");
    const durationMs = durationHeader === undefined ? 0 : Number(durationHeader);
    const contentType = c.req.header("Content-Type") ?? "";
    const who = { sessionId: c.get("session").sid, ipHash: await ipHashOf(c, c.env.HMAC_SECRET as string) };

    const r = await listenClip(listenDeps, who, { audio: raw, contentType, durationMs }, listenLimiter);
    if (!r.ok) {
      if (r.reason === "rate_limited") {
        c.header("Retry-After", String(Math.max(1, Math.ceil((r.retryAfterMs ?? 1500) / 1000))));
        return c.json({ ok: false, code: "rate_limited" }, 429);
      }
      if (r.reason === "too_long") return c.json({ ok: false, code: "clip_too_long" }, 400);
      if (r.reason === "not_heard") return c.json({ ok: false, code: "clip_not_heard" }, 422);
      return c.json(UNAVAILABLE, 503);
    }
    return c.json({ ok: true, transcript: r.transcript });
  });

  return routes;
}
