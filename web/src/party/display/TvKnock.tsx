import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PublicSnapshot } from "@hauntology/shared/party/engine";
import { tvKnockCues, tvKnockWords } from "@hauntology/shared/party/tv-knock";
import type { SoundEvent } from "../controller/game-view";

/**
 * The ghost's knock after a Slam on the Display (knock-door 5.3): the `knock` sound at the pattern's own times, once for the Round, and the
 * words for the screen and the live region (that it is knocking, and who knocked it back). The pattern is never shown, only heard.
 */
export function useTvKnock(pub: PublicSnapshot | null, nowMs: () => number): { words: string; knocks: readonly SoundEvent[] } {
  const played = useRef<Set<number>>(new Set());
  const [knocks, setKnocks] = useState<readonly SoundEvent[]>([]);
  useEffect(() => {
    if (pub === null || pub.tvKnock === null || pub.tvKnock.answeredBy !== null || played.current.has(pub.round)) return;
    played.current.add(pub.round);
    const cues = tvKnockCues(pub.round, pub.tvKnock, nowMs());
    setKnocks((o) => [...o, ...cues.map((c): SoundEvent => ({ id: c.id, kind: "cue", sound: "knock", playAtMs: c.atMs, plan: "play" }))].slice(-40));
  }, [pub, nowMs]);
  const nick = (seat: number): string | null => pub?.seats.find((s) => s.seat === seat)?.nickname ?? null;
  return { words: tvKnockWords(pub?.tvKnock, nick), knocks };
}

/** A knock later than this is dropped, not played late (the Display took too long to get it). */
export const KNOCK_LATE_DROP_MS = 1500;

/**
 * Plays each knock once at its time. `knock` is a footage-scene sound (`web/public/sounds/knock.m4a`, puzzles 20.6), not one of the seven
 * sounds of the phone and Host (`SOUND_FILES`), so it has its own `play` and the sound set is not widened. A screen with no `play` stays silent
 * (the words still show). Nothing here changes the game.
 */
export function TvKnockSound({ knocks, play, now = Date.now, setTimer = (f, ms) => setTimeout(f, ms) }: { knocks: readonly SoundEvent[]; play: () => void; now?: () => number; setTimer?: (f: () => void, ms: number) => unknown }): ReactNode {
  const handled = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const k of knocks) {
      if (handled.current.has(k.id)) continue;
      handled.current.add(k.id);
      const delay = k.playAtMs - now();
      if (delay < -KNOCK_LATE_DROP_MS) continue;
      setTimer(play, Math.max(0, delay));
    }
  }, [knocks, play, now, setTimer]);
  return null;
}
