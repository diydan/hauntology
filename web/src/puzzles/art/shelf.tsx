import type { ReactNode } from "react";
import { color as tokenColor } from "@hauntology/shared/design/tokens";

/**
 * Twelve original little glyphs on a 40 by 40 box. Shape and colour both differ, so no item is told apart by colour alone.
 * The twelve hues are the game's own content (they tell things apart, they are not interface chrome): the `art-*` tokens of
 * design/tokens.json, so they are written once, there.
 */
const GLYPHS: ReadonlyArray<readonly [name: string, color: string, draw: (c: string) => ReactNode]> = [
  ["candlestick", tokenColor["art-yellow"], (c) => (<><rect x="15" y="18" width="10" height="16" fill={c} /><rect x="9" y="32" width="22" height="4" fill={c} /><ellipse cx="20" cy="11" rx="3.5" ry="6" fill={c} /></>)],
  ["key", tokenColor["art-silver"], (c) => (<><circle cx="13" cy="14" r="7" fill="none" stroke={c} strokeWidth="4" /><rect x="18" y="12" width="16" height="4" fill={c} /><rect x="28" y="16" width="4" height="6" fill={c} /><rect x="22" y="16" width="3" height="5" fill={c} /></>)],
  ["cup", tokenColor["art-blue"], (c) => (<><path d="M8 12 H30 L27 32 H11 Z" fill={c} /><path d="M30 15 H35 Q36 24 29 24" fill="none" stroke={c} strokeWidth="3" /></>)],
  ["book", tokenColor["art-pink"], (c) => (<><rect x="8" y="7" width="24" height="28" rx="2" fill={c} /><line x1="14" y1="7" x2="14" y2="35" stroke={tokenColor.ink} strokeWidth="2" /></>)],
  ["bell", tokenColor["art-gold"], (c) => (<><path d="M20 6 C12 8 11 16 10 24 L8 30 H32 L30 24 C29 16 28 8 20 6 Z" fill={c} /><circle cx="20" cy="34" r="3" fill={c} /></>)],
  ["lamp", tokenColor["art-green"], (c) => (<><polygon points="10,18 30,18 25,6 15,6" fill={c} /><rect x="18.5" y="18" width="3" height="14" fill={c} /><rect x="12" y="32" width="16" height="4" fill={c} /></>)],
  ["hat", tokenColor["art-violet"], (c) => (<><ellipse cx="20" cy="28" rx="16" ry="5" fill={c} /><rect x="11" y="10" width="18" height="18" rx="3" fill={c} /></>)],
  ["vase", tokenColor["art-cyan"], (c) => <path d="M15 6 H25 L24 14 C32 18 31 32 26 35 H14 C9 32 8 18 16 14 Z" fill={c} />],
  ["mirror", tokenColor["art-lavender"], (c) => (<><ellipse cx="20" cy="15" rx="11" ry="13" fill="none" stroke={c} strokeWidth="4" /><rect x="18" y="28" width="4" height="8" fill={c} /></>)],
  ["box", tokenColor["art-orange"], (c) => (<><rect x="7" y="15" width="26" height="18" rx="2" fill={c} /><rect x="5" y="9" width="30" height="7" rx="2" fill={c} /><rect x="18" y="20" width="4" height="5" fill={tokenColor.ink} /></>)],
  ["moon", tokenColor["art-cream"], (c) => <path d="M26 6 A15 15 0 1 0 34 26 A12 12 0 1 1 26 6 Z" fill={c} />],
  ["star", tokenColor["art-sun"], (c) => <polygon points="20,4 24.5,15 36,15.5 27,23 30,35 20,28 10,35 13,23 4,15.5 15.5,15" fill={c} />],
];
export const SHELF_ITEM_COUNT = GLYPHS.length;
export const shelfItemName = (id: number): string => (id < 0 ? "empty spot" : (GLYPHS[id]?.[0] ?? "thing"));

/** One shelf item (or an empty spot for -1). */
export function ShelfGlyph({ id, size = 56 }: { id: number; size?: number }): ReactNode {
  const g = id >= 0 ? GLYPHS[id] : undefined;
  if (!g) return null;
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} role="img" aria-label={g[0]}>{g[2](g[1])}</svg>
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
