import { useEffect, useRef, useState } from "react";
import { isSoundId, phoneAction, type SoundAvailability, type SoundId } from "@hauntology/shared/party/sounds";
import { levelAt, MAX_LIGHT_LEVEL } from "@hauntology/shared/party/light";
import type { LightPlan, SoundEvent } from "../game-view";

/**
 * Phone sound and light (party-mode 9.14, 9.18): sounds and flashes start at the time the Room named on its own clock (corrected by the offset
 * it measured), a phone that is late drops the cue, a missing file or a phone without audio flashes and vibrates instead (never under reduced
 * motion, at most three flashes a second), and the light bar plays its grey steps inside the limits. Nothing here changes the game.
 */
export type SoundDeps = Readonly<{
  play: (id: SoundId, volume: number) => void;
  vibrate: (ms: number) => void;
  available: SoundAvailability;
  canVibrate: boolean;
  reducedMotion: boolean;
  now: () => number;
  setTimer: (f: () => void, ms: number) => unknown;
  clearTimer: (h: unknown) => void;
}>;

/** A cue later than this is dropped, not played late (the late phone misses it; party-mode 17.3). */
export const LATE_DROP_MS = 1500;
/** A cue further ahead than this is not scheduled at all (a stale clock must not hold a sound for minutes). */
export const MAX_AHEAD_MS = 10_000;
export const FLASH_MS = 150;
export const FLASH_GAP_MS = 334;
export const VIBRATE_MS = 120;

export function delayFor(playAtMs: number, nowMs: number, offsetMs: number): number | null {
  const d = playAtMs - (nowMs + offsetMs);
  return !Number.isFinite(d) || d < -LATE_DROP_MS || d > MAX_AHEAD_MS ? null : Math.max(0, d);
}

/** The sound file a SoundEvent names, and how many times it rings (a strike rings once per hour on the dial). */
export function soundOf(ev: SoundEvent): { id: SoundId | null; rings: number } {
  const bell = /^bell-(\d{1,2})$/.exec(ev.sound);
  if (ev.kind === "strike" && bell !== null) return { id: "bell", rings: Math.min(12, Math.max(1, Number(bell[1]))) };
  return { id: isSoundId(ev.sound) ? ev.sound : null, rings: 1 };
}

/** Plays (or flashes) each new SoundEvent once. Returns whether the screen is flashing now (the caller draws it, or not under reduced motion). */
export function usePhoneSound(sounds: readonly SoundEvent[], offsetMs: number, deps: SoundDeps): boolean {
  const handled = useRef<Set<string>>(new Set());
  const [flashing, setFlashing] = useState(false);
  const d = useRef(deps);
  d.current = deps;
  useEffect(() => {
    const handles: unknown[] = [];
    for (const ev of sounds) {
      if (handled.current.has(ev.id)) continue;
      handled.current.add(ev.id);
      const delay = delayFor(ev.playAtMs, d.current.now(), offsetMs);
      if (delay === null) continue;
      const { id, rings } = soundOf(ev);
      const act = id === null ? phoneAction(ev.plan, d.current.available, "creak", d.current.reducedMotion, d.current.canVibrate) : phoneAction(ev.plan, d.current.available, id, d.current.reducedMotion, d.current.canVibrate);
      if (act.action === "none" && !act.vibrate) continue;
      const fire = (n: number): void => {
        if (act.action === "play" && id !== null) d.current.play(id, Math.min(0.8, ev.volume ?? 0.8));
        if (act.action === "flash") { setFlashing(true); handles.push(d.current.setTimer(() => setFlashing(false), FLASH_MS)); }
        if (act.vibrate) d.current.vibrate(VIBRATE_MS);
        void n;
      };
      for (let k = 0; k < rings; k++) handles.push(d.current.setTimer(() => fire(k), delay + k * (act.action === "flash" ? FLASH_GAP_MS : 1200)));
    }
    return () => { /* timers of a played cue keep running: a cue is not undone by the next render */ };
  }, [sounds, offsetMs]);
  return flashing;
}

/** The light bar's brightness now, 0 to 0.9: the newest plan that has started and not finished, fading between its steps. Never above the maximum. */
export function lightLevel(lights: readonly LightPlan[], nowMs: number, offsetMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  const t = nowMs + offsetMs;
  for (const p of [...lights].reverse()) {
    const since = t - p.startAtMs;
    if (since >= 0 && since <= p.durationMs) return Math.min(MAX_LIGHT_LEVEL, Math.max(0, levelAt(p.steps, since)));
  }
  return 0;
}
