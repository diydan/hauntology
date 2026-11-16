import type { SingleFlight } from "@hauntology/shared/voice/flight";
import { withTicket, type GatePorts } from "@hauntology/shared/voice/gate";
import { canonicalSpeechKey } from "@hauntology/shared/voice/key";
import { speechVoices, type VoiceLine } from "@hauntology/shared/voice/line";
import type { SpendGuard } from "@hauntology/shared/world/spend";
import { generateSpeech, speechWasCharged, type SpeechMaker } from "../guarded/workersai/speak";
import { SILENT, type Logger } from "../log";
import type { SpeechCache } from "./cache";
import type { SpeechLibrary } from "./library";
import type { VoiceLines } from "./lines";

/**
 * The service behind `POST /api/voice/speak` (ghost-voice 3.6 and 3.12): find the line, look in the Library and the cache, and only then pay.
 *
 *  1. The line is found by its id, its game and the Session that owns the game. Anything else is `no_line`, and nothing is spent.
 *  2. A line with no spoken part (`''`: the Subtitle only) is `silent`, and nothing is spent.
 *  3. The Library, then the cache, are read first. Both are free reads: they ask for no Ticket and run with every cap spent and the kill switch on,
 *     so a scripted line and a line already heard always play.
 *  4. A `prefetch` stops here: it gets Library or cached audio, or `not_ready`, and never makes a paid call.
 *  5. Only then is a Ticket asked for (`withTicket('tts')`), one call made (`generateSpeech`: Inworld, then Aura-2, one 5 second deadline) and the
 *     clip kept in the cache under the voice that spoke it. A call that gave nothing and cost nothing releases its Ticket.
 *  6. The paid step is a single flight keyed by the line's voice and text: a request that arrives while the call for the same line is running waits
 *     for it and gets its audio (`via: 'flight'`, never paid), so two requests for one line make one call.
 *
 * It never takes text from the caller: the words are the line's own. It logs one counter line and nothing else.
 */
export type SpeakDeps = {
  lines: VoiceLines;
  cache: SpeechCache;
  maker: SpeechMaker;
  spend: Pick<SpendGuard, "reserve" | "commit" | "release">;
  /** The Voice Library (every scripted line, rendered ahead of time). Without it only the cache is read. */
  library?: SpeechLibrary;
  /** Shared by every request the process serves, so that two requests for one line make one call. Without it each request makes its own. */
  flights?: SingleFlight;
  /** An extra kill switch for paid calls (the Library and the cache are still read). The default is off. */
  kill?: () => boolean;
  log?: Logger;
  now?: () => number;
};

/** Who is asking: the Session that owns the game, and a hash of the address (never the address) for the per-address cap. */
export type Who = { sessionId: string; ipHash: string };

export type SpeakRequest = { playId: string; lineId: string; prefetch?: boolean | undefined };
export type SpeakVia = "library" | "cache" | "flight" | "inworld" | "aura";
export type SpeakRefusal = "no_line" | "silent" | "not_ready" | "killed" | "denied" | "failed";
export type SpeakResult = { ok: true; audio: Uint8Array; via: SpeakVia; paid: boolean } | { ok: false; reason: SpeakRefusal; paid: boolean };

/**
 * `defer` is where the cache write goes when the caller can finish it after the answer is sent (the route passes `waitUntil`), so the audio does not wait
 * for R2. Without it the write is awaited before the answer.
 */
export async function speakLine(deps: SpeakDeps, who: Who, req: SpeakRequest, defer?: (work: Promise<unknown>) => void): Promise<SpeakResult> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? SILENT;
  const began = now();
  const prefetch = req.prefetch === true;
  const line = await deps.lines.find({ playId: req.playId, ownerSid: who.sessionId }, req.lineId).catch(() => null);
  const result: SpeakResult = line === null ? { ok: false, reason: "no_line", paid: false } : await speakFoundLine(deps, who, line, { prefetch, ...(defer !== undefined ? { defer } : {}) });
  log.info("voice.speak", { via: result.ok ? result.via : "none", outcome: result.ok ? "ok" : result.reason, paid: result.paid, prefetch, ms: Math.max(0, Math.round(now() - began)) });
  return result;
}

/**
 * Everything after the line is found. It is also how a game starts a line's synthesis the moment the line is validated (ghost-voice 3.12, speculative
 * synthesis): the call is registered as a flight, so a `speak` request that comes later joins it or finds the clip in the cache. If the visitor never asks,
 * one paid call was spent, and the caps still bound it. This function logs nothing: the caller does.
 */
export async function speakFoundLine(deps: SpeakDeps, who: Who, line: VoiceLine, opts: { prefetch?: boolean; defer?: (work: Promise<unknown>) => void } = {}): Promise<SpeakResult> {
  const now = deps.now ?? Date.now;
  if (line.spoken.trim() === "") return { ok: false, reason: "silent", paid: false };

  const voices = speechVoices(line);
  const library = await deps.library?.lookup(voices.inworld, line.spoken);
  if (library !== undefined && library !== null) return { ok: true, audio: library, via: "library", paid: false };
  const hit = await deps.cache.lookup([voices.inworld, voices.aura], line.spoken);
  if (hit !== null) return { ok: true, audio: hit.audio, via: "cache", paid: false };
  if (opts.prefetch === true) return { ok: false, reason: "not_ready", paid: false };

  const ports: GatePorts = {
    kill: () => deps.kill?.() === true,
    reserve: async (meter) => {
      const r = await deps.spend.reserve({ meter, sessionId: who.sessionId, ipHash: who.ipHash, now: now() });
      return r.ok ? r.ticket : null;
    },
    commit: (ticket) => deps.spend.commit(ticket),
    release: (ticket) => deps.spend.release(ticket),
  };
  const pay = async (): Promise<SpeakResult> => {
    const gated = await withTicket(
      ports,
      "tts",
      (ticket) => generateSpeech(deps.maker, ticket, { speaker: line.speaker, ...(voices.lodgerVoice !== undefined ? { lodgerVoice: voices.lodgerVoice } : {}), spoken: line.spoken }),
      speechWasCharged,
    );
    if (!gated.ok) return { ok: false, reason: gated.reason, paid: false };
    const answer = gated.value;
    const paid = speechWasCharged(answer);
    if (!answer.ok) return { ok: false, reason: "failed", paid };
    // best effort: a failed write only means the clip is not kept (`put` never throws)
    const kept = deps.cache.put(answer.voice, line.spoken, answer.audio);
    if (opts.defer !== undefined) opts.defer(kept);
    else await kept;
    return { ok: true, audio: answer.audio, via: answer.via, paid };
  };

  if (deps.flights === undefined) return pay();
  let led = false;
  const result = await deps.flights.run(canonicalSpeechKey(voices.inworld, line.spoken), () => { led = true; return pay(); });
  if (led) return result;
  // Joined a call that was already running: it is that call's answer, and this request paid nothing.
  return result.ok ? { ok: true, audio: result.audio, via: "flight", paid: false } : { ok: false, reason: result.reason, paid: false };
}
