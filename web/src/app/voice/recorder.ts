import { CLIP_MAX_MS } from "@hauntology/shared/voice/limits";
import type { Recorder } from "../play/voice";

/**
 * Single-word Stitch recorder helper (ghost-voice 5.11, Requirement 5.1).
 *
 * Records one word of at most 2 seconds (`CLIP_MAX_MS`), rejects longer or empty clips with
 * `clip_too_long`, and always releases/cancels the underlying microphone recorder.
 */
export type RecordWordResult =
  | { ok: true; blob: Blob; durationMs: number }
  | { ok: false; code: "clip_too_long" | "mic_unavailable" };

export async function recordStitchWord(deps: {
  openRecorder: () => Promise<Recorder>;
  waitForRelease: () => Promise<void>;
  now?: () => number;
  maxMs?: number;
}): Promise<RecordWordResult> {
  const now = deps.now ?? Date.now;
  const maxMs = deps.maxMs ?? CLIP_MAX_MS;

  let rec: Recorder;
  try {
    rec = await deps.openRecorder();
  } catch {
    return { ok: false, code: "mic_unavailable" };
  }

  const startedAt = now();
  try {
    rec.start();
    await deps.waitForRelease();
    const durationMs = now() - startedAt;
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > maxMs) {
      rec.cancel();
      return { ok: false, code: "clip_too_long" };
    }
    const blob = await rec.stop();
    if (blob.size <= 0) {
      return { ok: false, code: "clip_too_long" };
    }
    return { ok: true, blob, durationMs };
  } catch {
    rec.cancel();
    return { ok: false, code: "mic_unavailable" };
  }
}
