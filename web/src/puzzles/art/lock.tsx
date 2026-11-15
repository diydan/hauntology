import type { ReactNode } from "react";
import "./lock.css";

/**
 * The lock of the Lock pick: a pin-tumbler cylinder in cut-away. The housing (iron) is on top, the plug (brass) below it, and the shear
 * line between them is the gap the pins must reach. Each pin is a spring, a steel driver pin and a brass key pin in a bore; the keyway runs
 * under all the bores, with a steel tension wrench and a steel pick in it. One slice (SLICE units wide) is one pin; slices sit side by side
 * and join into one cylinder. A pin that is set has its two halves meeting exactly at the shear line.
 */
export const SLICE = 56;
export const HEIGHT = 140;
export const SHEAR = 66;
/** How far a pin travels from rest to set, units. */
export const LIFT = 24;
const REST_BREAK = SHEAR + LIFT; // where the driver pin meets the key pin at rest
const DRIVER = 30;
const KEY = 24;
const KEYWAY_TOP = 104;
const KEYWAY_BOTTOM = 128;
const SHAFT = 120; // the pick's shaft lies along the keyway; the wrench lies under it
/** While it is being picked a pin never rises to the shear line by itself: only setting it closes the gap. */
export const PICK_MAX = 0.82;

/** How far up a pin looks (0 to 1) for a pick position in the range lo..hi, while it is being picked. */
export const liftOf = (pos: number, lo: number, hi: number): number => Math.min(1, Math.max(0, (pos - lo) / (hi - lo || 1))) * PICK_MAX;

/** A coil spring from y1 down to y2, in the bore (the bore is 22 wide, the spring a little narrower). */
export function springPath(y1: number, y2: number): string {
  const coils = 7;
  const step = (y2 - y1) / (coils * 2);
  let d = `M 28 ${y1.toFixed(1)}`;
  for (let i = 1; i <= coils * 2; i++) d += ` L ${i % 2 === 1 ? 35 : 21} ${(y1 + step * (i - 0.5)).toFixed(1)}`;
  return `${d} L 28 ${y2.toFixed(1)}`;
}
export const driverTop = (lift: number): number => REST_BREAK - DRIVER - LIFT * lift;
export const keyBottom = (lift: number): number => REST_BREAK + KEY - LIFT * lift;

/** The metals as gradients, defined once for the whole lock (the slices and the tools all use them). */
export function LockDefs({ id }: { id: string }): ReactNode {
  return (
    <svg width="0" height="0" className="pz-lock-defs" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-iron`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="pz-lk-iron-hi" /><stop offset="0.7" className="pz-lk-iron" /><stop offset="1" className="pz-lk-iron-lo" /></linearGradient>
        <linearGradient id={`${id}-brass`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="pz-lk-brass-hi" /><stop offset="0.35" className="pz-lk-brass" /><stop offset="1" className="pz-lk-brass-lo" /></linearGradient>
        <linearGradient id={`${id}-steel`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" className="pz-lk-steel-lo" /><stop offset="0.35" className="pz-lk-steel-hi" /><stop offset="1" className="pz-lk-steel-lo" /></linearGradient>
        <linearGradient id={`${id}-pin`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" className="pz-lk-pin-lo" /><stop offset="0.35" className="pz-lk-pin-hi" /><stop offset="1" className="pz-lk-pin-lo" /></linearGradient>
        <linearGradient id={`${id}-rod`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="pz-lk-rod-hi" /><stop offset="1" className="pz-lk-rod-lo" /></linearGradient>
      </defs>
    </svg>
  );
}

/** One pin of the cylinder: `lift` is 0 at rest and 1 when set. */
export function LockPin({ id, index, lift }: { id: string; index: number; lift: number }): ReactNode {
  const top = driverTop(lift);
  return (
    <svg viewBox={`0 0 ${SLICE} ${HEIGHT}`} className="pz-lock-slice" aria-hidden="true" focusable="false">
      <rect x={0} y={0} width={SLICE} height={SHEAR} fill={`url(#${id}-iron)`} className="pz-lk-housing" />
      <rect x={0} y={SHEAR} width={SLICE} height={HEIGHT - SHEAR} fill={`url(#${id}-brass)`} className="pz-lk-plug" />
      <rect x={0} y={KEYWAY_TOP} width={SLICE} height={KEYWAY_BOTTOM - KEYWAY_TOP} className="pz-keyway" />
      <path d={`M 0 ${SHEAR} H ${SLICE}`} className="pz-shear" />
            <rect x={17} y={7} width={22} height={KEYWAY_TOP - 7 + 6} rx={3} className="pz-bore" />
      <path d={springPath(9, top)} className="pz-spring" />
      <text x={28} y={136} className="pz-pin-num">{index + 1}</text>
      <g className="pz-key-stack" style={{ transform: `translateY(${-LIFT * lift}px)` }}>
        <rect x={19} y={REST_BREAK - DRIVER} width={18} height={DRIVER} rx={1.5} fill={`url(#${id}-steel)`} className="pz-driver" />
        <path d={`M 19 ${REST_BREAK} H 37 V ${REST_BREAK + KEY - 8} L 31 ${REST_BREAK + KEY} H 25 L 19 ${REST_BREAK + KEY - 8} Z`} fill={`url(#${id}-pin)`} className="pz-keypin" />
        <path d={`M 19 ${REST_BREAK} H 37`} className="pz-seam" />
      </g>
    </svg>
  );
}

/** The tension wrench and the pick, in the keyway, over all the slices: they come in from the edges and stop at the pin being picked. */
export function LockTools({ id, count, at, lift, held }: { id: string; count: number; at: number; lift: number; held: boolean }): ReactNode {
  const width = count * SLICE;
  const x = at >= 0 && at < count ? at * SLICE + 28 : width + 12; // all set: the pick rests out of the lock
  return (
    <svg viewBox={`0 0 ${width} ${HEIGHT}`} className="pz-lock-tools" aria-hidden="true" focusable="false">
      <g className={`pz-wrench${held ? " pz-wrench-held" : ""}`}>
        <path d={`M 0 124.5 H ${width}`} className="pz-rod-shadow" />
        <path d={`M 0 124.5 H ${width}`} stroke={`url(#${id}-rod)`} className="pz-rod pz-rod-wrench" />
      </g>
      <g className="pz-pick">
        <path d={pickPath(x, keyBottom(lift) + 1.5)} className="pz-rod-shadow" />
        <path d={pickPath(x, keyBottom(lift) + 1.5)} stroke={`url(#${id}-rod)`} className="pz-rod pz-rod-pick" />
      </g>
    </svg>
  );
}

/** The pick: a steel rod along the keyway with its tip bent up under the pin. */
export function pickPath(x: number, y: number): string {
  return `M ${x} ${y.toFixed(1)} L ${x + 3} ${(y + 7).toFixed(1)} Q ${x + 6} ${SHAFT} ${x + 14} ${SHAFT} L ${x + 420} ${SHAFT}`;
}
