import { acceptTurn, retryAfterMs as calcRetryAfterMs } from "@hauntology/shared/ghost/rate";
import { withTicket, type GatePorts } from "@hauntology/shared/voice/gate";
import { LISTEN_MAX_BYTES } from "@hauntology/shared/voice/limits";
import { clipVerdict, withTransientClip } from "@hauntology/shared/voice/listen";
import type { SpendGuard } from "@hauntology/shared/world/spend";
import {
  normalizeAudioType,
  transcribeClip,
  transcribeWasCharged,
  type ClipTranscriber,
} from "../guarded/workersai/transcribe";
import { SILENT, type Logger } from "../log";
import type { Who } from "./speak";

/**
 * The service behind `POST /api/voice/listen` (ghost-voice 3.7, Requirements 3.1, 3.2, 3.3, 4.1, 4.2):
 * validates content-type allow-list, size/duration ceiling, 1.5s per-session rate limit, reserves an
 * `stt` SpendTicket, runs Whisper inside `withTransientClip` (zeroing & dropping the audio buffer in
 * `finally`), and returns `{ transcript }`. Logs `voice.listen` counters only; never writes audio
 * or transcripts to storage or logs.
 */

export type ListenDeps = {
  transcriber: ClipTranscriber;
  spend: Pick<SpendGuard, "reserve" | "commit" | "release">;
  maxBytes?: number;
  /** Default: per-isolate `Map` enforcing 1 clip per 1.5s per Session (`acceptTurn`). */
  rateLimit?: { accept(sessionId: string, now: number): { ok: true } | { ok: false; retryAfterMs: number } | Promise<{ ok: true } | { ok: false; retryAfterMs: number }> };
  kill?: () => boolean;
  log?: Logger;
  now?: () => number;
};

export type ListenRequest = {
  audio: Uint8Array;
  contentType: string;
  durationMs: number;
};

export type ListenRefusal = "bad_type" | "too_long" | "rate_limited" | "killed" | "denied" | "not_heard" | "failed";

export type ListenResult =
  | { ok: true; transcript: string; paid: boolean }
  | { ok: false; reason: ListenRefusal; paid: boolean; retryAfterMs?: number };

export function memoryListenLimiter(): NonNullable<ListenDeps["rateLimit"]> {
  const lastBySid = new Map<string, number>();
  return {
    accept(sessionId, now) {
      const prev = lastBySid.get(sessionId) ?? null;
      if (!acceptTurn(prev, now)) {
        return { ok: false, retryAfterMs: calcRetryAfterMs(prev, now) };
      }
      lastBySid.set(sessionId, now);
      return { ok: true };
    },
  };
}

export async function listenClip(deps: ListenDeps, who: Who, req: ListenRequest, limiter?: NonNullable<ListenDeps["rateLimit"]>): Promise<ListenResult> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? SILENT;
  const began = now();
  const maxBytes = deps.maxBytes ?? LISTEN_MAX_BYTES;
  const checkRate = deps.rateLimit ?? limiter;

  const done = (r: ListenResult, logReason: string): ListenResult => {
    log.info("voice.listen", {
      outcome: r.ok ? "ok" : r.reason,
      reason: logReason,
      paid: r.paid,
      ms: Math.max(0, Math.round(now() - began)),
    });
    return r;
  };

  if (normalizeAudioType(req.contentType) === null) {
    // Drop the buffer immediately even on bad content-type so nothing retains bytes in memory.
    req.audio.fill(0);
    return done({ ok: false, reason: "bad_type", paid: false }, "bad_type");
  }

  const verdict = clipVerdict({ durationMs: req.durationMs, bytes: req.audio.byteLength, maxBytes });
  if (!verdict.ok) {
    req.audio.fill(0);
    return done({ ok: false, reason: "too_long", paid: false }, "clip_too_long");
  }

  if (checkRate !== undefined) {
    const rate = await checkRate.accept(who.sessionId, began);
    if (!rate.ok) {
      req.audio.fill(0);
      return done({ ok: false, reason: "rate_limited", paid: false, retryAfterMs: rate.retryAfterMs }, "rate_limited");
    }
  }

  let paid = false;
  let answerKind: string = "denied";

  const ports: GatePorts = {
    kill: () => deps.kill?.() === true,
    reserve: async (meter) => {
      const r = await deps.spend.reserve({ meter, sessionId: who.sessionId, ipHash: who.ipHash, now: now() });
      return r.ok ? r.ticket : null;
    },
    commit: (ticket) => deps.spend.commit(ticket),
    release: (ticket) => deps.spend.release(ticket),
  };

  const gated = await withTransientClip(req.audio, (clip) =>
    withTicket(
      ports,
      "stt",
      (ticket) => transcribeClip(deps.transcriber, ticket, { audio: clip, contentType: req.contentType, durationMs: req.durationMs }),
      (a) => {
        paid = transcribeWasCharged(a);
        answerKind = a.ok ? "ok" : a.kind;
        return paid;
      },
    ),
  );

  if (!gated.ok) {
    return done({ ok: false, reason: gated.reason, paid: false }, gated.reason);
  }
  const answer = gated.value;
  if (!answer.ok) {
    const reason: ListenRefusal = answer.kind === "unusable" ? "not_heard" : answer.kind === "invalid" ? "too_long" : "failed";
    return done({ ok: false, reason, paid }, answerKind);
  }
  return done({ ok: true, transcript: answer.transcript, paid }, "whisper");
}
