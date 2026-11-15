import { useId, type ReactNode } from "react";
import { Grad, ref } from "./patina";
import "./shelf.css";

/**
 * Twelve antique things on a shelf, each a shaded little object in its own material and, above all, its own silhouette, so no item is told
 * apart by colour alone: a candlestick, a skeleton key, a china cup, a book, a hand bell, an oil lamp, a top hat, a celadon vase, a hand
 * mirror, a jewel chest, a crescent moon and a star charm. Drawn on a 48 by 48 box, standing on the line at 44, lit from the top left. The
 * colours are the art-* tokens of the materials (art/patina.css), written once in design/tokens.json.
 */
type Draw = (id: string) => ReactNode;
const E = "pz-sg-edge";
const shadow = (rx = 14): ReactNode => <ellipse cx="24" cy="44.4" rx={rx} ry="2" className="pz-sg-shadow" />;

/** The points of a star with `n` tips. */
const star = (cx: number, cy: number, R: number, r: number, n = 5): string =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const k = i % 2 === 0 ? R : r;
    return `${(cx + k * Math.cos(a)).toFixed(1)},${(cy + k * Math.sin(a)).toFixed(1)}`;
  }).join(" ");

const GLYPHS: ReadonlyArray<readonly [name: string, draw: Draw]> = [
  ["candlestick", (id) => (
    <>
      <defs><Grad id={`${id}-b`} mat="brass" dir="x" /><Grad id={`${id}-w`} mat="ivory" dir="x" /><Grad id={`${id}-f`} mat="flame" dir="y" /></defs>
      {shadow(13)}
      <ellipse cx="24" cy="41.6" rx="13" ry="3" fill={ref(id, "b")} className={E} />
      <path d="M 20.5 41 C 21.5 35 22.5 31 22 27 H 26 C 25.5 31 26.5 35 27.5 41 Z" fill={ref(id, "b")} className={E} />
      <ellipse cx="24" cy="27" rx="6" ry="2" fill={ref(id, "b")} className={E} />
      <rect x="20.5" y="11" width="7" height="16" rx="1.2" fill={ref(id, "w")} className={E} />
      <ellipse cx="24" cy="11" rx="3.5" ry="1.2" className="pz-sg-pool" />
      <path d="M 24 11 V 8.4" className="pz-sg-wick" />
      <path d="M 24 2.5 C 25.8 5 27 6.6 27 8.6 C 27 10.2 25.7 11 24 11 C 22.3 11 21 10.2 21 8.6 C 21 6.6 22.2 5 24 2.5 Z" fill={ref(id, "f")} />
      <path d="M 22.4 13 V 26" className="pz-sg-shine" />
    </>
  )],
  ["key", (id) => (
    <>
      <defs><Grad id={`${id}-i`} mat="iron" dir="x" /><Grad id={`${id}-s`} mat="steel" dir="x" /></defs>
      {shadow(8)}
      <circle cx="24" cy="11" r="7.2" fill="none" stroke={ref(id, "i")} strokeWidth="3.8" />
      <circle cx="24" cy="11" r="9.1" className="pz-sg-line" /><circle cx="24" cy="11" r="5.3" className="pz-sg-line" />
      <rect x="22" y="18" width="4" height="23" rx="1.2" fill={ref(id, "i")} className={E} />
      <rect x="20.5" y="21.4" width="7" height="2.6" rx="1" fill={ref(id, "s")} className={E} />
      <path d="M 26 32 H 33 V 35.2 H 29.6 V 37.4 H 33 V 40.6 H 26 Z" fill={ref(id, "i")} className={E} />
      <rect x="22" y="39.2" width="4" height="2.4" rx="1.2" fill={ref(id, "i")} className={E} />
      <path d="M 23.2 24 V 38" className="pz-sg-shine" />
    </>
  )],
  ["cup", (id) => (
    <>
      <defs><Grad id={`${id}-w`} mat="ivory" dir="x" /><Grad id={`${id}-y`} mat="ivory" dir="y" /></defs>
      {shadow(15)}
      <ellipse cx="24" cy="41" rx="15" ry="3.2" fill={ref(id, "y")} className={E} />
      <ellipse cx="24" cy="40.4" rx="9.5" ry="1.7" className="pz-sg-dark" />
      <path d="M 36 22.5 C 44 21.5 44 33 34 32" fill="none" stroke={ref(id, "w")} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M 12 20 H 36 C 36 31 31 38.5 24 38.5 C 17 38.5 12 31 12 20 Z" fill={ref(id, "w")} className={E} />
      <path d="M 12.3 24.4 H 35.7 M 13.2 27.8 H 34.8" className="pz-sg-band" />
      <ellipse cx="24" cy="20" rx="12" ry="3" fill={ref(id, "y")} className={E} />
      <ellipse cx="24" cy="20.5" rx="10" ry="2.1" className="pz-sg-tea" />
      <path d="M 15 24 C 14.6 29 16.5 33.5 19.5 36" className="pz-sg-shine" />
    </>
  )],
  ["book", (id) => (
    <>
      <defs><Grad id={`${id}-l`} mat="leather" dir="d" /><Grad id={`${id}-p`} mat="paper" dir="x" /><Grad id={`${id}-b`} mat="brass" dir="d" /><Grad id={`${id}-r`} mat="red" dir="x" /></defs>
      {shadow(14)}
      <rect x="36" y="8.6" width="3.4" height="31" rx="0.8" fill={ref(id, "p")} className={E} />
      <path d="M 36.2 12 H 39.2 M 36.2 15.6 H 39.2 M 36.2 19.2 H 39.2 M 36.2 22.8 H 39.2 M 36.2 26.4 H 39.2 M 36.2 30 H 39.2 M 36.2 33.6 H 39.2" className="pz-sg-line" />
      <rect x="10" y="7" width="26" height="34" rx="1.8" fill={ref(id, "l")} className={E} />
      <rect x="10" y="7" width="5.6" height="34" rx="1.8" className="pz-sg-spine" />
      <path d="M 10.4 12 H 15.6 M 10.4 17 H 15.6 M 10.4 31 H 15.6 M 10.4 36 H 15.6" className="pz-sg-gilt" />
      <rect x="18.5" y="13" width="14" height="9.4" rx="1" fill={ref(id, "b")} className={E} />
      <path d="M 20.6 16.4 H 30.4 M 20.6 19.4 H 28" className="pz-sg-gilt-dark" />
      <path d="M 30 41 V 45.6 L 32 44.2 L 34 45.6 V 41 Z" fill={ref(id, "r")} className={E} />
    </>
  )],
  ["bell", (id) => (
    <>
      <defs><Grad id={`${id}-b`} mat="brass" dir="x" /><Grad id={`${id}-d`} mat="brass" dir="y" /><Grad id={`${id}-w`} mat="wood" dir="x" /></defs>
      {shadow(14)}
      <rect x="22" y="2.4" width="4" height="9.4" rx="2" fill={ref(id, "w")} className={E} />
      <path d="M 24 9 C 14 10 13 19 12 28 L 9 36 H 39 L 36 28 C 35 19 34 10 24 9 Z" fill={ref(id, "b")} className={E} />
      <rect x="20.6" y="9.6" width="6.8" height="2.4" rx="1" fill={ref(id, "d")} className={E} />
      <ellipse cx="24" cy="36" rx="15" ry="2.8" fill={ref(id, "d")} className={E} />
      <path d="M 12.4 24.8 Q 24 28.4 35.6 24.8" className="pz-sg-line" />
      <circle cx="24" cy="38.4" r="2.5" fill={ref(id, "b")} className={E} />
      <path d="M 17.4 14 C 15.8 19.5 15 24 14.2 30" className="pz-sg-shine" />
    </>
  )],
  ["lamp", (id) => (
    <>
      <defs><Grad id={`${id}-b`} mat="brass" dir="x" /><Grad id={`${id}-y`} mat="brass" dir="y" /><Grad id={`${id}-g`} mat="glass" dir="d" /><Grad id={`${id}-f`} mat="flame" dir="y" /></defs>
      {shadow(11)}
      <ellipse cx="24" cy="41.5" rx="10.5" ry="2.6" fill={ref(id, "y")} className={E} />
      <rect x="22.4" y="35" width="3.2" height="6.4" fill={ref(id, "b")} className={E} />
      <path d="M 33 28 C 40.5 27 40.5 36 33 35" fill="none" stroke={ref(id, "b")} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M 14.5 33 C 13 27.5 18 25 24 25 C 30 25 35 27.5 33.5 33 C 32 37.5 28 38 24 38 C 20 38 16 37.5 14.5 33 Z" fill={ref(id, "b")} className={E} />
      <rect x="20" y="22" width="8" height="3.6" rx="1" fill={ref(id, "y")} className={E} />
      <path d="M 19.5 22 C 17.5 18.5 18.5 14 20.5 10.5 C 21.5 8.5 26.5 8.5 27.5 10.5 C 29.5 14 30.5 18.5 28.5 22 Z" fill={ref(id, "g")} fillOpacity="0.72" className={E} />
      <path d="M 24 12.6 C 25.4 15 26.3 16.6 26.3 18.2 C 26.3 19.8 25.3 20.6 24 20.6 C 22.7 20.6 21.7 19.8 21.7 18.2 C 21.7 16.6 22.6 15 24 12.6 Z" fill={ref(id, "f")} />
      <path d="M 21.4 12.4 C 20.2 15 20 18 20.8 20.4" className="pz-sg-shine" />
    </>
  )],
  ["hat", (id) => (
    <>
      <defs><Grad id={`${id}-x`} mat="iron" dir="x" /><Grad id={`${id}-d`} mat="iron" dir="d" /><Grad id={`${id}-v`} mat="violet" dir="x" /></defs>
      {shadow(18)}
      <ellipse cx="24" cy="36" rx="18" ry="5" fill={ref(id, "d")} className={E} />
      <path d="M 14.5 36 L 15.2 12.5 C 15.2 9.5 32.8 9.5 32.8 12.5 L 33.5 36 C 33.5 39.4 14.5 39.4 14.5 36 Z" fill={ref(id, "x")} className={E} />
      <ellipse cx="24" cy="12.5" rx="8.8" ry="2.6" fill={ref(id, "d")} className={E} />
      <path d="M 14.7 30 C 20 32.4 28 32.4 33.3 30 L 33.4 34.4 C 28 36.8 20 36.8 14.6 34.4 Z" fill={ref(id, "v")} className={E} />
      <rect x="22" y="30.6" width="4.8" height="4.6" rx="0.8" className="pz-sg-buckle" />
      <path d="M 17.6 15 L 18 29" className="pz-sg-shine" />
    </>
  )],
  ["vase", (id) => (
    <>
      <defs><Grad id={`${id}-c`} mat="cyan" dir="x" /><Grad id={`${id}-y`} mat="cyan" dir="y" /></defs>
      {shadow(10)}
      <path d="M 20 14 C 12.4 12.6 11.4 19 15.6 21.4 M 28 14 C 35.6 12.6 36.6 19 32.4 21.4" fill="none" stroke={ref(id, "c")} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M 19 9 H 29 L 28.2 15 C 37.5 19.5 37 33 31.5 39.5 C 30.5 40.8 28 41.4 24 41.4 C 20 41.4 17.5 40.8 16.5 39.5 C 11 33 10.5 19.5 19.8 15 Z" fill={ref(id, "c")} className={E} />
      <ellipse cx="24" cy="9" rx="5.8" ry="1.7" fill={ref(id, "y")} className={E} />
      <ellipse cx="24" cy="9.2" rx="4" ry="1" className="pz-sg-dark" />
      <ellipse cx="24" cy="41.7" rx="8" ry="2" fill={ref(id, "y")} className={E} />
      <path d="M 12.6 27 Q 24 30.4 35.4 27 M 13.2 31.6 Q 24 34.8 34.8 31.6" className="pz-sg-line" />
      <path d="M 16.6 22 C 15 27.5 15.4 32 17.6 36" className="pz-sg-shine" />
    </>
  )],
  ["mirror", (id) => (
    <>
      <defs><Grad id={`${id}-b`} mat="brass" dir="x" /><Grad id={`${id}-d`} mat="brass" dir="d" /><Grad id={`${id}-g`} mat="glass" dir="d" /></defs>
      {shadow(7)}
      <path d="M 22 30 H 26 L 25.2 42 C 25 43.2 23 43.2 22.8 42 Z" fill={ref(id, "b")} className={E} />
      <rect x="21" y="29.4" width="6" height="3" rx="1" fill={ref(id, "d")} className={E} />
      <ellipse cx="24" cy="17.5" rx="13" ry="14.5" fill={ref(id, "d")} className={E} />
      <ellipse cx="24" cy="17.5" rx="10.4" ry="12" fill={ref(id, "g")} className={E} />
      <path d="M 17.6 11.6 C 16 14.8 16 18.4 17.2 21.4 M 20.6 8.6 L 23.4 8" className="pz-sg-shine" />
    </>
  )],
  ["box", (id) => (
    <>
      <defs><Grad id={`${id}-w`} mat="wood" dir="y" /><Grad id={`${id}-l`} mat="wood" dir="d" /><Grad id={`${id}-b`} mat="brass" dir="x" /></defs>
      {shadow(17)}
      <rect x="7" y="23" width="34" height="18.5" rx="2" fill={ref(id, "w")} className={E} />
      <path d="M 7 24 C 7 11 41 11 41 24 Z" fill={ref(id, "l")} className={E} />
      <path d="M 11.6 16.4 V 41.4 M 36.4 16.4 V 41.4" className="pz-sg-strap" />
      <rect x="6.6" y="22" width="34.8" height="3.2" rx="1" fill={ref(id, "b")} className={E} />
      <rect x="21" y="24" width="6" height="7.6" rx="1.2" fill={ref(id, "b")} className={E} />
      <circle cx="24" cy="27.2" r="1.1" className="pz-sg-dark" /><path d="M 24 27.2 V 29.8" className="pz-sg-wick" />
      <rect x="9" y="41" width="4" height="2.2" rx="0.6" fill={ref(id, "b")} /><rect x="35" y="41" width="4" height="2.2" rx="0.6" fill={ref(id, "b")} />
      <path d="M 13 17 C 17 13.6 25 12.6 31 14" className="pz-sg-shine" />
    </>
  )],
  ["moon", (id) => (
    <>
      <defs><Grad id={`${id}-i`} mat="ivory" dir="d" /><Grad id={`${id}-w`} mat="wood" dir="y" /></defs>
      {shadow(9)}
      <path d="M 29 6.7 A 16.8 16.8 0 1 0 38 29 A 13.4 13.4 0 1 1 29 6.7 Z" fill={ref(id, "i")} className={E} />
      <rect x="17" y="38.4" width="14" height="4.2" rx="1" fill={ref(id, "w")} className={E} />
      <path d="M 13.4 14.2 C 11.4 19.4 12 25.4 15.6 29.6" className="pz-sg-shine" />
    </>
  )],
  ["star", (id) => (
    <>
      <defs><Grad id={`${id}-b`} mat="brass" dir="d" /><Grad id={`${id}-h`} mat="brass" dir="y" /></defs>
      {shadow(8)}
      <rect x="22.6" y="24" width="2.8" height="14" fill={ref(id, "b")} className={E} />
      <path d="M 21.6 37 H 26.4 L 29.4 42.6 H 18.6 Z" fill={ref(id, "b")} className={E} />
      <polygon points={star(24, 20, 18, 7.4)} fill={ref(id, "b")} className={E} />
      <polygon points={star(24, 20, 10.6, 4.4)} fill={ref(id, "h")} className="pz-sg-line" />
      <path d={`M 24 20 L 24 2 M 24 20 L 41.1 14.4 M 24 20 L 34.6 34.6 M 24 20 L 13.4 34.6 M 24 20 L 6.9 14.4`} className="pz-sg-line" />
    </>
  )],
];
export const SHELF_ITEM_COUNT = GLYPHS.length;
export const shelfItemName = (id: number): string => (id < 0 ? "empty spot" : (GLYPHS[id]?.[0] ?? "thing"));

/** One shelf item (nothing for an empty spot, -1). It fills its spot unless a `size` is given. */
export function ShelfGlyph({ id, size }: { id: number; size?: number }): ReactNode {
  const uid = useId().replace(/:/g, "");
  const g = id >= 0 ? GLYPHS[id] : undefined;
  if (!g) return null;
  return (
    <svg viewBox="0 0 48 48" className="pz-shelf-glyph" {...(size === undefined ? {} : { width: size, height: size })} role="img" aria-label={g[0]}>{g[1](uid)}</svg>
  );
}

/** A shelf of items in a grid; the Sight shows it still, the Lock lets the Player pick spots. */
export function Shelf({ items, cols, selected, onPick }: { items: readonly number[]; cols: number; selected?: ReadonlySet<number>; onPick?: (slot: number) => void }): ReactNode {
  return (
    <div className="pz-shelf" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {items.map((id, i) => {
        const label = `Spot ${i + 1}: ${shelfItemName(id)}`;
        const cls = `pz-slot${id < 0 ? " pz-slot-empty" : ""}`;
        return onPick ? (
          <button key={i} type="button" className={cls} aria-label={label} aria-pressed={selected?.has(i) ?? false} onClick={() => onPick(i)}>
            <ShelfGlyph id={id} />
          </button>
        ) : (
          <div key={i} className={cls} role="img" aria-label={label}><ShelfGlyph id={id} /></div>
        );
      })}
    </div>
  );
}
