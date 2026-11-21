import { useEffect, useRef } from "react";
import { shakeDetect, type Reading } from "@hauntology/shared/party/rattle";

/**
 * The phone's motion sensors, kept out of the screens (party-mode 9.4, 9.19): the permission questions (asked only from a tap) and the two
 * listeners the Controller uses, shake for Rattle and tilt for aim. A phone with no sensor answers "none" or "unneeded" and the screens fall back to touch.
 */
type Target = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export async function askMotionPermission(g: { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } } = window as never): Promise<"granted" | "denied" | "unneeded"> {
  const D = g.DeviceMotionEvent;
  if (D === undefined || typeof D.requestPermission !== "function") return "unneeded";
  try { return (await D.requestPermission()) === "granted" ? "granted" : "denied"; } catch { return "denied"; }
}

export async function askOrientationPermission(g: { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } } = window as never): Promise<"granted" | "denied" | "unneeded" | "none"> {
  const D = g.DeviceOrientationEvent;
  if (D === undefined) return "none";
  if (typeof D.requestPermission !== "function") return "unneeded";
  try { return (await D.requestPermission()) === "granted" ? "granted" : "denied"; } catch { return "denied"; }
}

export const hasMotionSensor = (g: object = window): boolean => "DeviceMotionEvent" in g;

/** Shake detection (party-mode 19.1): readings go through the shared `shakeDetect`, which reports a Rattle on three swings within 1.5 s. Only while `active`. */
export function useShake(active: boolean, onShake: () => void, target: Target = window, now: () => number = Date.now): void {
  const readings = useRef<Reading[]>([]);
  const cb = useRef(onShake);
  cb.current = onShake;
  useEffect(() => {
    if (!active) return;
    const on = (e: Event): void => {
      const a = (e as unknown as { acceleration?: { x: number | null; y: number | null; z: number | null } }).acceleration;
      if (!a) return;
      const axes = [a.x ?? 0, a.y ?? 0, a.z ?? 0];
      const strongest = axes.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0);
      const t = now();
      readings.current = [...readings.current.filter((r) => t - r.atMs < 3000), { atMs: t, a: strongest }];
      if (shakeDetect(readings.current, t).rattle) { readings.current = []; cb.current(); }
    };
    target.addEventListener("devicemotion", on);
    return () => target.removeEventListener("devicemotion", on);
  }, [active, target, now]);
}

/** Tilt aim (party-mode 9.4): small changes of the phone's angle become small aim changes. Off until the Player opts in. */
export function useGyroAim(on: boolean, onAim: (dx: number, dy: number) => void, target: Target = window): void {
  const prev = useRef<{ b: number; g: number } | null>(null);
  const cb = useRef(onAim);
  cb.current = onAim;
  useEffect(() => {
    if (!on) { prev.current = null; return; }
    const h = (e: Event): void => {
      const o = e as unknown as { beta?: number | null; gamma?: number | null };
      if (typeof o.beta !== "number" || typeof o.gamma !== "number") return;
      const p = prev.current;
      prev.current = { b: o.beta, g: o.gamma };
      if (p !== null) cb.current((o.gamma - p.g) * 2, (o.beta - p.b) * 2);
    };
    target.addEventListener("deviceorientation", h);
    return () => target.removeEventListener("deviceorientation", h);
  }, [on, target]);
}
