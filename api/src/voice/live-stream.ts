import { validateGhostReply } from "@hauntology/shared/ghost/narration";
import { checkLiveSentence } from "@hauntology/shared/voice/live";
import { splitSentences } from "@hauntology/shared/voice/speakable";
import type { LodgerVoice, Speaker } from "@hauntology/shared/voice/voices";

/**
 * Sentence-checked Live Mode narrator streaming (ghost-voice 6.4, Requirement 6.3).
 *
 * Buffers streamed text into completed sentences, validates every sentence through `toVoiceLine` /
 * `validateGhostReply` (<= 240 chars, free of player text) before speaking it, replaces any
 * failing sentence's remainder with one validated scripted line, enforces whole-reply validity
 * for the Subtitle, handles slow/stalled streams via deadline, and stores zero audio.
 */
export type StreamReplyInput = {
  idPrefix: string;
  stream: AsyncIterable<string>;
  speaker: Speaker;
  lodgerVoice?: LodgerVoice;
  playerText: readonly string[];
  fallbackScripted: string;
  now?: () => number;
  /** Maximum wait (ms) for any single streamed chunk before cutting off a slow stream cleanly. */
  chunkTimeoutMs?: number;
  /** Called once per validated spoken sentence (in order) before full stream completion. */
  onSentence: (event: { spoken: string; subtitle: string; seq: number; replaced: boolean }) => void | Promise<void>;
};

export type StreamReplyResult = {
  subtitle: string;
  spokenSentences: string[];
  replaced: boolean;
  timedOut: boolean;
};

const ENDS_SENTENCE = /[.!?]["')\]]*$/u;

function takeCompletedSentences(buffer: string): { completed: string[]; remainder: string } {
  const parts = splitSentences(buffer);
  if (parts.length === 0) return { completed: [], remainder: "" };
  const trailingEndsCleanly = ENDS_SENTENCE.test(buffer.trimEnd()) && /\s$/u.test(buffer);
  if (trailingEndsCleanly || parts.length === 1 && ENDS_SENTENCE.test(buffer.trim())) {
    if (trailingEndsCleanly) return { completed: parts, remainder: "" };
  }
  const last = parts[parts.length - 1]!;
  if (PARTS_TRAILING_READY(buffer, last)) {
    return { completed: parts, remainder: "" };
  }
  return {
    completed: parts.slice(0, -1),
    remainder: last,
  };
}

function PARTS_TRAILING_READY(buffer: string, last: string): boolean {
  const trimmed = buffer.trimEnd();
  if (!trimmed.endsWith(last)) return false;
  return ENDS_SENTENCE.test(last) && !/\.{3}$/u.test(last) && /\s$/u.test(buffer);
}

async function nextChunkWithTimeout(
  iter: AsyncIterator<string>,
  timeoutMs: number,
): Promise<{ kind: "done" } | { kind: "chunk"; value: string } | { kind: "timeout" }> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<{ kind: "timeout" }>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
  });
  try {
    const step = await Promise.race([
      iter.next().then((r) => (r.done ? ({ kind: "done" } as const) : ({ kind: "chunk", value: r.value } as const))),
      timeout,
    ]);
    return step;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

export async function streamSentenceCheckedReply(input: StreamReplyInput): Promise<StreamReplyResult> {
  const now = input.now ?? Date.now;
  const timeoutMs = input.chunkTimeoutMs ?? 3000;
  const iter = input.stream[Symbol.asyncIterator]();

  const acceptedSubtitle: string[] = [];
  const spokenSentences: string[] = [];
  let buffer = "";
  let seq = 0;
  let replaced = false;
  let timedOut = false;

  const emitValidatedSentence = async (rawSentence: string): Promise<"continue" | "stop"> => {
    const trimmed = rawSentence.trim();
    if (trimmed === "") return "continue";
    const checked = checkLiveSentence({
      id: `${input.idPrefix}-${seq}`,
      sentence: trimmed,
      speaker: input.speaker,
      ...(input.lodgerVoice !== undefined ? { lodgerVoice: input.lodgerVoice } : {}),
      playerText: input.playerText,
      fallbackScripted: input.fallbackScripted,
      now: now(),
    });

    if (checked.replaced) {
      replaced = true;
      const withFallback = [...acceptedSubtitle, checked.subtitle].join(" ");
      if (validateGhostReply(withFallback).ok) {
        acceptedSubtitle.push(checked.subtitle);
        spokenSentences.push(checked.spoken);
        await input.onSentence({ spoken: checked.spoken, subtitle: checked.subtitle, seq: seq++, replaced: true });
      } else if (acceptedSubtitle.length === 0) {
        acceptedSubtitle.push("The air grows quiet.");
        spokenSentences.push("The air grows quiet.");
        await input.onSentence({ spoken: "The air grows quiet.", subtitle: "The air grows quiet.", seq: seq++, replaced: true });
      }
      return "stop";
    }

    const candidateSubtitle = [...acceptedSubtitle, checked.subtitle].join(" ");
    if (!validateGhostReply(candidateSubtitle).ok) {
      replaced = true;
      if (acceptedSubtitle.length === 0) {
        const safe = checkLiveSentence({
          id: `${input.idPrefix}-safe`,
          sentence: "",
          speaker: input.speaker,
          ...(input.lodgerVoice !== undefined ? { lodgerVoice: input.lodgerVoice } : {}),
          playerText: input.playerText,
          fallbackScripted: input.fallbackScripted,
          now: now(),
        });
        acceptedSubtitle.push(safe.subtitle);
        spokenSentences.push(safe.spoken);
        await input.onSentence({ spoken: safe.spoken, subtitle: safe.subtitle, seq: seq++, replaced: true });
      }
      return "stop";
    }

    acceptedSubtitle.push(checked.subtitle);
    spokenSentences.push(checked.spoken);
    await input.onSentence({ spoken: checked.spoken, subtitle: checked.subtitle, seq: seq++, replaced: false });
    return "continue";
  };

  try {
    while (true) {
      let step: { kind: "done" } | { kind: "chunk"; value: string } | { kind: "timeout" };
      try {
        step = await nextChunkWithTimeout(iter, timeoutMs);
      } catch {
        replaced = true;
        break;
      }
      if (step.kind === "timeout") {
        timedOut = true;
        break;
      }
      if (step.kind === "done") break;

      buffer += step.value;
      // Cut runaway unpunctuated buffers before streaming gigabytes of junk.
      if (buffer.length > 500) {
        await emitValidatedSentence(buffer);
        buffer = "";
        break;
      }
      const { completed, remainder } = takeCompletedSentences(buffer);
      buffer = remainder;
      let stopped = false;
      for (const s of completed) {
        if ((await emitValidatedSentence(s)) === "stop") {
          stopped = true;
          break;
        }
      }
      if (stopped) break;
    }

    if (!replaced && !timedOut && buffer.trim() !== "") {
      for (const s of splitSentences(buffer)) {
        if ((await emitValidatedSentence(s)) === "stop") break;
      }
    }
  } finally {
    await iter.return?.().catch(() => {});
  }

  if (acceptedSubtitle.length === 0) {
    replaced = true;
    const fb = checkLiveSentence({
      id: `${input.idPrefix}-empty`,
      sentence: "",
      speaker: input.speaker,
      ...(input.lodgerVoice !== undefined ? { lodgerVoice: input.lodgerVoice } : {}),
      playerText: input.playerText,
      fallbackScripted: input.fallbackScripted,
      now: now(),
    });
    acceptedSubtitle.push(fb.subtitle);
    spokenSentences.push(fb.spoken);
    await input.onSentence({ spoken: fb.spoken, subtitle: fb.subtitle, seq: seq++, replaced: true });
  }

  const finalSubtitle = acceptedSubtitle.join(" ");
  return {
    subtitle: validateGhostReply(finalSubtitle).ok ? finalSubtitle : "The air grows quiet.",
    spokenSentences,
    replaced,
    timedOut,
  };
}
