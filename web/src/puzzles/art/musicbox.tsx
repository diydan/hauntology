import { useId, type ReactNode } from "react";
import { Grad, ref } from "./patina";
import "./musicbox.css";

const W = 340;
const TEETH = [17, 15, 13, 11, 9] as const; // a shorter tooth is a higher note
/** The pins of the cylinder: a fixed pattern, so the box always looks the same. */
const PINS: ReadonlyArray<readonly [number, number]> = Array.from({ length: 29 }, (_, k) => [0, 1, 2].map((r) => ((k * 7 + r * 13 + (k >> 2) * 5) % 4 === 0 ? ([36 + k * 9, 14 + r * 6] as const) : null)).filter((p): p is readonly [number, number] => p !== null)).flat();

/**
 * What is under the lid of a music box: the brass cylinder with its pins, the steel comb with its five teeth (one above each key, so the key that
 * plays a tooth is the one under it) and the crank. The tooth of the key that is sounding glows warm, as the key does (a fade, never a flash).
 */
export function MusicMechanism({ lit }: { lit: number | null }): ReactNode {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox={`0 0 ${W} 66`} width="100%" className="pz-mech" aria-hidden="true" focusable="false">
      <defs>
        <Grad id={`${id}-brassY`} mat="brass" dir="y" />
        <Grad id={`${id}-brassX`} mat="brass" dir="x" />
        <Grad id={`${id}-steelY`} mat="steel" dir="y" />
        <Grad id={`${id}-steelX`} mat="steel" dir="x" />
      </defs>
      <rect x="0" y="0" width={W} height="66" rx="8" className="pz-mech-felt" />
      <ellipse cx="22" cy="20" rx="5" ry="12" fill={ref(id, "brassX")} className="pz-sg-edge" />
      <rect x="22" y="8" width="278" height="24" fill={ref(id, "brassY")} className="pz-mech-cylinder" />
      <path d="M 22 11.5 H 300" className="pz-sg-shine" />
      <ellipse cx="300" cy="20" rx="5" ry="12" fill={ref(id, "brassX")} className="pz-sg-edge" />
      {PINS.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.5} className="pz-mech-pin" />)}
      <path d="M 305 20 H 316" className="pz-mech-shaft" />
      <circle cx="322" cy="20" r="6.5" fill={ref(id, "brassX")} className="pz-sg-edge" />
      <path d="M 322 20 L 331 8" className="pz-mech-arm" />
      <circle cx="331" cy="7" r="3.6" fill={ref(id, "brassX")} className="pz-sg-edge" />
      <rect x="14" y="37" width="312" height="7" rx="3" fill={ref(id, "steelY")} className="pz-sg-edge" />
      <circle cx="21" cy="40.5" r="1.7" className="pz-mech-screw" />
      <circle cx="319" cy="40.5" r="1.7" className="pz-mech-screw" />
      {TEETH.map((len, i) => {
        const cx = (W * (i + 0.5)) / 5;
        return <rect key={i} x={cx - 3.5} y={44} width={7} height={len} rx={2} fill={ref(id, "steelX")} className={`pz-sg-edge pz-mech-tooth${lit === i ? " pz-tooth-lit" : ""}`} />;
      })}
    </svg>
  );
}
