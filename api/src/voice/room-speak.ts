import { singleFlight } from "@hauntology/shared/voice/flight";
import type { VoiceLine } from "@hauntology/shared/voice/line";
import type { SpendGuard } from "@hauntology/shared/world/spend";
import { WorkersAiSpeaker, voiceModelsFromEnv } from "../guarded/workersai/speak";
import type { AiBinding } from "../guarded/workersai/call";
import { R2SpeechCache } from "./cache";
import { R2SpeechLibrary } from "./library";
import { speculate } from "./speculate";
import type { SpeakDeps, Who } from "./speak";

/**
 * Speculative synthesis from a Durable Object (ghost-voice 3.12): the DO that validated a line starts the speak call at once, with the
 * same cache, Library, spend guard and flights as the Worker's `speak` route, so the Host's later `speak` joins the running call. A line is
 * handed over only when the game's own policy said "speak" (the Room's `decideSpeak`); nothing here reads a secret, and nothing here throws.
 */
export type SpeculativeEnv = { AI?: AiBinding; BUCKET?: ConstructorParameters<typeof R2SpeechCache>[0] & ConstructorParameters<typeof R2SpeechLibrary>[0]; VOICE_TTS_MODEL_ID?: string; VOICE_TTS_FALLBACK_MODEL_ID?: string };

const flights = singleFlight();

/** The speak dependencies a Durable Object can build from its own env, or `null` when the voice cannot be served from it (no `AI`, no bucket, an unknown model name). */
export function speakDepsForDo(env: SpeculativeEnv, spend: Pick<SpendGuard, "reserve" | "commit" | "release">): SpeakDeps | null {
  const models = voiceModelsFromEnv(env);
  if (env.AI === undefined || env.BUCKET === undefined || models === null) return null;
  return { lines: { find: async () => null }, cache: new R2SpeechCache(env.BUCKET), library: new R2SpeechLibrary(env.BUCKET), maker: new WorkersAiSpeaker(env.AI, models), spend, flights };
}

/** Starts synthesis for one validated line when speaking is on; returns what it did. Never throws; the work is handed to `defer` when there is one. */
export function speculateLine(deps: SpeakDeps | null, who: Who, line: VoiceLine, o: { speaking: boolean; defer?: (work: Promise<unknown>) => void }): "started" | "off" | "silent" | "unavailable" {
  if (deps === null) return "unavailable";
  try {
    return speculate(deps, who, line, { speaking: o.speaking, ...(o.defer !== undefined ? { defer: o.defer } : {}) }).result;
  } catch {
    return "off";
  }
}
