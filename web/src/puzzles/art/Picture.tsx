import { useId, type ReactNode } from "react";
import type { Picture as PictureData } from "@hauntology/shared/puzzles/types";

export const CELL = 100;

/**
 * The picture of the Torn photo, drawn from simple shapes as SVG (crisp at any size, no canvas to size for the screen).
 * The picture is `cols * 100` by `rows * 100` units. With `piece`, only that cell shows (a torn piece).
 */
export function PictureSvg({ picture, cols, rows, piece, label }: { picture: PictureData; cols: number; rows: number; piece?: number; label?: string }): ReactNode {
  const id = useId();
  const w = cols * CELL;
  const h = rows * CELL;
  const view = piece === undefined ? `0 0 ${w} ${h}` : `${(piece % cols) * CELL} ${Math.floor(piece / cols) * CELL} ${CELL} ${CELL}`;
  const u = Math.min(w, h);
  return (
    <svg viewBox={view} role="img" aria-label={label ?? (piece === undefined ? "A photo" : `Piece ${piece + 1} of the photo`)} preserveAspectRatio="xMidYMid slice" className="pz-picture">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={picture.top} />
          <stop offset="1" stopColor={picture.bottom} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={w} height={h} fill={`url(#${id}g)`} />
      {picture.shapes.map((s, i) => {
        const cx = s.x * w;
        const cy = s.y * h;
        const r = s.s * u;
        const common = { fill: s.c, transform: `rotate(${s.a} ${cx} ${cy})` };
        if (s.t === "circle") return <circle key={i} cx={cx} cy={cy} r={r} {...common} />;
        if (s.t === "rect") return <rect key={i} x={cx - r} y={cy - r * 0.6} width={r * 2} height={r * 1.2} {...common} />;
        return <polygon key={i} points={`${cx},${cy - r * 1.1} ${cx + r},${cy + r * 0.8} ${cx - r},${cy + r * 0.8}`} {...common} />;
      })}
    </svg>
  );
}
