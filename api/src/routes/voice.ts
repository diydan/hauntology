import { SpeakRequestSchema } from "@hauntology/shared/voice/requests";
import { Hono, type Context } from "hono";
import type { AppEnv } from "../http/env";
import { SILENT } from "../log";
import { speakLine, type SpeakDeps } from "../voice/speak";
import { ipHashOf, readBody } from "./world-create";

export type VoiceRouteDeps = {
  speak: SpeakDeps;
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
 * - The service reads the cache before it reserves anything, so a line already heard plays again with every cap spent.
 * - Logs: one `voice.speak` counter line. Never a word, an id, the audio or an address.
 * Room speaking (`roomCode`, the Host's token) comes with ghost-voice 3.9.
 */
export function voiceRoutes(deps: VoiceRouteDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const log = deps.speak.log ?? SILENT;

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
    if (!r.ok) return c.json(UNAVAILABLE, r.reason === "no_line" ? 404 : 503);
    return new Response(r.audio as unknown as BodyInit, { status: 200, headers: { "Content-Type": "audio/mpeg", "Content-Length": String(r.audio.byteLength), "Cache-Control": "no-store" } });
  });

  return routes;
}
