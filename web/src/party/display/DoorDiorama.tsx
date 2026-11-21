import { useEffect, useRef, useState, type ReactNode } from "react";
import { doorChanges, doorStates, type DoorMarker } from "@hauntology/shared/party/door-markers";
import type { PublicSnapshot } from "@hauntology/shared/party/engine";
import type { SoundEvent } from "../controller/game-view";
import { usePhoneSound, type SoundDeps } from "../controller/play/phone-sound";

/**
 * The doors on the TV (knock-door 8.2): one marker for each door on the diorama, shut or open, swung slowly (the `--fade-slow` time, never a
 * flash; reduced motion shows the final state with no swing), each with its state in words. A world with no doors draws nothing (8.4).
 * Only the Public View feeds it, so it shows no pattern and no card.
 */
export function DoorDiorama({ markers, reducedMotion }: { markers: readonly DoorMarker[]; reducedMotion: boolean }): ReactNode {
  if (markers.length === 0) return null;
  return (
    <div className="pd-doors">
      <div className="pd-diorama" aria-hidden="true">
        {markers.map((m) => (
          <span key={m.id} className="pd-door" data-door={m.id} data-open={m.open ? "yes" : "no"} data-at-door={m.atDoor ? "yes" : "no"} data-motion={reducedMotion ? "none" : "swing"} style={{ left: `${m.xPct}%`, top: `${m.yPct}%` }}>
            <span className="pd-door-leaf" />
          </span>
        ))}
      </div>
      <ul className="pd-door-words ui-hint">
        {markers.map((m) => (<li key={m.id}>{m.label}{m.atDoor ? ". A Player is at it" : ""}</li>))}
      </ul>
    </div>
  );
}

export type DoorSound = Readonly<{ deps: SoundDeps; offsetMs: number }>;

/**
 * Watches the Public View's doors and, for each door that opened or shut, gives the words for the live region and a `creak` cue. The first
 * look at the doors is quiet. `nowMs` stamps the cue so the Display plays it at once.
 */
export function useDoorChanges(pub: PublicSnapshot | null, nowMs: () => number): { words: string; creaks: readonly SoundEvent[] } {
  const seen = useRef<Map<string, boolean> | null>(null);
  const count = useRef(0);
  const [out, setOut] = useState<{ words: string; creaks: readonly SoundEvent[] }>({ words: "", creaks: [] });
  useEffect(() => {
    if (pub === null) return;
    const changes = doorChanges(seen.current, pub.doors, pub.zones);
    seen.current = doorStates(pub.doors);
    if (changes.length === 0) return;
    const at = nowMs();
    setOut((o) => ({
      words: changes.map((c) => c.words).join(" "),
      creaks: [...o.creaks, ...changes.map((c): SoundEvent => ({ id: `door-${c.id}-${++count.current}`, kind: "cue", sound: "creak", playAtMs: at, plan: "play" }))].slice(-20),
    }));
  }, [pub, nowMs]);
  return out;
}

/** Plays the creaks (and does nothing else). Rendered only where the Display has sound. */
export function DoorCreak({ creaks, sound }: { creaks: readonly SoundEvent[]; sound: DoorSound }): ReactNode {
  usePhoneSound(creaks, sound.offsetMs, sound.deps);
  return null;
}
