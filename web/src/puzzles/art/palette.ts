import { color, role } from "@hauntology/shared/design/tokens";

/**
 * The colours the canvas screens (spirit board, marble maze, hidden words) draw with. A canvas cannot read a CSS variable, so they
 * come from the generated design tokens (design/tokens.json): the same palette as the rest of the game, never a hex written here.
 */
export const CANVAS = {
  /** The board's warm dark, and the dark of the maze and the wall. */
  board: color.ember,
  well: color["ink-deep"],
  /** A maze wall. */
  wall: color.leather,
  /** Letters, and a picked letter's number. */
  text: role.text,
  /** The lit letter. */
  lit: role["accent-hi"],
  /** The green of the goal ring, the dwell ring and a picked letter (the screens' own words say "green ring"). */
  ring: role["accent-rare"],
  /** The planchette and the marble. */
  piece: role.text,
} as const;

/** The materials the canvas objects are made of: the art-* tokens of design/tokens.json, plus the dark and the light they are shaded with. */
export const MATERIAL = {
  wood: color["art-wood"],
  ivory: color["art-ivory"],
  paper: color["art-paper"],
  flame: color["art-flame"],
  glass: color["art-glass"],
  iron: color["art-iron"],
  stone: color["art-stone"],
  leather: color["art-leather"],
  sepia: color["art-sepia"],
  brass: color["art-brass"],
  copper: color["art-copper"],
  steel: color["art-steel"],
  /** What a shadow is made of, and what a highlight is made of. */
  dark: color.void,
  light: role.text,
} as const;

const channels = (hex: string): readonly [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const two = (v: number): string => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");

/** "#rrggbb" and an alpha as a colour a canvas gradient or fill can take. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** A colour part of the way from `a` to `b` (0 is `a`, 1 is `b`), as "#rrggbb". */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return `#${two(ar + (br - ar) * t)}${two(ag + (bg - ag) * t)}${two(ab + (bb - ab) * t)}`;
}
/** Darker: `t` of the way to the shadow colour. */
export const shade = (hex: string, t: number): string => mix(hex, MATERIAL.dark, t);
/** Lighter: `t` of the way to the highlight colour. */
export const tint = (hex: string, t: number): string => mix(hex, MATERIAL.light, t);
