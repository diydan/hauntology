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

/** "#rrggbb" and an alpha as a colour a canvas gradient or fill can take. */
export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
