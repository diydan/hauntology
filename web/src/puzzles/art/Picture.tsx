import { useId, useMemo, type ReactNode } from "react";
import type { Picture as PictureData } from "@hauntology/shared/puzzles/types";
import { hash, mulberry32 } from "@hauntology/shared/puzzles/rng";
import "./picture.css";

export const CELL = 100;
/** The white border of the print, inside the picture (the pieces on the edge of the photo carry it). */
export const BORDER = 5;
/** How far the paper shows past the torn emulsion, units. */
const FIBRE = 2.6;
const STEPS = 9;
export const JAG = 3.6;

type Hsl = { h: number; s: number; l: number };
const parse = (c: string): Hsl => {
  const m = /hsl\(\s*([\d.]+)[ ,]+([\d.]+)%[ ,]+([\d.]+)%/.exec(c);
  return m ? { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) } : { h: 30, s: 20, l: 50 };
};
/** A tone of the print: the lightness of the original colour, as a mix of the dark and the pale of an old sepia photograph. */
const tone = (c: string, lift = 0): string => {
  const { l } = parse(c);
  const t = Math.round(Math.min(1, Math.max(0, (l - 12) / 70 + lift)) * 100);
  return `color-mix(in srgb, var(--art-paper) ${t}%, var(--photo-ink))`;
};

/** The torn shape of one piece: every edge it shares with another piece is ragged (the same curve on both sides), the edges on the outside of the photo are straight. */
export function tornCell(piece: number, cols: number, rows: number, spread: number): string {
  const x0 = (piece % cols) * CELL;
  const y0 = Math.floor(piece / cols) * CELL;
  const col = piece % cols;
  const row = Math.floor(piece / cols);
  /** The ragged edge between two pieces (a < b): the same offsets for both, measured along the increasing coordinate. */
  const profile = (a: number, b: number): number[] => {
    const r = mulberry32(hash("tear", a, b, cols, rows));
    return Array.from({ length: STEPS + 1 }, (_, i) => (i === 0 || i === STEPS ? 0 : (r() * 2 - 1) * JAG));
  };
  const pts: string[] = [];
  const push = (x: number, y: number): void => { pts.push(`${x.toFixed(1)},${y.toFixed(1)}`); };
  const edge = (other: number | null, at: (u: number, o: number) => [number, number], reverse: boolean): void => {
    const idx = Array.from({ length: STEPS + 1 }, (_, i) => (reverse ? STEPS - i : i));
    if (other === null) { for (const i of idx) { const [x, y] = at(i / STEPS, 0); push(x, y); } return; }
    const o = profile(Math.min(piece, other), Math.max(piece, other));
    const sign = piece < other ? 1 : -1;
    for (const i of idx) { const [x, y] = at(i / STEPS, (o[i] ?? 0) * sign + (i === 0 || i === STEPS ? 0 : spread)); push(x, y); }
  };
  edge(row > 0 ? piece - cols : null, (u, o) => [x0 + CELL * u, y0 - o], false); // top, left to right
  edge(col < cols - 1 ? piece + 1 : null, (v, o) => [x0 + CELL + o, y0 + CELL * v], false); // right, top to bottom
  edge(row < rows - 1 ? piece + cols : null, (u, o) => [x0 + CELL * u, y0 + CELL + o], true); // bottom, right to left
  edge(col > 0 ? piece - 1 : null, (v, o) => [x0 - o, y0 + CELL * v], true); // left, bottom to top
  return pts.join(" ");
}

/** A fixed, irregular scatter of specks for the grain of the print (a tile of 43 units, so no lattice shows): x, y, dark. */
const GRAIN_TILE = 43;
const GRAIN: ReadonlyArray<readonly [number, number, boolean]> = (() => {
  const r = mulberry32(20241115);
  return Array.from({ length: 64 }, () => [r() * GRAIN_TILE, r() * GRAIN_TILE, r() < 0.55] as const);
})();

/**
 * The picture of the Torn photo: an old print, drawn from the shapes of the picture. A moon or a lamp, a building, a pine: the circles, the
 * rectangles and the triangles of the data, on a dusk sky with hills, mist and a dark foreground, in the tones of a sepia photograph, with a
 * paper border, grain, a crease and a vignette. The picture is `cols * 100` by `rows * 100` units. With `piece`, only that cell shows,
 * as a torn piece: the print on a ragged edge with the white paper showing past it. The tones follow the lightness of the original colours,
 * so two pictures never look alike.
 */
export function PictureSvg({ picture, cols, rows, piece, label }: { picture: PictureData; cols: number; rows: number; piece?: number; label?: string }): ReactNode {
  const id = useId().replace(/:/g, "");
  const w = cols * CELL;
  const h = rows * CELL;
  const view = piece === undefined ? `0 0 ${w} ${h}` : `${(piece % cols) * CELL} ${Math.floor(piece / cols) * CELL} ${CELL} ${CELL}`;
  const u = Math.min(w, h);
  const seed = hash("scene", Math.round(parse(picture.top).h), Math.round(parse(picture.bottom).h), picture.shapes.length);
  const hills = useMemo(() => {
    const r = mulberry32(seed);
    const ridge = (base: number, amp: number): string => {
      const n = Math.max(6, Math.round(w / 40));
      let d = `M ${BORDER} ${h}`;
      for (let i = 0; i <= n; i++) d += ` L ${(BORDER + ((w - 2 * BORDER) * i) / n).toFixed(1)} ${(h * base + (r() * 2 - 1) * amp).toFixed(1)}`;
      return `${d} L ${w - BORDER} ${h} Z`;
    };
    return { far: ridge(0.63, u * 0.05), near: ridge(0.82, u * 0.045) };
  }, [seed, w, h, u]);
  const cell = piece === undefined ? null : { torn: tornCell(piece, cols, rows, 0), paper: tornCell(piece, cols, rows, FIBRE) };
  const creaseX = w * (0.25 + (seed % 40) / 100);

  const scene = (
    <g className="pz-print">
      <rect x={0} y={0} width={w} height={h} className="pz-print-paper" />
      <rect x={BORDER} y={BORDER} width={w - 2 * BORDER} height={h - 2 * BORDER} fill={`url(#${id}-sky)`} />
      <path d={hills.far} style={{ fill: tone(picture.top, 0.12) }} className="pz-print-hill" />
      {picture.shapes.map((s, i) => {
        const cx = BORDER + s.x * (w - 2 * BORDER);
        const cy = BORDER + s.y * (h - 2 * BORDER);
        const r = s.s * u;
        const fill = tone(s.c);
        const dark = tone(s.c, -0.28);
        const light = tone(s.c, 0.22);
        const place = { transform: `rotate(${s.a} ${cx} ${cy})` };
        if (s.t === "circle") {
          return (
            <g key={i} {...place}>
              <circle cx={cx} cy={cy} r={r * 2.1} fill={`url(#${id}-glow)`} />
              <circle cx={cx} cy={cy} r={r} style={{ fill: light }} className="pz-print-edge" />
              <circle cx={cx - r * 0.3} cy={cy - r * 0.2} r={r * 0.22} style={{ fill }} opacity={0.55} />
              <circle cx={cx + r * 0.35} cy={cy + r * 0.3} r={r * 0.14} style={{ fill }} opacity={0.5} />
            </g>
          );
        }
        if (s.t === "rect") {
          const bw = r * 2;
          const bh = r * 1.2;
          return (
            <g key={i} {...place}>
              <rect x={cx - r} y={cy - bh / 2} width={bw} height={bh} style={{ fill }} className="pz-print-edge" />
              <rect x={cx - r} y={cy - bh / 2} width={bw} height={bh * 0.16} style={{ fill: dark }} />
              {[0, 1].flatMap((row) => [0, 1].map((col) => (
                <rect key={`${row}${col}`} x={cx - r * 0.62 + col * r * 0.74} y={cy - bh * 0.18 + row * bh * 0.38} width={r * 0.5} height={bh * 0.24} style={{ fill: light }} opacity={0.85} />
              )))}
            </g>
          );
        }
        const tri = (k: number, up: number): ReactNode => <polygon key={k} points={`${cx},${cy - r * 1.1 - up} ${cx + r * (1 - k * 0.22)},${cy + r * 0.8 - up * 0.2 - k * r * 0.35} ${cx - r * (1 - k * 0.22)},${cy + r * 0.8 - up * 0.2 - k * r * 0.35}`} style={{ fill: k % 2 === 0 ? fill : dark }} className="pz-print-edge" />;
        return (
          <g key={i} {...place}>
            <rect x={cx - r * 0.1} y={cy + r * 0.7} width={r * 0.2} height={r * 0.35} style={{ fill: dark }} />
            {tri(0, 0)}
            {tri(1, r * 0.3)}
            <polygon points={`${cx},${cy - r * 1.1} ${cx - r},${cy + r * 0.8} ${cx},${cy + r * 0.8}`} style={{ fill: light }} opacity={0.35} />
          </g>
        );
      })}
      <rect x={BORDER} y={h * 0.5} width={w - 2 * BORDER} height={h * 0.2} fill={`url(#${id}-mist)`} />
      <path d={hills.near} style={{ fill: tone(picture.top, -0.2) }} />
      <rect x={BORDER} y={BORDER} width={w - 2 * BORDER} height={h - 2 * BORDER} fill={`url(#${id}-vignette)`} />
      <rect x={BORDER} y={BORDER} width={w - 2 * BORDER} height={h - 2 * BORDER} fill={`url(#${id}-grain)`} />
      <path d={`M ${creaseX} ${BORDER} L ${creaseX + w * 0.12} ${h - BORDER}`} className="pz-print-crease" />
      <rect x={BORDER} y={BORDER} width={w - 2 * BORDER} height={h - 2 * BORDER} className="pz-print-rim" />
    </g>
  );

  return (
    <svg viewBox={view} role="img" aria-label={label ?? (piece === undefined ? "A photo" : `Piece ${piece + 1} of the photo`)} preserveAspectRatio="xMidYMid slice" className={`pz-picture${cell ? " pz-picture-torn" : ""}`}>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: tone(picture.top) }} />
          <stop offset="1" style={{ stopColor: tone(picture.bottom, 0.1) }} />
        </linearGradient>
        <radialGradient id={`${id}-glow`}><stop offset="0" className="pz-print-glow" /><stop offset="1" className="pz-print-glow-end" /></radialGradient>
        <linearGradient id={`${id}-mist`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="pz-print-mist-end" /><stop offset="0.6" className="pz-print-mist" /><stop offset="1" className="pz-print-mist-end" /></linearGradient>
        <radialGradient id={`${id}-vignette`} cx="50%" cy="50%" r="75%"><stop offset="0.45" className="pz-print-vig-end" /><stop offset="1" className="pz-print-vig" /></radialGradient>
        <pattern id={`${id}-grain`} width={GRAIN_TILE} height={GRAIN_TILE} patternUnits="userSpaceOnUse">
          {GRAIN.map(([x, y, d], i) => <circle key={i} cx={x} cy={y} r={d ? 0.5 : 0.38} className={d ? "pz-grain-dark" : "pz-grain-light"} />)}
        </pattern>
        {cell ? <clipPath id={`${id}-clip`}><polygon points={cell.torn} /></clipPath> : null}
      </defs>
      {cell ? (
        <>
          <polygon points={cell.paper} className="pz-torn-paper" />
          <g clipPath={`url(#${id}-clip)`}>{scene}</g>
        </>
      ) : scene}
    </svg>
  );
}
