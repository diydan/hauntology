import { z } from "zod";
import { QuotaSnapshotSchema } from "../app/api-schemas";

/**
 * The voice flags on `GET /api/quota` (ghost-voice 3.2). A contract change that is OFF by default: the answer keeps exactly its six counts
 * (`world`, `image`, `llm`, `tts`, `stt`, `live`) unless `VOICE_QUOTA_FLAGS` is on, and only then gains `flags: { voice, stitch, live }`.
 * Nothing in the shell reads these today (it reads `voiceEnabled` and `liveEnabled` from `GET /api/session`), so turning it on changes
 * no behaviour; it exists so a client can learn the three switches in the same request as the three counts. Pure: it reads variables only.
 */
type Env = Readonly<Record<string, string | undefined>>;
const OFF = new Set(["false", "0", "off"]);
const ON = new Set(["true", "1", "on"]);
const norm = (v: string | undefined): string => (v ?? "").trim().toLowerCase();

export const QuotaFlagsSchema = z.object({ voice: z.boolean(), stitch: z.boolean(), live: z.boolean() }).strict();
export type QuotaFlags = z.infer<typeof QuotaFlagsSchema>;

/** The old answer with the flags as an optional extra: an answer without them still passes. */
export const QuotaWithFlagsSchema = QuotaSnapshotSchema.extend({ flags: QuotaFlagsSchema.optional() });
export type QuotaWithFlags = z.infer<typeof QuotaWithFlagsSchema>;

/** Whether the flags are added to the quota answer: only when `VOICE_QUOTA_FLAGS` is `true`, `1` or `on`. Unset, blank or anything else is off. */
export function quotaFlagsOn(env: Env | undefined): boolean {
  return ON.has(norm(env?.VOICE_QUOTA_FLAGS));
}

/**
 * `voice`: `VOICE_ENABLED` is not off, and the operator's voice window (when the caller knows it) is open. `stitch`: voice, and
 * `VOICE_STITCH_ENABLED` is not off. `live`: voice, and `VOICE_LIVE_ENABLED` is on (a stretch, off by default).
 */
export function quotaFlagsFrom(env: Env | undefined, parts: { windowOpen?: boolean } = {}): QuotaFlags {
  const voice = !OFF.has(norm(env?.VOICE_ENABLED ?? "true")) && parts.windowOpen !== false;
  return { voice, stitch: voice && !OFF.has(norm(env?.VOICE_STITCH_ENABLED ?? "true")), live: voice && ON.has(norm(env?.VOICE_LIVE_ENABLED)) };
}
