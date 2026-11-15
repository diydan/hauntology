import type { ReactNode } from "react";
import { CLOCK_C, polar } from "./ClockFace";
import "./safe.css";

/**
 * A combination safe, drawn as the thing it is: a heavy steel door plate with four rivets, a dark recess with a brass bezel, a steel dial
 * with a knurled edge, engraved numerals and a knurled knob, and a fixed brass index at the top. The dial is the only part that turns: the
 * screen puts `SafeDial` in a group it rotates, and everything else stays still. Colours: the art-* metals and the design roles.
 */

/** The gradients of the safe. Each svg that draws a part of it brings its own, under its own id. */
export function SafeDefs({ id }: { id: string }): ReactNode {
  return (
    <defs>
      <linearGradient id={`${id}-door`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" className="pz-sf-door-hi" /><stop offset="0.5" className="pz-sf-door" /><stop offset="1" className="pz-sf-door-lo" /></linearGradient>
      <radialGradient id={`${id}-well`} cx="50%" cy="50%" r="50%"><stop offset="0.82" className="pz-sf-well-in" /><stop offset="1" className="pz-sf-well-out" /></radialGradient>
      <radialGradient id={`${id}-dial`} cx="36%" cy="30%" r="85%"><stop offset="0" className="pz-sf-dial-hi" /><stop offset="0.55" className="pz-sf-dial" /><stop offset="1" className="pz-sf-dial-lo" /></radialGradient>
      <radialGradient id={`${id}-brass`} cx="36%" cy="30%" r="80%"><stop offset="0" className="pz-sf-brass-hi" /><stop offset="0.55" className="pz-sf-brass" /><stop offset="1" className="pz-sf-brass-lo" /></radialGradient>
      <radialGradient id={`${id}-knob`} cx="38%" cy="32%" r="80%"><stop offset="0" className="pz-sf-knob-hi" /><stop offset="0.6" className="pz-sf-knob" /><stop offset="1" className="pz-sf-knob-lo" /></radialGradient>
    </defs>
  );
}

/** The door plate and the recess: still, behind the dial. */
export function SafePlate({ id }: { id: string }): ReactNode {
  const rivets: ReadonlyArray<readonly [number, number]> = [[24, 24], [276, 24], [24, 276], [276, 276]];
  return (
    <g className="pz-sf-plate">
      <rect x={5} y={7} width={294} height={293} rx={26} className="pz-sf-shadow" />
      <rect x={3} y={3} width={294} height={294} rx={26} fill={`url(#${id}-door)`} className="pz-sf-door-body" />
      <rect x={10} y={10} width={280} height={280} rx={20} className="pz-sf-door-bevel" />
      {rivets.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r={7} className="pz-sf-rivet-well" />
          <circle cx={x} cy={y} r={5.4} fill={`url(#${id}-knob)`} className="pz-sf-rivet" />
          <circle cx={x - 1.6} cy={y - 1.8} r={1.6} className="pz-sf-rivet-glint" />
        </g>
      ))}
      <circle cx={CLOCK_C} cy={CLOCK_C} r={133} fill={`url(#${id}-well)`} className="pz-sf-well" />
      <circle cx={CLOCK_C} cy={CLOCK_C} r={131} className="pz-sf-bezel" />
    </g>
  );
}

/** The dial: what turns. Drawn for a centre of (150, 150); the screen turns the group it sits in. */
export function SafeDial({ id }: { id: string }): ReactNode {
  const c = CLOCK_C;
  return (
    <g className="pz-sf-dial-group" transform={`translate(${c} ${c}) scale(0.9) translate(${-c} ${-c})`}>
      <circle cx={c} cy={c} r={139} className="pz-sf-dial-edge" />
      <circle cx={c} cy={c} r={137} fill={`url(#${id}-dial)`} className="pz-sf-dial-face" />
      {/* the knurled edge: a dashed circle is a ring of fine grooves */}
      <circle cx={c} cy={c} r={134} className="pz-sf-knurl pz-sf-knurl-dark" />
      <circle cx={c} cy={c} r={134} className="pz-sf-knurl pz-sf-knurl-light" />
      {/* a tick at every tenth of the dial (100), a long one at every digit; the dashes are centred on 12 o'clock */}
      <circle cx={c} cy={c} r={126} className="pz-sf-ticks" transform={`rotate(-90 ${c} ${c})`} strokeDasharray="1.1 6.5652" strokeDashoffset={0.55} />
      <circle cx={c} cy={c} r={122} className="pz-sf-ticks-long" transform={`rotate(-90 ${c} ${c})`} strokeDasharray="2 74.6504" strokeDashoffset={1} />
      {Array.from({ length: 10 }, (_, i) => {
        const [x, y] = polar(c, c, 100, i * 36);
        return (
          <g key={i}>
            <text x={x + 0.9} y={y + 11.9} className="pz-sf-num-hi">{i}</text>
            <text x={x} y={y + 11} className="pz-sf-num">{i}</text>
          </g>
        );
      })}
      <circle cx={c} cy={c} r={50} className="pz-sf-knob-shadow" />
      <circle cx={c} cy={c} r={47} fill={`url(#${id}-brass)`} className="pz-sf-knob-ring" />
      <circle cx={c} cy={c} r={41} fill={`url(#${id}-knob)`} className="pz-sf-knob-face" />
      <circle cx={c} cy={c} r={38} className="pz-sf-knob-knurl pz-sf-knurl-dark" />
      <circle cx={c} cy={c} r={38} className="pz-sf-knob-knurl pz-sf-knurl-light" />
      <circle cx={c} cy={c} r={15} fill={`url(#${id}-brass)`} className="pz-sf-cap" />
      <circle cx={c} cy={c} r={4} className="pz-sf-dimple" />
      <path d={`M ${c} ${c - 44} l -5 -12 h 10 Z`} className="pz-sf-pointer" />
    </g>
  );
}

/** The fixed brass index at the top, which the digit to dial is read against. */
export function SafeIndex({ id }: { id: string }): ReactNode {
  return (
    <g className="pz-sf-index">
      <polygon points="152,39 140,12 164,12" className="pz-sf-index-shadow" />
      <polygon points="150,37 138,10 162,10" fill={`url(#${id}-brass)`} className="pz-sf-marker" />
      <path d="M 150 32 L 144 15" className="pz-sf-index-glint" />
    </g>
  );
}

/** The brass plaque of the Sight: the code, scratched into it. Same name for a screen reader as before. */
export function SafePlaque({ code }: { code: readonly number[] }): ReactNode {
  const n = code.length;
  const w = Math.max(150, n * 46 + 40);
  return (
    <svg viewBox={`0 0 ${w} 86`} width="min(100%, 16rem)" className="pz-sf-plaque" role="img" aria-label={`Code: ${code.join(" ")}`}>
      <defs>
        <linearGradient id="pz-sf-plaque-brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="pz-sf-brass-hi" /><stop offset="0.45" className="pz-sf-brass" /><stop offset="1" className="pz-sf-brass-lo" /></linearGradient>
      </defs>
      <rect x={3} y={6} width={w - 4} height={78} rx={9} className="pz-sf-shadow" />
      <rect x={1} y={2} width={w - 4} height={78} rx={9} fill="url(#pz-sf-plaque-brass)" className="pz-sf-plaque-body" />
      <rect x={6} y={7} width={w - 14} height={68} rx={6} className="pz-sf-plaque-bevel" />
      {([[14, 13], [w - 18, 13], [14, 69], [w - 18, 69]] as ReadonlyArray<readonly [number, number]>).map(([x, y]) => (
        <g key={`${x}-${y}`}><circle cx={x} cy={y} r={3.6} className="pz-sf-plaque-screw" /><path d={`M ${x - 2.4} ${y + 0.8} L ${x + 2.4} ${y - 0.8}`} className="pz-sf-plaque-slot" /></g>
      ))}
      {code.map((d, i) => {
        const x = w / 2 + (i - (n - 1) / 2) * 44;
        return (
          <g key={i}>
            <text x={x + 1} y={59} className="pz-sf-scratch-hi">{d}</text>
            <text x={x} y={58} className="pz-sf-scratch">{d}</text>
          </g>
        );
      })}
    </svg>
  );
}
