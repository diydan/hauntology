import { withTicket, type GatePorts } from "@hauntology/shared/voice/gate";
import { withTransientClip } from "@hauntology/shared/voice/listen";
import { canCheck, heardWord, recordCheck, type ChecksState } from "@hauntology/shared/voice/stitch/check";
import type { StitchClip } from "@hauntology/shared/voice/stitch/compose";
import type { StitchConsent } from "@hauntology/shared/voice/stitch/consent";
import type { SpendGuard } from "@hauntology/shared/world/spend";
import {
  transcribeClip,
  transcribeWasCharged,
  type ClipTranscriber,
} from "../guarded/workersai/transcribe";
import { SILENT, type Logger } from "../log";
import type { RoomStitchClipStore } from "./stitch-store";

/**
 * Word Check service for Stitch (ghost-voice 5.9, Requirements 5.2 and 5.5).
 *
 * Called by `PartyRoom`: checks `canCheck`, reserves an `stt` Ticket via `withTicket`, sends the
 * transient clip to `transcribeClip`, verifies `heardWord(transcript, word)`, drops the transcript
 * immediately, saves accepted clips only into `RoomStitchClipStore` (or zeroes/drops rejected ones),
 * and emits `voice.stitch.check` counters only.
 */
export type WordCheckDeps = {
  transcriber: ClipTranscriber;
  spend: Pick<SpendGuard, "reserve" | "commit" | "release">;
  clips: RoomStitchClipStore;
  kill?: () => boolean;
  log?: Logger;
  now?: () => number;
};

export type WordCheckInput = {
  roomId: string;
  seat: number;
  word: string;
  audio: Uint8Array;
  contentType: string;
  durationMs: number;
  ipHash: string;
};

export type WordCheckState = {
  enabled: boolean;
  consents: readonly StitchConsent[];
  checks: ChecksState;
};

export type WordCheckResult =
  | { ok: true; accepted: boolean; checks: ChecksState }
  | { ok: false; code: "stitch_check_limit" | "voice_unavailable"; checks: ChecksState };

export async function runWordCheck(
  deps: WordCheckDeps,
  state: WordCheckState,
  input: WordCheckInput,
): Promise<WordCheckResult> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? SILENT;

  if (!canCheck(state, input.seat, input.word)) {
    input.audio.fill(0);
    log.info("voice.stitch.check", { outcome: "limit", accepted: false, rejected: false, checks: state.checks.room });
    return { ok: false, code: "stitch_check_limit", checks: state.checks };
  }

  let ticketGranted = false;
  const ports: GatePorts = {
    kill: () => deps.kill?.() === true,
    reserve: async (meter) => {
      const r = await deps.spend.reserve({ meter, sessionId: `room:${input.roomId}`, ipHash: input.ipHash, now: now() });
      if (r.ok) {
        ticketGranted = true;
        return r.ticket;
      }
      return null;
    },
    commit: (ticket) => deps.spend.commit(ticket),
    release: (ticket) => deps.spend.release(ticket),
  };

  // Copy clip bytes only if Whisper accepts the asked word; the transient buffer is always zeroed on exit.
  let acceptedClip: StitchClip | null = null;
  let answerOk = false;

  const gated = await withTransientClip(input.audio, (clip) =>
    withTicket(
      ports,
      "stt",
      async (ticket) => {
        const ans = await transcribeClip(deps.transcriber, ticket, {
          audio: clip,
          contentType: input.contentType,
          durationMs: input.durationMs,
        });
        if (ans.ok && heardWord(ans.transcript, input.word)) {
          answerOk = true;
          acceptedClip = {
            seat: input.seat,
            word: input.word,
            bytes: new Uint8Array(clip),
            durationMs: input.durationMs,
            recordedAt: now(),
            contentType: input.contentType,
          };
        }
        return ans;
      },
      transcribeWasCharged,
    ),
  );

  if (!gated.ok || !gated.value.ok) {
    // Denied tickets or uncharged failures must not consume a Word Check attempt when no ticket was granted.
    const nextChecks = ticketGranted
      ? recordCheck(state.checks, input.seat, input.word, false, true)
      : state.checks;
    log.info("voice.stitch.check", {
      outcome: gated.ok ? "failed" : gated.reason,
      accepted: false,
      rejected: ticketGranted,
      checks: nextChecks.room,
    });
    return { ok: false, code: "voice_unavailable", checks: nextChecks };
  }

  const nextChecks = recordCheck(state.checks, input.seat, input.word, answerOk, true);
  if (acceptedClip !== null) {
    await deps.clips.save(acceptedClip);
  }

  log.info("voice.stitch.check", {
    outcome: answerOk ? "accepted" : "rejected",
    accepted: answerOk,
    rejected: !answerOk,
    checks: nextChecks.room,
  });
  return { ok: true, accepted: answerOk, checks: nextChecks };
}
