import { useId, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { Block, Cable, Clamp, CopperTip, Lug, Screw, Tag, WireDefs, wireLook } from "../art/wires";
import { useLatest } from "../hooks";
import type { KindProps } from "./types";
import "./Wires.css";

const W = 340;
const LEFT_X = 50;
const RIGHT_X = 290;
const HANDLE_R = 31; // 62 units: the frame leaves about 270 px for the 340-unit board at 320 px wide (0.79), so this is 48 px or more
/** Two neighbouring touch targets are this far apart centre to centre: (72.5 - 62) units is 8 px or more at 0.79 and above, with 4, 5 or 6 wires. */
const PITCH = 72.5;
const CABLE_FROM = 8; // the cable comes out of its clamp at the left edge and runs straight under its tag
const LUG_BACK = 26; // the cable ends where the lug's barrel starts, 26 units before the screw
const SNAP_RADIUS = 44;
const TAP_SLOP = 10;
type Conn = Readonly<Record<number, number>>;

/**
 * Cut wires: join each cut end to the terminal that matches its place in the fuse box seen earlier. Drag a wire end to a
 * terminal, or tap a wire and then tap a terminal. Drag a wire away from every terminal to unplug it.
 * A wire is never told apart by colour alone: each has its own printed stripe and its own symbol on its tag.
 * It is drawn as the thing it is: insulated cable out of a clamp, a heat-shrink tag, a ring lug under a brass screw on a
 * porcelain terminal block. The drawing is all in ../art/wires.tsx; this file is what the finger does.
 */
export default function Wires({ view, feel, submit, announce }: KindProps<"wires">) {
  const n = view.n;
  const H = 100 + (n - 1) * PITCH;
  const ys = (i: number): number => 50 + i * PITCH;
  const [conn, setConn] = useState<Conn>({});
  const [picked, setPicked] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const board = useRef<SVGSVGElement>(null);
  const ghost = useRef<SVGGElement>(null);
  const defs = useId().replace(/:/g, "");
  const down = useRef<{ wire: number; x: number; y: number; moved: boolean } | null>(null);
  const latest = useLatest({ conn, picked });

  const commit = (next: Conn): void => { latest.current.conn = next; setConn(next); };
  const pick = (w: number | null): void => { latest.current.picked = w; setPicked(w); };
  const termOf = (w: number): number | undefined => latest.current.conn[w];
  const holder = (t: number): number | undefined => view.leftOrder.find((w) => latest.current.conn[w] === t);
  const rowOf = (w: number): number => view.leftOrder.indexOf(w);

  /** Plug wire `w` into terminal `t`; the terminal's old wire and the wire's old terminal are freed. */
  const plug = (w: number, t: number): void => {
    const next: Record<number, number> = {};
    for (const [k, v] of Object.entries(latest.current.conn)) if (v !== t) next[Number(k)] = v;
    next[w] = t;
    commit(next);
    feel.haptics.buzz("snap");
    feel.synth.play("snap");
    announce(`${wireLook(w).name} joined to terminal ${t + 1}`);
  };
  const unplug = (w: number): void => {
    if (termOf(w) === undefined) return;
    const next: Record<number, number> = {};
    for (const [k, v] of Object.entries(latest.current.conn)) if (Number(k) !== w) next[Number(k)] = v;
    commit(next);
    announce(`${wireLook(w).name} unplugged`);
  };
  const choose = (w: number): void => {
    const was = latest.current.picked;
    pick(was === w ? null : w);
    if (was !== w) { feel.haptics.buzz("tick"); feel.synth.play("tick"); }
  };
  const plugPicked = (t: number): void => {
    const w = latest.current.picked;
    if (w === null) return;
    pick(null);
    plug(w, t);
  };

  const local = (e: PointerEvent): { x: number; y: number } => {
    const box = board.current?.getBoundingClientRect();
    const k = box && box.width > 0 ? W / box.width : 1;
    return { x: (e.clientX - (box?.left ?? 0)) * k, y: (e.clientY - (box?.top ?? 0)) * k };
  };
  /** A cable from its clamp, straight under its tag, then a slack curve (it sags a little, it is a cable) to the point (x2, y2). */
  const path = (y1: number, x2: number, y2: number): string => {
    const run = (x2 - (LEFT_X + 8)) * 0.45;
    return `M ${CABLE_FROM} ${y1} L ${LEFT_X + 8} ${y1} C ${LEFT_X + 8 + run} ${y1 + 18}, ${x2 - run} ${y2 + 18}, ${x2} ${y2}`;
  };
  /** A cut wire that is not on a terminal hangs from its tag with its bare copper end showing. */
  const stub = (y: number): string => `M ${CABLE_FROM} ${y} L ${LEFT_X + 8} ${y} C ${LEFT_X + 46} ${y + 4}, ${LEFT_X + 76} ${y + 20}, ${LEFT_X + 96} ${y + 24}`;
  const showGhost = (w: number | null, x = 0, y = 0): void => {
    const el = ghost.current;
    if (!el) return;
    const tip = el.querySelector(".pz-tip");
    if (w === null) { el.querySelectorAll("path.pz-cable-shadow, path.pz-cable-jacket, path.pz-cable-body, path.pz-cable-shine, path.pz-cable-mark").forEach((p) => p.setAttribute("d", "")); tip?.setAttribute("visibility", "hidden"); return; }
    const look = wireLook(w);
    const y1 = ys(rowOf(w));
    const d = path(y1, x, y);
    el.querySelectorAll("path.pz-cable-shadow, path.pz-cable-jacket, path.pz-cable-body, path.pz-cable-shine, path.pz-cable-mark").forEach((p) => p.setAttribute("d", d));
    (el.querySelector(".pz-cable") as SVGGElement | null)?.style.setProperty("--wire", look.color);
    const mark = el.querySelector(".pz-cable-mark");
    mark?.setAttribute("stroke-dasharray", look.dash || "0 100000");
    mark?.setAttribute("class", `pz-cable-mark pz-cable-mark-${look.mark}`);
    tip?.setAttribute("visibility", "visible");
    tip?.setAttribute("transform", `translate(${x} ${y}) rotate(${(Math.atan2(y - y1, Math.max(x - LEFT_X, 20)) * 180) / Math.PI})`);
  };

  const onDown = (e: PointerEvent<SVGSVGElement>): void => {
    const hit = (e.target as Element).closest("[data-wire]");
    if (!hit) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = local(e);
    down.current = { wire: Number(hit.getAttribute("data-wire")), x: p.x, y: p.y, moved: false };
  };
  const onMove = (e: PointerEvent<SVGSVGElement>): void => {
    const d = down.current;
    if (d === null) return;
    const p = local(e);
    if (!d.moved && Math.hypot(p.x - d.x, p.y - d.y) > TAP_SLOP) { d.moved = true; setDragging(d.wire); }
    if (d.moved) showGhost(d.wire, p.x, p.y);
  };
  const onUp = (e: PointerEvent<SVGSVGElement>): void => {
    const d = down.current;
    if (d === null) return;
    down.current = null;
    showGhost(null);
    setDragging(null);
    if (!d.moved) { choose(d.wire); return; } // a tap picks the wire up; the next tap on a terminal plugs it in
    const p = local(e);
    let best = -1;
    let bestDist = SNAP_RADIUS;
    for (let t = 0; t < n; t++) {
      const dist = Math.hypot(p.x - RIGHT_X, p.y - ys(t));
      if (dist < bestDist) { bestDist = dist; best = t; }
    }
    pick(null);
    if (best >= 0) plug(d.wire, best);
    else unplug(d.wire);
  };
  const onCancel = (): void => { down.current = null; showGhost(null); setDragging(null); };

  // A keyboard or screen-reader press arrives as a click with no pointer (`detail` is 0); a finger's tap is handled above.
  const onKey = (act: () => void) => (e: KeyboardEvent): void => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } };
  const onAssistClick = (act: () => void) => (e: MouseEvent): void => { if (e.detail === 0) act(); };

  const joined = Object.keys(conn).length;
  const pairs = view.leftOrder.flatMap((w) => { const t = conn[w]; return t === undefined ? [] : [[w, t] as [number, number]]; });

  return (
    <div>
      <p className="ui-hint pz-hint">Match each wire to its place in the fuse box you saw. Drag it to a terminal, or tap the wire and then a terminal.</p>
      <div className="pz-field pz-visual">
        <svg ref={board} viewBox={`0 0 ${W} ${H}`} className="pz-board pz-wires-board" role="group" aria-label="Wires board" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}>
          <WireDefs id={defs} />
          <Clamp x={0} y={ys(0) - 34} h={ys(n - 1) - ys(0) + 68} rows={view.leftOrder.map((_, row) => ys(row))} id={defs} />
          <Block x={RIGHT_X - 40} y={ys(0) - 34} w={86} h={ys(n - 1) - ys(0) + 68} id={defs} dividers={view.leftOrder.slice(0, -1).map((_, t) => (ys(t) + ys(t + 1)) / 2)} />
          {Object.entries(conn).filter(([w]) => Number(w) !== dragging).map(([w, t]) => (
            <g key={w} className="pz-wire-run">
              <Cable look={wireLook(Number(w))} d={path(ys(rowOf(Number(w))), RIGHT_X - LUG_BACK, ys(t))} />
              <Lug x={RIGHT_X} y={ys(t)} id={defs} />
            </g>
          ))}
          {view.leftOrder.filter((w) => conn[w] === undefined && w !== dragging).map((w) => (
            <g key={w} className="pz-wire-stub">
              <Cable look={wireLook(w)} d={stub(ys(rowOf(w)))} />
              <CopperTip x={LEFT_X + 96} y={ys(rowOf(w)) + 24} angle={9} id={defs} />
            </g>
          ))}
          <g ref={ghost} className="pz-wire-ghost-group">
            <Cable look={wireLook(0)} d="" ghost />
            <CopperTip x={0} y={0} angle={0} id={defs} />
          </g>
          {view.leftOrder.map((_, t) => {
            const w = holder(t);
            return (
              <g key={t} role="button" tabIndex={0} aria-label={w === undefined ? `Terminal ${t + 1}` : `Terminal ${t + 1}, holds ${wireLook(w).name}`} className="pz-terminal" onClick={() => plugPicked(t)} onKeyDown={onKey(() => plugPicked(t))}>
                <circle cx={RIGHT_X} cy={ys(t)} r={HANDLE_R} className="pz-terminal-ring" />
                <Screw cx={RIGHT_X} cy={ys(t)} id={defs} turn={((t * 37) % 90) + (w === undefined ? 0 : 45)} />
                <text x={RIGHT_X + 31} y={ys(t) + 6} className="pz-block-num">{t + 1}</text>
              </g>
            );
          })}
          {view.leftOrder.map((w, row) => {
            const look = wireLook(w);
            const t = conn[w];
            const label = `Wire ${look.name}${t === undefined ? "" : `, on terminal ${t + 1}`}`;
            return (
              <g key={w} data-wire={w} role="button" tabIndex={0} aria-label={label} aria-pressed={picked === w} className={`pz-wire-handle${picked === w ? " pz-wire-picked" : ""}`} onClick={onAssistClick(() => choose(w))} onKeyDown={onKey(() => choose(w))}>
                <circle cx={LEFT_X} cy={ys(row)} r={HANDLE_R} className="pz-wire-disc" />
                <Tag look={look} cx={LEFT_X} cy={ys(row)} />
              </g>
            );
          })}
        </svg>
        <p className="ui-hint pz-hint" role="status">{joined} of {n} wires joined</p>
      </div>
      <button type="button" className="ui-button ui-button--primary pz-wide" disabled={joined !== n} onClick={() => submit({ pairs })}>Check the wires</button>
    </div>
  );
}
