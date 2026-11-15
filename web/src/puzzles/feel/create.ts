import type { HapticName } from "@hauntology/shared/puzzles/haptics";
import { BrowserBreath, type AnalyserLike, type MicSession } from "./breath";
import { BrowserHaptics } from "./haptics";
import { BrowserMotion, type MotionHost } from "./motion";
import { BrowserSynth, type AudioLike } from "./synth";
import type { FeelEvent, FeelSettings, PuzzleFeel } from "./types";

type Win = Window & typeof globalThis & { webkitAudioContext?: new () => AudioContext; orientation?: number };

/** The real thing: tilt, buzz, sound and breath wired to this browser. `settings` is read each time, so switches take effect at once. */
export function createBrowserFeel(settings: () => FeelSettings, win: Win = window as Win): PuzzleFeel {
  const listeners = new Set<(e: FeelEvent) => void>();
  const emit = (e: FeelEvent): void => { for (const l of [...listeners]) l(e); };
  const now = (): number => win.performance.now();

  const motionHost: MotionHost = {
    addEventListener: (t, f) => win.addEventListener(t, f),
    removeEventListener: (t, f) => win.removeEventListener(t, f),
    DeviceOrientationEvent: win.DeviceOrientationEvent as MotionHost["DeviceOrientationEvent"],
    DeviceMotionEvent: win.DeviceMotionEvent as MotionHost["DeviceMotionEvent"],
    isHidden: () => win.document.hidden,
    screenAngle: () => win.screen?.orientation?.angle ?? (typeof win.orientation === "number" ? (win.orientation + 360) % 360 : 0),
    now,
    setTimeout: (fn, ms) => win.setTimeout(fn, ms),
    clearTimeout: (id) => win.clearTimeout(id),
  };
  const motion = new BrowserMotion(motionHost, settings);

  const nav = win.navigator;
  const haptics = new BrowserHaptics(
    { vibrate: typeof nav.vibrate === "function" ? (p) => nav.vibrate(p as number[]) : undefined, now, canVibrate: () => nav.userActivation?.hasBeenActive ?? true },
    settings,
    emit,
  );

  const synth = new BrowserSynth(
    {
      createContext: () => {
        const AC = win.AudioContext ?? win.webkitAudioContext;
        return AC ? (new AC() as unknown as AudioLike) : null;
      },
      setTimeout: (fn, ms) => win.setTimeout(fn, ms),
      random: () => Math.random(),
    },
    settings,
    emit,
  );

  const breath = new BrowserBreath(
    {
      async open(): Promise<MicSession> {
        const md = nav.mediaDevices;
        if (!md?.getUserMedia) throw Object.assign(new Error("no microphone"), { name: "NotFoundError" });
        const stream = await md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        const AC = win.AudioContext ?? win.webkitAudioContext;
        if (!AC) { stream.getTracks().forEach((t) => t.stop()); throw Object.assign(new Error("no audio"), { name: "NotFoundError" }); }
        const ctx = new AC();
        try { await ctx.resume(); } catch { /* the analyser still reads once the tap resumes it */ }
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser); // never connected to the speakers
        return { analyser: analyser as AnalyserLike, stop: () => { stream.getTracks().forEach((t) => t.stop()); void ctx.close().catch(() => {}); } };
      },
      now,
      setInterval: (fn, ms) => win.setInterval(fn, ms),
      clearInterval: (id) => win.clearInterval(id),
      onHidden: (fn) => {
        const check = (): void => { if (win.document.hidden) fn(); };
        win.document.addEventListener("visibilitychange", check);
        return () => win.document.removeEventListener("visibilitychange", check);
      },
    },
    settings,
  );

  return {
    motion,
    haptics,
    synth,
    breath,
    onEvent: (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    closeLock: () => { breath.stop(); },
  };
}

export type { HapticName };
