import type { ReactNode } from "react";
import { color as tokenColor } from "@hauntology/shared/design/tokens";

export type WireShapeName = "circle" | "square" | "triangle" | "diamond" | "cross" | "hex";
export type WireLook = Readonly<{ name: string; color: string; dash: string; shape: WireShapeName }>;

/**
 * Six wire looks. A wire is never told apart by colour alone: each has its own dash pattern and end shape too.
 * The colours keep 3:1 or better against the dark ground. They are the game's own content (a wire is a coloured thing): the
 * `art-*` tokens of design/tokens.json, not the interface palette.
 */
export const WIRE_LOOKS: readonly WireLook[] = [
  { name: "red circle", color: tokenColor["art-red"], dash: "", shape: "circle" },
  { name: "blue square", color: tokenColor["art-blue"], dash: "10 6", shape: "square" },
  { name: "green triangle", color: tokenColor["art-green"], dash: "2 7", shape: "triangle" },
  { name: "yellow diamond", color: tokenColor["art-yellow"], dash: "14 5 3 5", shape: "diamond" },
  { name: "violet cross", color: tokenColor["art-violet"], dash: "26 6", shape: "cross" },
  { name: "white hexagon", color: tokenColor["art-white"], dash: "4 4", shape: "hex" },
];
export const wireLook = (id: number): WireLook => WIRE_LOOKS[((id % WIRE_LOOKS.length) + WIRE_LOOKS.length) % WIRE_LOOKS.length] as WireLook;

const pts = (cx: number, cy: number, r: number, points: ReadonlyArray<readonly [number, number]>): string =>
  points.map(([x, y]) => `${(cx + x * r).toFixed(1)},${(cy + y * r).toFixed(1)}`).join(" ");

/** The end shape of a wire. */
export function WireShape({ shape, cx, cy, r, fill }: { shape: WireShapeName; cx: number; cy: number; r: number; fill: string }): ReactNode {
  switch (shape) {
    case "square": return <rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} rx={3} fill={fill} />;
    case "triangle": return <polygon points={pts(cx, cy, r, [[0, -1.1], [1, 0.8], [-1, 0.8]])} fill={fill} />;
    case "diamond": return <polygon points={pts(cx, cy, r, [[0, -1.2], [1, 0], [0, 1.2], [-1, 0]])} fill={fill} />;
    case "cross": return <polygon points={pts(cx, cy, r, [[-0.35, -1], [0.35, -1], [0.35, -0.35], [1, -0.35], [1, 0.35], [0.35, 0.35], [0.35, 1], [-0.35, 1], [-0.35, 0.35], [-1, 0.35], [-1, -0.35], [-0.35, -0.35]])} fill={fill} />;
    case "hex": return <polygon points={pts(cx, cy, r, [[1, 0], [0.5, 0.87], [-0.5, 0.87], [-1, 0], [-0.5, -0.87], [0.5, -0.87]])} fill={fill} />;
    default: return <circle cx={cx} cy={cy} r={r} fill={fill} />;
  }
}

/** The fuse box of the Sight: wires in order, top to bottom, each numbered. */
export function FuseBox({ order }: { order: readonly number[] }): ReactNode {
  return (
    <svg viewBox={`0 0 240 ${order.length * 44 + 8}`} width="100%" role="img" aria-label={`Fuse box, top to bottom: ${order.map((w) => wireLook(w).name).join(", ")}`}>
      {order.map((w, i) => {
        const y = 26 + i * 44;
        const look = wireLook(w);
        return (
          <g key={`${w}-${i}`}>
            <text x={14} y={y + 6} className="pz-muted-text" fontSize={18}>{i + 1}</text>
            <line x1={40} y1={y} x2={200} y2={y} stroke={look.color} strokeWidth={7} strokeDasharray={look.dash} strokeLinecap="round" />
            <WireShape shape={look.shape} cx={218} cy={y} r={10} fill={look.color} />
          </g>
        );
      })}
    </svg>
  );
}
