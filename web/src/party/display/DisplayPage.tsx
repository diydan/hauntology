import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { effectLimits, pyramidLayout } from "@hauntology/shared/party/display";
import { doorMarkers, type DoorMarker } from "@hauntology/shared/party/door-markers";
import type { RoomHostPort } from "../phone/host-port";
import { clockWords, remainingMs } from "../controller/play/play-logic";
import { useNow } from "../controller/play/useNow";
import type { HostView } from "../host/host-view";
import { TvKnockSound, useTvKnock } from "./TvKnock";
import { DoorCreak, DoorDiorama, useDoorChanges, type DoorSound } from "./DoorDiorama";
import { culpritOf, FRESH_DISPLAY, reactionsFor, type DisplayMemory } from "./display-model";

export type Calibration = Readonly<{ innerPx: number; tilePx: number; orientation: "inward" | "outward"; mirror: boolean; single: boolean }>;
export const DEFAULT_CALIBRATION: Calibration = { innerPx: 120, tilePx: 320, orientation: "inward", mirror: false, single: false };
const CAL_KEY = "hauntology.party.display";
/** One flash is on for this long, and a Blackout stays dim this long after its last step. */
export const FLASH_MS = 150;
export const DIM_HOLD_MS = 3000;
const clampPx = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Number.isFinite(n) ? Math.round(n) : lo));

export function loadCalibration(storage: Pick<Storage, "getItem">): Calibration {
  try {
    const o = JSON.parse(storage.getItem(CAL_KEY) ?? "null") as Partial<Calibration> | null;
    if (o === null || typeof o !== "object") return DEFAULT_CALIBRATION;
    return { innerPx: clampPx(Number(o.innerPx), 20, 600), tilePx: clampPx(Number(o.tilePx), 60, 1200), orientation: o.orientation === "outward" ? "outward" : "inward", mirror: o.mirror === true, single: o.single === true };
  } catch { return DEFAULT_CALIBRATION; }
}

/** The one picture the Display repeats: whose turn, the clock, the haunting, and the latest line. Only what the Public View says. */
function Stage({ host, nowMs, reveal, doors, knockWords, reducedMotion }: { host: HostView; nowMs: number; reveal: string | null; doors: readonly DoorMarker[]; knockWords: string; reducedMotion: boolean }): ReactNode {
  const pub = host.game.pub;
  if (pub === null) return <p className="pd-wait">Waiting for the game…</p>;
  const active = pub.seats.find((s) => s.seat === pub.active)?.nickname ?? null;
  const left = remainingMs(pub.deadlineMs, nowMs, 0);
  const last = host.game.log.at(-1)?.text ?? "";
  return (
    <div className="pd-stage">
      <p className="pd-who">{reveal !== null ? `It was ${reveal}.` : active !== null ? `${active}'s turn` : "…"}</p>
      <p className="pd-clock">{clockWords(left, pub.paused)}</p>
      <p className="pd-haunt">Haunting {pub.haunt.level} / {pub.haunt.max}</p>
      <p className="pd-line">{last}</p>
      {knockWords !== "" ? <p className="pd-knock">{knockWords}</p> : null}
      <DoorDiorama markers={doors} reducedMotion={reducedMotion} />
    </div>
  );
}

/**
 * The optional Display (party-mode 10.1, 10.2): a second screen that shows the game four times for a pyramid of clear plastic (or once, as a plain
 * second screen). The footprint is calibrated on the screen itself (the size of the middle gap and of each picture), with orientation and mirror
 * toggles; nothing assumes a pixel density. Reactions stay inside the photosensitivity limits (at most three flashes a second, steps under 20 percent,
 * none under reduced motion) and the culprit is named when a correct Accusation ends the game. It takes no input from the game and the game does not wait for it.
 */
export function DisplayPage({ port, reducedMotion, storage, size, sound, playKnock }: { port: RoomHostPort; reducedMotion: boolean; storage: Pick<Storage, "getItem" | "setItem">; size: { width: number; height: number }; sound?: DoorSound; playKnock?: () => void }): ReactNode {
  const state = useSyncExternalStore((l) => port.subscribe(() => l()), () => port.getState(), () => port.getState());
  const nowMs = useNow();
  const host = state.view;
  const pub = host.game.pub;
  const [cal, setCal] = useState<Calibration>(() => loadCalibration(storage));
  const [showCal, setShowCal] = useState(false);
  useEffect(() => { try { storage.setItem(CAL_KEY, JSON.stringify(cal)); } catch { /* the calibration lasts this page */ } }, [storage, cal]);

  // reactions, scheduled once per new event within the limits: each flash is on for 150 ms at its time, a Blackout dims for the span of its steps
  const memory = useRef<DisplayMemory>(FRESH_DISPLAY);
  const [flashing, setFlashing] = useState(false);
  const [dimmed, setDimmed] = useState(false);
  useEffect(() => {
    if (pub === null) return;
    const t0 = Date.now();
    const r = reactionsFor(pub, memory.current, t0, remainingMs(pub.deadlineMs, t0, 0));
    memory.current = r.memory;
    if (r.events.length === 0 || reducedMotion) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const reaction of effectLimits(r.events, false)) {
      for (const at of reaction.flashes) {
        timers.push(setTimeout(() => setFlashing(true), Math.max(0, at - t0)));
        timers.push(setTimeout(() => setFlashing(false), Math.max(0, at - t0) + FLASH_MS));
      }
      if (reaction.dim.length > 0) {
        timers.push(setTimeout(() => setDimmed(true), Math.max(0, (reaction.dim[0] as { atMs: number }).atMs - t0)));
        timers.push(setTimeout(() => setDimmed(false), Math.max(0, (reaction.dim.at(-1) as { atMs: number }).atMs - t0) + DIM_HOLD_MS));
      }
    }
    // the timers belong to a reaction that already happened: they run out on their own, and a later event does not cancel them
    return () => { void timers; };
  }, [pub, reducedMotion]);
  const doors = useMemo(() => doorMarkers(pub?.doors, pub?.zones ?? []), [pub]);
  const doorNow = useRef(Date.now);
  const { words: doorWords, creaks } = useDoorChanges(pub, doorNow.current);
  const { words: knockWords, knocks } = useTvKnock(pub, doorNow.current);
  const reveal = pub?.phase === "ended" ? culpritOf(pub) : null;

  const tiles = useMemo(() => (cal.single ? [] : pyramidLayout({ width: size.width, height: size.height, innerPx: cal.innerPx, tilePx: cal.tilePx, orientation: cal.orientation, mirror: cal.mirror })), [cal, size]);
  const update = (patch: Partial<Calibration>): void => setCal((c) => ({ ...c, ...patch }));

  return (
    <div className="pd-page" data-flash={flashing && !reducedMotion ? "on" : "off"} data-dim={dimmed && !reducedMotion ? "on" : "off"}>
      {state.connection === "reconnecting" ? <p className="pd-note" role="status">Connection lost. Trying again…</p> : null}
      {cal.single || tiles.length === 0 ? (
        <div className="pd-single"><Stage host={host} nowMs={nowMs} reveal={reveal} doors={doors} knockWords={knockWords} reducedMotion={reducedMotion} /></div>
      ) : (
        <div className="pd-pyramid" aria-hidden="true">
          {tiles.map((t) => (
            <div key={t.id} className="pd-tile" data-tile={t.id} style={{ left: t.cx - t.size / 2, top: t.cy - t.size / 2, width: t.size, height: t.size, transform: `rotate(${t.rotationDeg}deg)${t.mirror ? " scaleX(-1)" : ""}` }}>
              <Stage host={host} nowMs={nowMs} reveal={reveal} doors={doors} knockWords={knockWords} reducedMotion={reducedMotion} />
            </div>
          ))}
        </div>
      )}
      <p className="ui-sr-only" aria-live="polite" data-door-live="">{doorWords}</p>
      <p className="ui-sr-only" aria-live="polite" data-knock-live="">{knockWords}</p>
      {sound !== undefined ? <DoorCreak creaks={creaks} sound={sound} /> : null}
      {playKnock !== undefined ? <TvKnockSound knocks={knocks} play={playKnock} /> : null}
      {cal.single || tiles.length === 0 ? null : <p className="ui-sr-only" role="status">{reveal !== null ? `It was ${reveal}.` : pub === null ? "Waiting for the game." : `The game is showing four times.`}</p>}
      <button type="button" className="ui-button pd-toggle" aria-expanded={showCal} onClick={() => setShowCal((v) => !v)}>Set up</button>
      {showCal ? (
        <section className="pd-cal ui-card ui-stack" aria-label="Display setup">
          <label className="ui-field-label" htmlFor="pd-inner">Gap in the middle ({cal.innerPx} px)</label>
          <input id="pd-inner" type="range" min={20} max={600} value={cal.innerPx} onChange={(e) => update({ innerPx: clampPx(Number(e.target.value), 20, 600) })} />
          <label className="ui-field-label" htmlFor="pd-tile">Size of each picture ({cal.tilePx} px)</label>
          <input id="pd-tile" type="range" min={60} max={1200} value={cal.tilePx} onChange={(e) => update({ tilePx: clampPx(Number(e.target.value), 60, 1200) })} />
          <div className="ui-segments" role="radiogroup" aria-label="Pictures face">
            <button type="button" role="radio" aria-checked={cal.orientation === "inward"} className="ui-button" onClick={() => update({ orientation: "inward" })}>Tops inward</button>
            <button type="button" role="radio" aria-checked={cal.orientation === "outward"} className="ui-button" onClick={() => update({ orientation: "outward" })}>Tops outward</button>
          </div>
          <button type="button" role="switch" aria-checked={cal.mirror} className="ui-button ui-switch" onClick={() => update({ mirror: !cal.mirror })}><span className="ui-switch-name">Mirror</span><span className="ui-switch-state">{cal.mirror ? "On" : "Off"}</span></button>
          <button type="button" role="switch" aria-checked={cal.single} className="ui-button ui-switch" onClick={() => update({ single: !cal.single })}><span className="ui-switch-name">One picture only</span><span className="ui-switch-state">{cal.single ? "On" : "Off"}</span></button>
          <p className="ui-hint">The Display only shows the game. Nothing here changes it, and the game never waits for it.</p>
        </section>
      ) : null}
    </div>
  );
}
