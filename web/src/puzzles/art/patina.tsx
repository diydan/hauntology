import type { ReactNode } from "react";
import "./patina.css";

/** The materials the art is made of (a token each in design/tokens.json: art-brass, art-steel, ...). */
export type Material = "brass" | "steel" | "copper" | "wood" | "ivory" | "paper" | "flame" | "glass" | "iron" | "stone" | "leather" | "sepia" | "blue" | "violet" | "red" | "green" | "cyan";

/**
 * A gradient in a material: a highlight, the colour and a shade. `x` goes across (a cylinder lit from the left), `y` goes down (a top that
 * catches the light), `d` goes along the diagonal (a flat face lit from the top left).
 */
export function Grad({ id, mat, dir = "x" }: { id: string; mat: Material; dir?: "x" | "y" | "d" }): ReactNode {
  const [x2, y2] = dir === "x" ? [1, 0] : dir === "y" ? [0, 1] : [1, 1];
  return (
    <linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
      <stop offset="0" className={`pz-pt-${mat}-hi`} />
      <stop offset="0.45" className={`pz-pt-${mat}`} />
      <stop offset="1" className={`pz-pt-${mat}-lo`} />
    </linearGradient>
  );
}

/** A `url(#...)` for a gradient of this svg. */
export const ref = (id: string, name: string): string => `url(#${id}-${name})`;
