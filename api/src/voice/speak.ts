import { withTicket, type GatePorts } from "@hauntology/shared/voice/gate";
import { speechVoices } from "@hauntology/shared/voice/line";
import type { SpendGuard } from "@hauntology/shared/world/spend";
import { generateSpeech, speechWasCharged, type SpeechMaker } from "../guarded/workersai/speak";
import { SILENT, type Logger } from "../log";
import type { SpeechCache } from "./cache";
import type { VoiceLines } from "./lines";

/**
 * The service behind `POST /api/voice/speak` (ghost-voice 3.6): find the line, look in the cache, and only then pay.
 *
 *  1. The line is found by its id, its game and the Session that owns the game. Anything else is `no_line`, and nothing is spent.
 *  2. A line with no spoken part (`''`: the Subtitle only) is `silent`, and nothing is spent.
 *  3. The cache is read first. It is a free read: it runs with every cap spent, so a visitor who has used their lines can still hear one again.
 *  4. Only then is a Ticket asked for (`withTicket('tts')`), one call made (`generateSpeech`: Inworld, then Aura-2, one 5 second deadline) and the
 *     clip kept in the cache under the voice that spoke it. A call that gave nothing and cost nothing releases its Ticket.
 *
 * It never takes text from the caller: the words are the line's own. It logs one counter line and nothing else.
 */
export type SpeakDeps = {
  lines: VoiceLines;
  cache: SpeechCache;
  maker: SpeechMaker;
  spend: Pick<SpendGuard, "reserve" | "commit" | "release">;
  /** An extra kill switch for paid calls (the cache is still read). The default is off. */
  kill?: () => boolean;
  log?: Logger;
  now?: () => number;
};

/** Who is asking: the Session that owns the game, and a hash of the address (never the address) for the per-address cap. */
export type Who = { sessionId: string; ipHash: string };

export type SpeakVia = "cache" | "inworld" | "aura";
export type SpeakRefusal = "no_line" | "silent" | "killed" | "denied" | "failed";
export type SpeakResult = { ok: true; audio: Uint8Array; via: SpeakVia; paid: boolean } | { ok: false; reason: SpeakRefusal; paid: boolean };

/**
 * `defer` is where the cache write goes when the caller can finish it after the answer is sent (the route passes `waitUntil`), so the audio does not wait
 * for R2. Without it the write is awaited before the answer.
 */
export async function speakLine(deps: SpeakDeps, who: Who, req: { playId: string; lineId: string }, defer?: (work: Promise<unknown>) => void): Promise<SpeakResult> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? SILENT;
  const began = now();
  const done = (result: SpeakResult): SpeakResult => {
    log.info("voice.speak", { via: result.ok ? result.via : "none", outcome: result.ok ? "ok" : result.reason, paid: result.paid, ms: Math.max(0, Math.round(now() - began)) });
    return result;
  };

  const line = await deps.lines.find({ playId: req.playId, ownerSid: who.sessionId }, req.lineId).catch(() => null);
  if (line === null) return done({ ok: false, reason: "no_line", paid: false });
  if (line.spoken.trim() === "") return done({ ok: false, reason: "silent", paid: false });

  const voices = speechVoices(line);
  const hit = await deps.cache.lookup([voices.inworld, voices.aura], line.spoken);
  if (hit !== null) return done({ ok: true, audio: hit.audio, via: "cache", paid: false });

  const ports: GatePorts = {
    kill: () => deps.kill?.() === true,
    reserve: async (meter) => {
      const r = await deps.spend.reserve({ meter, sessionId: who.sessionId, ipHash: who.ipHash, now: now() });
      return r.ok ? r.ticket : null;
    },
    commit: (ticket) => deps.spend.commit(ticket),
    release: (ticket) => deps.spend.release(ticket),
  };
  const gated = await withTicket(
    ports,
    "tts",
    (ticket) => generateSpeech(deps.maker, ticket, { speaker: line.speaker, ...(voices.lodgerVoice !== undefined ? { lodgerVoice: voices.lodgerVoice } : {}), spoken: line.spoken }),
    speechWasCharged,
  );
  if (!gated.ok) return done({ ok: false, reason: gated.reason, paid: false });
  const answer = gated.value;
  const paid = speechWasCharged(answer);
  if (!answer.ok) return done({ ok: false, reason: "failed", paid });

  // best effort: a failed write only means the clip is not kept (`put` never throws)
  const kept = deps.cache.put(answer.voice, line.spoken, answer.audio);
  if (defer !== undefined) defer(kept);
  else await kept;
  return done({ ok: true, audio: answer.audio, via: answer.via, paid });
}
