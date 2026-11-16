import type { CSSProperties, ReactNode } from "react";
import { color as tokenColor } from "@hauntology/shared/design/tokens";
import "./wires.css";

export type WireShapeName = "circle" | "square" | "triangle" | "diamond" | "cross" | "hex";
export type WireLook = Readonly<{ name: string; color: string; dash: string; shape: WireShapeName; /** The printing on the insulation: light on a dark wire, dark on a pale one. */ mark: "light" | "dark" }>;

/**
 * Six wire looks. A wire is never told apart by colour alone: each has its own printed stripe pattern (a dash pattern along
 * the insulation) and its own symbol on the tag at its end. The colours keep 3:1 or better against the dark ground. They are
 * the game's own content (a wire is a coloured thing): the `art-*` tokens of design/tokens.json, not the interface palette.
 */
export const WIRE_LOOKS: readonly WireLook[] = [
  { name: "red circle", color: tokenColor["art-red"], dash: "", shape: "circle", mark: "light" },
  { name: "blue square", color: tokenColor["art-blue"], dash: "10 6", shape: "square", mark: "light" },
  { name: "green triangle", color: tokenColor["art-green"], dash: "2 7", shape: "triangle", mark: "dark" },
  { name: "yellow diamond", color: tokenColor["art-yellow"], dash: "14 5 3 5", shape: "diamond", mark: "dark" },
  { name: "violet cross", color: tokenColor["art-violet"], dash: "26 6", shape: "cross", mark: "light" },
  { name: "white hexagon", color: tokenColor["art-white"], dash: "4 4", shape: "hex", mark: "dark" },
];
export const wireLook = (id: number): WireLook => WIRE_LOOKS[((id % WIRE_LOOKS.length) + WIRE_LOOKS.length) % WIRE_LOOKS.length] as WireLook;

const pts = (cx: number, cy: number, r: number, points: ReadonlyArray<readonly [number, number]>): string =>
  points.map(([x, y]) => `${(cx + x * r).toFixed(1)},${(cy + y * r).toFixed(1)}`).join(" ");

/** The symbol of a wire: on the label of its tag. */
export function WireShape({ shape, cx, cy, r, fill, className }: { shape: WireShapeName; cx: number; cy: number; r: number; fill?: string; className?: string }): ReactNode {
  const p = { fill, className };
  switch (shape) {
    case "square": return <rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} rx={2} {...p} />;
    case "triangle": return <polygon points={pts(cx, cy, r, [[0, -1.1], [1, 0.8], [-1, 0.8]])} {...p} />;
    case "diamond": return <polygon points={pts(cx, cy, r, [[0, -1.2], [1, 0], [0, 1.2], [-1, 0]])} {...p} />;
    case "cross": return <polygon points={pts(cx, cy, r, [[-0.35, -1], [0.35, -1], [0.35, -0.35], [1, -0.35], [1, 0.35], [0.35, 0.35], [0.35, 1], [-0.35, 1], [-0.35, 0.35], [-1, 0.35], [-1, -0.35], [-0.35, -0.35]])} {...p} />;
    case "hex": return <polygon points={pts(cx, cy, r, [[1, 0], [0.5, 0.87], [-0.5, 0.87], [-1, 0], [-0.5, -0.87], [0.5, -0.87]])} {...p} />;
    default: return <circle cx={cx} cy={cy} r={r} {...p} />;
  }
}

const wireVar = (look: WireLook): CSSProperties => ({ "--wire": look.color } as CSSProperties);

/** The gradients of the metals and of the terminal block. Each svg that draws a terminal brings its own, under its own id. */
export function WireDefs({ id }: { id: string }): ReactNode {
  return (
    <defs>
      <radialGradient id={`${id}-brass`} cx="36%" cy="30%" r="80%"><stop offset="0" className="pz-st-brass-hi" /><stop offset="0.55" className="pz-st-brass" /><stop offset="1" className="pz-st-brass-lo" /></radialGradient>
      <linearGradient id={`${id}-copper`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="pz-st-copper-hi" /><stop offset="0.5" className="pz-st-copper" /><stop offset="1" className="pz-st-copper-lo" /></linearGradient>
      <linearGradient id={`${id}-steel`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="pz-st-steel-hi" /><stop offset="0.5" className="pz-st-steel" /><stop offset="1" className="pz-st-steel-lo" /></linearGradient>
      <linearGradient id={`${id}-block`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" className="pz-st-block-lo" /><stop offset="0.35" className="pz-st-block-hi" /><stop offset="1" className="pz-st-block-lo" /></linearGradient>
    </defs>
  );
}

/** Insulated cable along a path: a shadow, the dark edge of the jacket, the colour, a highlight and, on most wires, the printed stripe. */
export function Cable({ look, d, ghost = false }: { look: WireLook; d: string; ghost?: boolean }): ReactNode {
  return (
    <g className="pz-cable" style={wireVar(look)}>
      <path d={d} className="pz-cable-shadow" />
      <path d={d} className="pz-cable-jacket" />
      <path d={d} className={ghost ? "pz-cable-body pz-wire-ghost" : "pz-cable-body"} />
      <path d={d} className="pz-cable-shine" />
      {look.dash !== "" || ghost ? <path d={d} className={`pz-cable-mark pz-cable-mark-${look.mark}`} strokeDasharray={look.dash || undefined} /> : null}
    </g>
  );
}

/** The cut end of a wire: a short bare copper core and a fan of strands. `angle` is the way the wire points, degrees. */
export function CopperTip({ x, y, angle, id }: { x: number; y: number; angle: number; id: string }): ReactNode {
  return (
    <g className="pz-tip" transform={`translate(${x} ${y}) rotate(${angle})`}>
      <rect x={-3} y={-5.5} width={7} height={11} rx={2} className="pz-tip-cut" />
      <rect x={3} y={-3.6} width={13} height={7.2} rx={1.5} fill={`url(#${id}-copper)`} className="pz-tip-core" />
      <path d="M 16 -2.4 L 24 -5 M 16 0 L 25 0 M 16 2.4 L 24 5" className="pz-tip-strands" />
    </g>
  );
}

/** A ring lug crimped on the end of a wire that arrives from the left; the ring goes round the screw, which sits on top of it. */
export function Lug({ x, y, id }: { x: number; y: number; id: string }): ReactNode {
  return (
    <g className="pz-lug" transform={`translate(${x} ${y})`}>
      <rect x={-31} y={-6.8} width={21} height={13.6} rx={3} fill={`url(#${id}-steel)`} className="pz-lug-barrel" />
      <path d="M -26 -6.8 V 6.8 M -21 -6.8 V 6.8" className="pz-lug-crimp" />
      <circle r={15} fill={`url(#${id}-copper)`} className="pz-lug-ring" />
      <circle r={8.5} className="pz-lug-hole" />
    </g>
  );
}

/** A brass terminal screw with a slotted head. `turn` is the angle of the slot: a tightened screw has turned a quarter. */
export function Screw({ cx, cy, id, turn }: { cx: number; cy: number; id: string; turn: number }): ReactNode {
  return (
    <g className="pz-screw">
      <circle cx={cx} cy={cy} r={10.5} className="pz-screw-well" />
      <circle cx={cx} cy={cy} r={9} fill={`url(#${id}-brass)`} className="pz-screw-head" />
      <rect x={cx - 6.5} y={cy - 1.3} width={13} height={2.6} rx={1} className="pz-screw-slot" style={{ transform: `rotate(${turn}deg)` }} />
    </g>
  );
}

/** The heat-shrink tag at the start of a wire: a sleeve in the wire's colour with a label carrying its symbol. */
export function Tag({ look, cx, cy, s = 1 }: { look: WireLook; cx: number; cy: number; s?: number }): ReactNode {
  return (
    <g className="pz-tag" style={wireVar(look)} transform={`translate(${cx} ${cy}) scale(${s})`}>
      <rect x={-24} y={-15} width={48} height={30} rx={9} className="pz-tag-sleeve" />
      <path d="M -17 -10 H 17" className="pz-tag-shine" />
      <circle r={11.5} className="pz-tag-label" />
      <WireShape shape={look.shape} cx={0} cy={0} r={6.8} className="pz-tag-glyph" />
    </g>
  );
}

/** The porcelain terminal block: one body, a ridge between the terminals and two fixing screws. */
export function Block({ x, y, w, h, id, dividers }: { x: number; y: number; w: number; h: number; id: string; dividers: readonly number[] }): ReactNode {
  return (
    <g className="pz-block">
      <rect x={x} y={y} width={w} height={h} rx={9} fill={`url(#${id}-block)`} className="pz-block-body" />
      {dividers.map((dy) => <path key={dy} d={`M ${x + 5} ${dy} H ${x + w - 5}`} className="pz-block-ridge" />)}
      <circle cx={x + w / 2} cy={y + 8} r={3.2} fill={`url(#${id}-steel)`} className="pz-block-fix" />
      <circle cx={x + w / 2} cy={y + h - 8} r={3.2} fill={`url(#${id}-steel)`} className="pz-block-fix" />
    </g>
  );
}

/** Where a cut wire's cable leaves its clamp: a steel plate with the cable going through a rubber grommet. */
export function Clamp({ x, y, h, rows, id }: { x: number; y: number; h: number; rows: readonly number[]; id: string }): ReactNode {
  return (
    <g className="pz-clamp">
      <rect x={x} y={y} width={16} height={h} rx={4} fill={`url(#${id}-steel)`} className="pz-clamp-plate" />
      {rows.map((ry) => <circle key={ry} cx={x + 8} cy={ry} r={7.5} className="pz-grommet" />)}
    </g>
  );
}

/** The fuse box of the Sight: the terminal block with every wire already on its terminal, top to bottom, each numbered. */
export function FuseBox({ order }: { order: readonly number[] }): ReactNode {
  const h = order.length * 44 + 24;
  const id = `fb${order.join("")}`;
  const ys = order.map((_, i) => 34 + i * 44);
  return (
    <svg viewBox={`0 0 240 ${h}`} width="100%" role="img" aria-label={`Fuse box, top to bottom: ${order.map((w) => wireLook(w).name).join(", ")}`}>
      <WireDefs id={id} />
      <Clamp x={0} y={4} h={h - 8} rows={ys} id={id} />
      <Block x={170} y={4} w={68} h={h - 8} id={id} dividers={ys.slice(0, -1).map((y) => y + 22)} />
      {order.map((w, i) => {
        const y = ys[i] ?? 0;
        const look = wireLook(w);
        return (
          <g key={`${w}-${i}`}>
            <Cable look={look} d={`M 8 ${y} L 164 ${y}`} />
            <Lug x={198} y={y} id={id} />
            <Screw cx={198} cy={y} id={id} turn={45} />
            <text x={226} y={y + 6} className="pz-block-num">{i + 1}</text>
            <Tag look={look} cx={46} cy={y} s={0.85} />
          </g>
        );
      })}
    </svg>
  );
}
