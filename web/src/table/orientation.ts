import type { Orientation } from "./view";

/**
 * The phone's orientation sensor, behind a small port so the Table can be tested with a fake (spirit-table 4.2, 4.3). It keeps nothing: a
 * reading goes straight to whoever is listening and is never stored or sent. On an iPhone the permission can only be asked for from a tap, so
 * `enable` is called from the Player's own tap (the Spirit table switch, or Tilt).
 */
export interface OrientationSource {
  /** Whether this phone has the sensor at all. */
  readonly available: boolean;
  /** Ask for it (from a tap) and start listening. True when readings will come. */
  enable(): Promise<boolean>;
  /** Stop listening. */
  disable(): void;
  /** Called with every reading while enabled; returns the way to stop. */
  subscribe(listener: (o: Orientation) => void): () => void;
}

type PermissionedEvent = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

/** The face-down rule: a phone lying screen down (beta near +-180) pauses the Table (6.1). */
export const isFaceDown = (o: Orientation): boolean => typeof o.beta === "number" && Number.isFinite(o.beta) && Math.abs(o.beta) >= 150;

export function createOrientationSource(win: Window | undefined = typeof window === "undefined" ? undefined : window): OrientationSource {
  const listeners = new Set<(o: Orientation) => void>();
  let on = false;
  const handler = (e: Event): void => {
    const d = e as DeviceOrientationEvent;
    const o: Orientation = { alpha: d.alpha, beta: d.beta, gamma: d.gamma };
    for (const l of listeners) l(o);
  };
  const available = !!win && "DeviceOrientationEvent" in win;
  return {
    available,
    async enable() {
      if (!win || !available) return false;
      const ctor = (win as unknown as { DeviceOrientationEvent: PermissionedEvent }).DeviceOrientationEvent;
      if (typeof ctor.requestPermission === "function") {
        try { if ((await ctor.requestPermission()) !== "granted") return false; } catch { return false; }
      }
      if (!on) { win.addEventListener("deviceorientation", handler); on = true; }
      return true;
    },
    disable() { if (win && on) { win.removeEventListener("deviceorientation", handler); on = false; } },
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}
