import { useId, type ReactNode } from "react";
import "./clock.css";

export const CLOCK_C = 150;

/** A point on a circle: degrees clockwise from 12 o'clock. */
export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}
/** The angle in degrees clockwise from 12 o'clock of a point relative to a centre. */
export function angleOf(cx: number, cy: number, x: number, y: number): number {
  return ((Math.atan2(x - cx, cy - y) * 180) / Math.PI + 360) % 360;
}
export const hourAngle = (h: number, m: number): number => (h % 12) * 30 + m * 0.5;
export const minuteAngle = (m: number): number => m * 6;

const idOf = (raw: string): string => raw.replace(/:/g, "");

/**
 * The clock, drawn as the thing it is: an antique clock with an ivory enamel dial (a few hairline cracks), a black minute track, black
 * numerals, in a brass bezel with a soft shadow. The hands and the glass over them are in `ClockHands`. Both are used by the puzzle and by
 * the clue (the stopped clock), and their styles load with them (./clock.css).
 */
export function ClockDial(): ReactNode {
  const id = idOf(useId());
  const c = CLOCK_C;
  return (
    <g className="pz-ck-dial">
      <defs>
        <linearGradient id={`${id}-bezel`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" className="pz-ck-brass-hi" /><stop offset="0.5" className="pz-ck-brass" /><stop offset="1" className="pz-ck-brass-lo" /></linearGradient>
        <radialGradient id={`${id}-enamel`} cx="42%" cy="36%" r="78%"><stop offset="0" className="pz-ck-enamel-hi" /><stop offset="0.7" className="pz-ck-enamel" /><stop offset="1" className="pz-ck-enamel-lo" /></radialGradient>
      </defs>
      <circle cx={c + 2} cy={c + 3} r={146} className="pz-ck-shadow" />
      <circle cx={c} cy={c} r={146} className="pz-ck-bezel-edge" />
      <circle cx={c} cy={c} r={143} fill={`url(#${id}-bezel)`} className="pz-ck-bezel" />
      <circle cx={c} cy={c} r={134} className="pz-ck-bezel-groove" />
      <circle cx={c} cy={c} r={131} className="pz-ck-face-rim" />
      <circle cx={c} cy={c} r={130} fill={`url(#${id}-enamel)`} className="pz-ck-face" />
      <path d="M 70 62 L 78 70 L 74 80 M 226 228 L 218 222 L 224 212 M 238 112 L 230 118" className="pz-ck-craze" />
      <circle cx={c} cy={c} r={127} className="pz-ck-track" />
      <circle cx={c} cy={c} r={113} className="pz-ck-track" />
      {Array.from({ length: 60 }, (_, i) => {
        const big = i % 5 === 0;
        const [x1, y1] = polar(c, c, big ? 109 : 115, i * 6);
        const [x2, y2] = polar(c, c, 125, i * 6);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={big ? "pz-ck-tick-big" : "pz-ck-tick"} />;
      })}
      {Array.from({ length: 12 }, (_, i) => {
        const n = i + 1;
        const [x, y] = polar(c, c, 88, n * 30);
        return <text key={n} x={x} y={y + 10} textAnchor="middle" className="pz-ck-num">{n}</text>;
      })}
    </g>
  );
}

/**
 * The two hands at h:m: a spade-tipped hour hand and a long poker minute hand in dark blued steel, with a soft shadow, a brass boss at
 * the centre and the glint of the glass over everything. `active` is the hand the Player is turning: a thin gilt edge picks it out.
 */
export function ClockHands({ h, m, active }: { h: number; m: number; active?: "hour" | "minute" | undefined }): ReactNode {
  const id = idOf(useId());
  const c = CLOCK_C;
  const hour = "M -3.2 17 L -3.2 -32 C -13 -39, -14 -53, 0 -72 C 14 -53, 13 -39, 3.2 -32 L 3.2 17 Z";
  const minute = "M -2.4 24 L -2.4 -78 L -6 -82 L 0 -110 L 6 -82 L 2.4 -78 L 2.4 24 Z";
  const hand = (which: "hour" | "minute", angle: number, d: string): ReactNode => (
    <g key={which}>
      <g transform={`translate(${c + 2.5} ${c + 4}) rotate(${angle})`}><path d={d} className="pz-ck-hand-shadow" />{which === "minute" ? <circle cy={21} r={6.5} className="pz-ck-hand-shadow" /> : null}</g>
      <g transform={`translate(${c} ${c}) rotate(${angle})`}>
        <path d={d} className={active === which ? "pz-ck-hand pz-ck-hand-active" : "pz-ck-hand"} />
        {which === "minute" ? <circle cy={21} r={6.5} className={active === which ? "pz-ck-hand pz-ck-hand-active" : "pz-ck-hand"} /> : null}
        <path d={which === "hour" ? "M -1.6 12 L -1.6 -32" : "M -1 20 L -1 -76"} className="pz-ck-hand-shine" />
      </g>
    </g>
  );
  return (
    <g className="pz-ck-hands">
      <defs>
        <radialGradient id={`${id}-boss`} cx="36%" cy="30%" r="80%"><stop offset="0" className="pz-ck-brass-hi" /><stop offset="0.55" className="pz-ck-brass" /><stop offset="1" className="pz-ck-brass-lo" /></radialGradient>
        <radialGradient id={`${id}-glint`} cx="50%" cy="50%" r="50%"><stop offset="0" className="pz-ck-glint-in" /><stop offset="1" className="pz-ck-glint-out" /></radialGradient>
        <clipPath id={`${id}-glass`}><circle cx={c} cy={c} r={129} /></clipPath>
      </defs>
      {hand("hour", hourAngle(h, m), hour)}
      {hand("minute", minuteAngle(m), minute)}
      <circle cx={c + 1.5} cy={c + 2.5} r={10} className="pz-ck-hand-shadow" />
      <circle cx={c} cy={c} r={9.5} fill={`url(#${id}-boss)`} className="pz-ck-boss" />
      <circle cx={c} cy={c} r={2.6} className="pz-ck-boss-dimple" />
      <ellipse cx={108} cy={80} rx={86} ry={40} transform="rotate(-36 108 80)" fill={`url(#${id}-glint)`} clipPath={`url(#${id}-glass)`} className="pz-ck-glint" />
    </g>
  );
}

/** A still clock showing h:m, for the Sight (a stopped clock in an earlier room). */
export function StoppedClock({ h, m, size = "70%" }: { h: number; m: number; size?: string }): ReactNode {
  return (
    <svg viewBox="0 0 300 300" width={size} className="pz-stopped" role="img" aria-label={`A stopped clock showing ${h}:${String(m).padStart(2, "0")}`}>
      <ClockDial />
      <ClockHands h={h} m={m} />
    </svg>
  );
}
