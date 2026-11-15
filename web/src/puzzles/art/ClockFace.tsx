import type { ReactNode } from "react";

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

/** The clock face: ring, minute ticks and the numbers 1 to 12. */
export function ClockDial(): ReactNode {
  return (
    <g>
      <circle cx={CLOCK_C} cy={CLOCK_C} r={138} className="pz-clock-ring" />
      {Array.from({ length: 60 }, (_, i) => {
        const big = i % 5 === 0;
        const [x1, y1] = polar(CLOCK_C, CLOCK_C, big ? 114 : 124, i * 6);
        const [x2, y2] = polar(CLOCK_C, CLOCK_C, 132, i * 6);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={big ? "pz-tick-big" : "pz-tick"} />;
      })}
      {Array.from({ length: 12 }, (_, i) => {
        const n = i + 1;
        const [x, y] = polar(CLOCK_C, CLOCK_C, 94, n * 30);
        return <text key={n} x={x} y={y + 8} textAnchor="middle" className="pz-clock-num">{n}</text>;
      })}
    </g>
  );
}

/** The two hands at h:m. */
export function ClockHands({ h, m }: { h: number; m: number }): ReactNode {
  const [hx, hy] = polar(CLOCK_C, CLOCK_C, 66, hourAngle(h, m));
  const [mx, my] = polar(CLOCK_C, CLOCK_C, 104, minuteAngle(m));
  return (
    <g>
      <line x1={CLOCK_C} y1={CLOCK_C} x2={hx} y2={hy} className="pz-hand-hour" />
      <line x1={CLOCK_C} y1={CLOCK_C} x2={mx} y2={my} className="pz-hand-minute" />
      <circle cx={CLOCK_C} cy={CLOCK_C} r={8} className="pz-hand-hub" />
    </g>
  );
}

/** A still clock showing h:m, for the Sight (a stopped clock in an earlier room). */
export function StoppedClock({ h, m, size = "70%" }: { h: number; m: number; size?: string }): ReactNode {
  return (
    <svg viewBox="0 0 300 300" width={size} role="img" aria-label={`A stopped clock showing ${h}:${String(m).padStart(2, "0")}`}>
      <ClockDial />
      <ClockHands h={h} m={m} />
    </svg>
  );
}
