import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { WireShape, wireLook } from "../art/wires";
import { useLatest } from "../hooks";
import type { KindProps } from "./types";
import "./Wires.css";

const W = 340;
const LEFT_X = 50;
const RIGHT_X = 290;
const HANDLE_R = 32; // 64 units: the frame leaves about 270 px for the 340-unit board at 320 px wide, so this is 48 px or more
const SNAP_RADIUS = 44;
const TAP_SLOP = 10;
type Conn = Readonly<Record<number, number>>;

/**
 * Cut wires: join each cut end to the terminal that matches its place in the fuse box seen earlier. Drag a wire end to a
 * terminal, or tap a wire and then tap a terminal. Drag a wire away from every terminal to unplug it.
 * A wire is never told apart by colour alone: each has its own dash pattern and end shape.
 */
export default function Wires({ view, feel, submit, announce }: KindProps<"wires">) {
  const n = view.n;
  const H = 70 + n * 62;
  const ys = (i: number): number => 50 + i * ((H - 100) / (n - 1));
  const [conn, setConn] = useState<Conn>({});
  const [picked, setPicked] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const board = useRef<SVGSVGElement>(null);
  const ghost = useRef<SVGPathElement>(null);
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
  const path = (y1: number, x2: number, y2: number): string => `M ${LEFT_X + HANDLE_R} ${y1} C 170 ${y1}, 170 ${y2}, ${x2} ${y2}`;
  const showGhost = (w: number | null, x = 0, y = 0): void => {
    const el = ghost.current;
    if (!el) return;
    if (w === null) { el.setAttribute("d", ""); return; }
    el.setAttribute("d", `M ${LEFT_X + HANDLE_R} ${ys(rowOf(w))} L ${x} ${y}`);
    el.setAttribute("stroke", wireLook(w).color);
    el.setAttribute("stroke-dasharray", wireLook(w).dash);
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
      <p className="pz-hint">Match each wire to its place in the fuse box you saw. Drag it to a terminal, or tap the wire and then a terminal.</p>
      <svg ref={board} viewBox={`0 0 ${W} ${H}`} className="pz-board pz-wires-board" role="group" aria-label="Wires board" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}>
        {Object.entries(conn).filter(([w]) => Number(w) !== dragging).map(([w, t]) => {
          const look = wireLook(Number(w));
          return <path key={w} d={path(ys(rowOf(Number(w))), RIGHT_X - HANDLE_R, ys(t))} className="pz-wire-line" stroke={look.color} strokeDasharray={look.dash} />;
        })}
        <path ref={ghost} d="" className="pz-wire-line pz-wire-ghost" />
        {view.leftOrder.map((_, t) => {
          const w = holder(t);
          return (
            <g key={t} role="button" tabIndex={0} aria-label={w === undefined ? `Terminal ${t + 1}` : `Terminal ${t + 1}, holds ${wireLook(w).name}`} className="pz-terminal" onClick={() => plugPicked(t)} onKeyDown={onKey(() => plugPicked(t))}>
              <circle cx={RIGHT_X} cy={ys(t)} r={HANDLE_R} className="pz-terminal-ring" />
              <text x={RIGHT_X} y={ys(t) + 7} className="pz-terminal-num">{t + 1}</text>
            </g>
          );
        })}
        {view.leftOrder.map((w, row) => {
          const look = wireLook(w);
          const t = conn[w];
          const label = `Wire ${look.name}${t === undefined ? "" : `, on terminal ${t + 1}`}`;
          return (
            <g key={w} data-wire={w} role="button" tabIndex={0} aria-label={label} aria-pressed={picked === w} className="pz-wire-handle" onClick={onAssistClick(() => choose(w))} onKeyDown={onKey(() => choose(w))}>
              <circle cx={LEFT_X} cy={ys(row)} r={HANDLE_R} className="pz-wire-disc" stroke={look.color} strokeWidth={picked === w ? 6 : 2.5} />
              <WireShape shape={look.shape} cx={LEFT_X} cy={ys(row)} r={13} fill={look.color} />
            </g>
          );
        })}
      </svg>
      <p className="pz-hint" role="status">{joined} of {n} wires joined</p>
      <button type="button" className="pz-btn pz-btn-primary pz-wide" disabled={joined !== n} onClick={() => submit({ pairs })}>Check the wires</button>
    </div>
  );
}
