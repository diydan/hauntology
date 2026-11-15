import { useId, type ReactNode } from "react";
import { Grad, ref } from "./patina";
import "./candles.css";

/** The flame of a candle: a glow, a teardrop in two layers and the blue root at the wick. The candle's state is set from outside (CSS). */
export function CandleFlame(): ReactNode {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 24 40" className="pz-flame-art" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-glow`} cx="50%" cy="60%" r="50%"><stop offset="0" className="pz-cf-glow-in" /><stop offset="1" className="pz-cf-glow-out" /></radialGradient>
        <Grad id={`${id}-outer`} mat="flame" dir="y" />
        <Grad id={`${id}-inner`} mat="ivory" dir="y" />
      </defs>
      <circle cx="12" cy="24" r="12" fill={ref(id, "glow")} className="pz-cf-halo" />
      <path d="M 12 2 C 14 9 20 14 20 24 C 20 31 16.5 35 12 35 C 7.5 35 4 31 4 24 C 4 14 10 9 12 2 Z" fill={ref(id, "outer")} className="pz-cf-outer" />
      <path d="M 12 14 C 13 18 16 20 16 25 C 16 29 14 31.5 12 31.5 C 10 31.5 8 29 8 25 C 8 20 11 18 12 14 Z" fill={ref(id, "inner")} className="pz-cf-inner" />
      <ellipse cx="12" cy="31.5" rx="2.6" ry="2.8" className="pz-cf-root" />
    </svg>
  );
}

/** What is left when a flame is snuffed: a thin wisp of smoke. */
export function SmokeWisp(): ReactNode {
  return (
    <svg viewBox="0 0 24 40" className="pz-smoke-art" aria-hidden="true" focusable="false">
      <path d="M 12 38 C 5 30 18 26 11 18 C 6 12 15 8 12 1" className="pz-smoke-line" />
    </svg>
  );
}

/** A candle's holder, by kind: a pewter saucer with a ring handle, a brass chamberstick dish, a plain brass base. */
export function CandleHolder({ kind }: { kind: number }): ReactNode {
  const id = useId().replace(/:/g, "");
  const k = ((kind % 3) + 3) % 3;
  return (
    <svg viewBox="0 0 80 22" className="pz-holder-art" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMax meet">
      <defs>
        <Grad id={`${id}-m`} mat={k === 0 ? "steel" : "brass"} dir="y" />
        <Grad id={`${id}-s`} mat={k === 0 ? "steel" : "brass"} dir="x" />
        <Grad id={`${id}-c`} mat="copper" dir="y" />
      </defs>
      <ellipse cx="40" cy="19.4" rx="36" ry="2.6" className="pz-sg-shadow" />
      {k === 0 ? <path d="M 6 8 C -1 6 -1 15 7 15" className="pz-holder-ring pz-sg-edge" /> : null}
      {k === 1 ? <path d="M 72 4 C 82 3 82 14 70 14" className="pz-holder-ring pz-sg-edge" /> : null}
      <path d={k === 2 ? "M 6 14 H 74 L 70 18.5 H 10 Z" : "M 7 10 H 73 C 73 15 66 18.5 58 18.5 H 22 C 14 18.5 7 15 7 10 Z"} fill={ref(id, "s")} className="pz-sg-edge" />
      <ellipse cx="40" cy="10" rx={k === 2 ? 34 : 33} ry="3.6" fill={ref(id, "m")} className="pz-sg-edge" />
      <ellipse cx="40" cy="9.5" rx="15" ry="1.8" className="pz-holder-well" />
      {k === 1 ? <path d="M 24 12 Q 40 16 56 12" className="pz-sg-shine" /> : <path d="M 12 12.6 Q 40 15.6 68 12.6" className="pz-sg-shine" />}
    </svg>
  );
}

/** A small brass-grilled microphone on a stand, for the "Blow to snuff" panel. */
export function BrassMic(): ReactNode {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 32 40" width="26" height="32" className="pz-mic-icon" aria-hidden="true" focusable="false">
      <defs>
        <Grad id={`${id}-b`} mat="brass" dir="x" />
        <Grad id={`${id}-s`} mat="steel" dir="x" />
      </defs>
      <rect x="9" y="3" width="14" height="22" rx="7" fill={ref(id, "b")} className="pz-sg-edge" />
      <path d="M 11 9 H 21 M 10.5 13 H 21.5 M 10.5 17 H 21.5 M 11.5 21 H 20.5" className="pz-mic-grille" />
      <path d="M 5 17 C 5 28 27 28 27 17" className="pz-mic-cradle" />
      <rect x="14.5" y="27" width="3" height="8" fill={ref(id, "s")} className="pz-sg-edge" />
      <ellipse cx="16" cy="37" rx="8" ry="2.4" fill={ref(id, "s")} className="pz-sg-edge" />
    </svg>
  );
}
