import type { ErrorCode } from "../errors";
import { LISTEN_MAX_BYTES, LISTEN_MAX_MS } from "./limits";
import type { SpeakMode } from "./policy";

/**
 * Pure listening checks and transient clip lifecycle (ghost-voice 2.10, Requirements 3.1 to 3.3).
 *
 * A recording is available only in Single player (never Multiplayer rooms, where Stitch has its
 * own room consent & 2-second word check path). The holder zeroes the byte buffer and drops its
 * reference once in a `finally` block on success, throw, or timeout.
 */

export function listeningAllowed(mode: SpeakMode): boolean {
  return mode === "single";
}

export type ClipVerdict = { ok: true } | { ok: false; code: typeof ErrorCode.clip_too_long };

export function clipVerdict(input: { durationMs: number; bytes: number; maxBytes?: number }): ClipVerdict {
  const maxBytes = input.maxBytes ?? LISTEN_MAX_BYTES;
  if (!Number.isFinite(input.durationMs) || input.durationMs < 0 || input.durationMs > LISTEN_MAX_MS) {
    return { ok: false, code: "clip_too_long" };
  }
  if (!Number.isFinite(input.bytes) || input.bytes <= 0 || input.bytes > maxBytes) {
    return { ok: false, code: "clip_too_long" };
  }
  return { ok: true };
}

export type TransientClipHolder = {
  ref: Uint8Array | null;
  clearCount: number;
};

/** Runs `use` over a transient audio buffer, then zeroes the buffer and drops the holder reference once. */
export async function withTransientClip<T>(
  bytes: Uint8Array,
  use: (clip: Uint8Array) => Promise<T>,
  holder: TransientClipHolder = { ref: null, clearCount: 0 },
): Promise<T> {
  holder.ref = bytes;
  let cleared = false;
  const clearOnce = () => {
    if (cleared) return;
    cleared = true;
    holder.ref?.fill(0);
    holder.ref = null;
    holder.clearCount += 1;
  };
  try {
    return await use(bytes);
  } finally {
    clearOnce();
  }
}
