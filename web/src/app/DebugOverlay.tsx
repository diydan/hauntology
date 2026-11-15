import { useSyncExternalStore } from "react";
import { useBoot, useShell } from "./context";

/** `?debug=1` turns the overlay on. Any other value, or none, leaves it off. */
export const wantsDebug = (search: string): boolean => new URLSearchParams(search).get("debug") === "1";

/**
 * The Quota Snapshot, the current Stage and the Viewer frame rate (Requirement 11.4). It shows
 * counts and a Stage name: no id, no token, no text the visitor wrote.
 */
export function DebugOverlay() {
  const { debug } = useShell();
  const boot = useBoot();
  const { stage, fps } = useSyncExternalStore(debug.subscribe, debug.getSnapshot, debug.getSnapshot);
  const quota = boot.status === "ready" ? boot.quota : null;
  return (
    <aside className="debug ui-panel" aria-label="Debug" data-debug-overlay>
      <dl>
        <dt>quota</dt>
        <dd data-debug="quota">{quota ? Object.entries(quota).map(([k, v]) => `${k} ${v}`).join(" · ") : "not loaded"}</dd>
        <dt>stage</dt>
        <dd data-debug="stage">{stage ?? "none"}</dd>
        <dt>fps</dt>
        <dd data-debug="fps">{fps ?? "none"}</dd>
      </dl>
    </aside>
  );
}
