import { useEffect, useState } from "react";

/**
 * A screen wake lock while `active` (party-mode 8.1, 9.13): the TV and the phone should not go dark in the middle of a game. A browser with no
 * wake lock, or one that refuses, is not an error: the screen then follows its own timeout and the page says nothing more about it.
 * A released lock (the tab was hidden) is asked for again when the page is visible again.
 */
export type WakeLockLike = { request(type: "screen"): Promise<{ release(): Promise<void>; addEventListener?(t: "release", f: () => void): void }> };

export function useWakeLock(active: boolean, nav: { wakeLock?: WakeLockLike } = typeof navigator === "undefined" ? {} : (navigator as unknown as { wakeLock?: WakeLockLike })): "held" | "off" | "unsupported" {
  const [state, setState] = useState<"held" | "off" | "unsupported">(nav.wakeLock === undefined ? "unsupported" : "off");
  useEffect(() => {
    const lock = nav.wakeLock;
    if (!active || lock === undefined) { setState(lock === undefined ? "unsupported" : "off"); return; }
    let live = true;
    let sentinel: { release(): Promise<void> } | null = null;
    const ask = async (): Promise<void> => {
      try {
        const s = await lock.request("screen");
        if (!live) { void s.release(); return; }
        sentinel = s;
        setState("held");
        s.addEventListener?.("release", () => { if (live) setState("off"); });
      } catch { if (live) setState("off"); }
    };
    void ask();
    const onVisible = (): void => { if (document.visibilityState === "visible" && live && sentinel === null) void ask(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { live = false; document.removeEventListener("visibilitychange", onVisible); void sentinel?.release(); setState("off"); };
  }, [active, nav]);
  return state;
}
