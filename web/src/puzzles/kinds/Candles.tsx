import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFeelValue, useFrame, useLatest } from "../hooks";
import type { KindProps } from "./types";
import "./Candles.css";

/** Candle heights in rem (told apart by number and height, never by colour). */
const HEIGHTS = [6, 3.9, 7.4, 4.9, 6.5] as const;
const HEIGHT_NAMES = ["tall", "short", "tallest", "low", "tall"] as const;
/** How long a candle gutters while the order is shown, and the pause before the next one. */
const GUTTER_MS = 520;
const GAP_MS = 260;
/** The loudness meter scale (the level is 0 to about 0.45 for a hard breath). */
const METER = 220;

function Mic(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="pz-mic-icon">
      <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Candle order: watch the candles gutter one at a time (twice at most), then put them out in that same order by tapping
 * them. A wrong order relights every candle. "Blow to snuff" is an optional extra: tap a candle to pick it, then blow on
 * the phone. Only a loudness number is ever read; nothing is recorded.
 */
export default function Candles({ view, feel, reducedMotion, submit, announce, resetKey }: KindProps<"candles">) {
  const [out, setOut] = useState<number[]>([]);
  const [shown, setShown] = useState(0);
  const [guttering, setGuttering] = useState<number | null>(null);
  const [showing, setShowing] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [wanted, setWanted] = useState(false);
  const micState = useFeelValue(feel.breath.subscribe, () => feel.breath.state);
  const listening = wanted && micState === "on";
  const latest = useLatest({ out, shown, showing, selected, listening });
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const alive = useRef(true);
  const flames = useRef<Array<HTMLSpanElement | null>>([]);
  const meter = useRef<HTMLElement | null>(null);
  const mark = useRef<HTMLElement | null>(null);
  const latched = useRef(false);

  const later = (fn: () => void, ms: number): void => {
    const id = setTimeout(() => { timers.current.delete(id); fn(); }, ms);
    timers.current.add(id);
  };
  const stopMic = (): void => { feel.breath.stop(); setWanted(false); setSelected(null); latest.current.selected = null; };

  // Everything stops with the screen: the timers and the microphone.
  useEffect(() => {
    alive.current = true;
    const all = timers.current;
    return () => {
      alive.current = false;
      for (const id of all) clearTimeout(id);
      all.clear();
      feel.breath.stop();
    };
  }, [feel]);
  // The microphone also stops when the page is hidden.
  useEffect(() => {
    const onHide = (): void => { if (document.hidden && latest.current.listening) stopMic(); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);
  // No lean is left on a flame once nobody is listening.
  useEffect(() => { if (!listening) for (const f of flames.current) if (f) f.style.transform = ""; }, [listening]);
  // If the microphone goes off by itself (the host closing the Lock), the toggle follows.
  useEffect(() => { if (wanted && micState !== "on") { setWanted(false); setSelected(null); latest.current.selected = null; } }, [wanted, micState, latest]);

  // A wrong Attempt relights every candle (the host raises resetKey).
  const seen = useRef(resetKey);
  useEffect(() => {
    if (seen.current === resetKey) return;
    seen.current = resetKey;
    latest.current.out = [];
    latest.current.selected = null;
    setOut([]);
    setSelected(null);
  }, [resetKey, latest]);

  const snuff = (i: number): void => {
    const cur = latest.current;
    if (cur.showing || cur.out.includes(i) || cur.out.length >= view.n) return;
    const next = [...cur.out, i];
    cur.out = next;
    cur.selected = null;
    setOut(next);
    setSelected(null);
    feel.synth.play("gutter");
    feel.haptics.buzz("tick");
    announce(`Candle ${i + 1} out. ${next.length} of ${view.n}.`);
    if (next.length === view.n) submit({ order: next });
  };
  const tap = (i: number): void => {
    const cur = latest.current;
    if (cur.showing || cur.out.includes(i)) return;
    if (cur.listening) {
      cur.selected = i;
      setSelected(i);
      announce(`Candle ${i + 1} picked. Blow on the phone to put it out.`);
      return;
    }
    snuff(i);
  };
  const relight = (): void => { latest.current.out = []; latest.current.selected = null; setOut([]); setSelected(null); };

  const watch = (): void => {
    const cur = latest.current;
    if (cur.showing || cur.shown >= view.shows) return;
    cur.showing = true;
    cur.shown += 1;
    cur.out = [];
    cur.selected = null;
    setShowing(true);
    setShown(cur.shown);
    setOut([]);
    setSelected(null);
    announce("Watch the candles gutter, one at a time.");
    const step = (k: number): void => {
      const candle = view.order[k];
      if (candle === undefined) { latest.current.showing = false; setShowing(false); return; }
      setGuttering(candle);
      feel.synth.play("gutter");
      feel.haptics.buzz("tick");
      later(() => { setGuttering(null); later(() => step(k + 1), GAP_MS); }, GUTTER_MS);
    };
    step(0);
  };

  const toggleMic = async (): Promise<void> => {
    if (latest.current.listening) { stopMic(); return; }
    const result = await feel.breath.start();
    if (!alive.current) { feel.breath.stop(); return; } // the screen went while the Player was answering the prompt
    if (result !== "on") {
      announce(result === "denied" ? "The microphone was denied. Tap the candles instead." : "There is no microphone. Tap the candles instead.");
      return;
    }
    setWanted(true);
  };

  // Blow to snuff: the loudness leans the picked flame; a breath puts it out. A breath counts once, so it must stop before the next.
  useFrame(() => {
    const b = feel.breath;
    const sel = latest.current.selected;
    if (meter.current) meter.current.style.width = `${Math.min(100, b.level * METER)}%`;
    if (mark.current) mark.current.style.left = `${Math.min(100, b.threshold * METER)}%`;
    flames.current.forEach((f, i) => { if (f) f.style.transform = i === sel && !reducedMotion ? `skewX(${Math.min(40, b.level * 120)}deg)` : ""; });
    if (!b.blowing) { latched.current = false; return; }
    if (sel !== null && !latched.current) { latched.current = true; snuff(sel); }
  }, listening);

  const left = view.shows - shown;
  const watchText = showing ? "Watching…" : left <= 0 ? "No more shows" : `Watch (${left} left)`;
  return (
    <div className="pz-candles">
      <p className="pz-hint">{listening ? "Tap a candle to pick it, then blow on the phone." : "Watch the order, then tap the candles to put them out in that same order."}</p>
      <div className="pz-row">
        <button type="button" className="pz-btn pz-btn-primary" disabled={showing || left <= 0} onClick={watch}>{watchText}</button>
      </div>
      <div className="pz-candle-row" role="group" aria-label="Candles">
        {Array.from({ length: view.n }, (_, i) => {
          const isOut = out.includes(i);
          const flame = isOut ? "out" : guttering === i ? "gutter" : "lit";
          return (
            <button key={i} type="button" className="pz-candle" disabled={showing || isOut} aria-label={`Candle ${i + 1}, ${HEIGHT_NAMES[i]}${isOut ? ", out" : ""}`} aria-pressed={listening && !isOut ? selected === i : undefined} data-flame={flame} data-height={HEIGHT_NAMES[i]} onClick={() => tap(i)}>
              <span className="pz-flame" ref={(el) => { flames.current[i] = el; }} aria-hidden="true" />
              <span className="pz-wax" style={{ height: `${HEIGHTS[i]}rem` }} aria-hidden="true">{i + 1}</span>
            </button>
          );
        })}
      </div>
      <p className="pz-readout pz-out-so-far" role="img" aria-label={`Out so far: ${out.length === 0 ? "none" : out.map((c) => c + 1).join(", ")}`}>{out.length === 0 ? "·" : out.map((c) => c + 1).join(" ")}</p>
      <div className="pz-row">
        <button type="button" className="pz-btn pz-btn-quiet" disabled={showing || out.length === 0} onClick={relight}>Relight</button>
        <button type="button" className="pz-btn" aria-pressed={listening} onClick={() => void toggleMic()}>Blow to snuff</button>
      </div>
      {listening ? (
        <div className="pz-mic" role="status">
          <Mic />
          <span>Microphone on: listening for a breath</span>
          <span className="pz-meter" aria-hidden="true"><i ref={meter} /><u ref={mark} /></span>
          <button type="button" className="pz-btn pz-btn-quiet" onClick={stopMic}>Stop listening</button>
        </div>
      ) : null}
      <p className="pz-hint">The microphone is optional and only measures loudness. Nothing is recorded.</p>
    </div>
  );
}
