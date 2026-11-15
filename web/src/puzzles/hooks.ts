import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Subscribe } from "./feel/types";

/** The latest value in a ref, so a long-lived callback (a frame loop, a listener) never sees a stale one. */
export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/** The largest step a frame may report: a tab that was in the background does not jump the physics. */
export const MAX_FRAME_MS = 50;

/**
 * A frame loop: `fn(timeMs, dtMs)` on every animation frame while `active`. The step is never negative and never
 * more than 50 ms, and the loop stops while the page is hidden (no battery spent on a screen nobody sees) and on unmount.
 */
export function useFrame(fn: (t: number, dtMs: number) => void, active = true): void {
  const latest = useLatest(fn);
  useEffect(() => {
    if (!active) return undefined;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number): void => {
      const dt = Math.max(0, Math.min(MAX_FRAME_MS, t - last));
      last = t;
      latest.current(t, dt);
      raf = requestAnimationFrame(loop);
    };
    const start = (): void => { last = performance.now(); raf = requestAnimationFrame(loop); };
    const stop = (): void => { cancelAnimationFrame(raf); raf = 0; };
    const onVisibility = (): void => { stop(); if (!document.hidden) start(); };
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) start();
    return () => { document.removeEventListener("visibilitychange", onVisibility); stop(); };
  }, [active, latest]);
}

/** Re-render when a piece of the feel layer (tilt state, sound state, microphone state) changes. */
export function useFeelValue<T>(subscribe: Subscribe, read: () => T): T {
  return useSyncExternalStore(subscribe, read, read);
}

/** What a screen wake lock needs from the browser: `navigator.wakeLock`, or nothing where there is none. */
export type WakeLockSentinelLike = { release(): Promise<void> };
export type WakeLockHost = Readonly<{
  request: (() => Promise<WakeLockSentinelLike>) | undefined;
  isHidden(): boolean;
  onVisibility(fn: () => void): () => void;
}>;
const browserWakeLock = (): WakeLockHost => {
  const lock = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> } }).wakeLock;
  return {
    request: lock ? () => lock.request("screen") : undefined,
    isHidden: () => document.hidden,
    onVisibility: (fn) => { document.addEventListener("visibilitychange", fn); return () => document.removeEventListener("visibilitychange", fn); },
  };
};

/**
 * Keep the screen awake while `active` (a Lock is open): tilt puzzles are played with no touch for a while, and a phone that
 * dims mid-puzzle spoils them. The browser drops the lock when the page is hidden, so it is asked for again when the page
 * comes back. Nothing happens where the browser has no wake lock, or refuses it (low battery): the puzzle goes on.
 */
export function useWakeLock(active: boolean, host?: WakeLockHost): void {
  useEffect(() => {
    if (!active) return undefined;
    const h = host ?? browserWakeLock();
    if (!h.request) return undefined;
    let held: WakeLockSentinelLike | null = null;
    let gone = false;
    const acquire = (): void => {
      if (gone || held !== null || h.isHidden() || !h.request) return;
      h.request().then((sentinel) => {
        if (gone) void sentinel.release().catch(() => {});
        else held = sentinel;
      }, () => { /* refused: the puzzle does not need it */ });
    };
    const onVisibility = (): void => {
      if (h.isHidden()) held = null; // the browser has already let go of it
      else acquire();
    };
    const off = h.onVisibility(onVisibility);
    acquire();
    return () => {
      gone = true;
      off();
      const sentinel = held;
      held = null;
      if (sentinel) void sentinel.release().catch(() => {});
    };
  }, [active, host]);
}
