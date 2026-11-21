import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { askOrientationPermission, useGyroAim } from "../../phone/sensors";
import { clampStick, coalesceInput, INPUT_MIN_GAP_MS, LOOK_MAX, maySend, releaseAll, type Input, type Vec2 } from "@hauntology/shared/party/input";

type Send = (msg: Readonly<{ t: string } & Record<string, unknown>>) => void;
const STICK_RADIUS_PX = 56;
/** Pixels of finger travel that make one look unit. */
const LOOK_PX = 3;

/**
 * Pad input for the active Detective (party-mode 9.3): a multitouch stick and a look area, sent at most 30 times a second and let go of all at
 * once when the page hides, the window loses focus, the connection drops, or the Player stops being the active Detective (so a thumb that is
 * still down can never leave the Host walking). The Room clamps again and moves only the active Detective; this side only keeps its promise to send little.
 */
export function usePadInput({ active, online, send, now = Date.now }: { active: boolean; online: boolean; send: Send; now?: () => number }): {
  stick: (v: Vec2) => void; look: (dx: number, dy: number) => void; aim: (dx: number, dy: number) => void; release: () => void;
} {
  const seq = useRef(0);
  const move = useRef<Vec2>([0, 0]);
  const pending = useRef<Input | null>(null);
  const last = useRef<number | null>(null);
  const sentIdle = useRef(true);
  const live = useRef(active && online);
  live.current = active && online;
  const sendRef = useRef(send);
  sendRef.current = send;

  const flush = useCallback((force = false): void => {
    if (!live.current && !force) return;
    const t = now();
    const p = pending.current;
    const idle = move.current[0] === 0 && move.current[1] === 0 && (p === null || (p.look[0] === 0 && p.look[1] === 0 && !p.aim));
    if (idle && sentIdle.current && !force) return;
    if (!force && !maySend(last.current, t)) return;
    const input: Input = { seq: ++seq.current, move: move.current, look: p?.look ?? [0, 0], ...(p?.aim ? { aim: p.aim } : {}) };
    pending.current = null;
    last.current = t;
    sentIdle.current = idle;
    sendRef.current({ t: "input", ...input });
  }, [now]);

  const release = useCallback((): void => {
    const h = releaseAll();
    move.current = h.move;
    pending.current = null;
    if (!sentIdle.current) flush(true);
  }, [flush]);

  useEffect(() => {
    const id = setInterval(() => flush(), INPUT_MIN_GAP_MS);
    const onHide = (): void => { if (document.visibilityState === "hidden") release(); };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", onHide);
    return () => { clearInterval(id); window.removeEventListener("blur", release); document.removeEventListener("visibilitychange", onHide); release(); };
  }, [flush, release]);
  // dropped connection or lost turn: let go now
  useEffect(() => { if (!active || !online) release(); }, [active, online, release]);

  return {
    stick: (v) => { move.current = clampStick(v); },
    look: (dx, dy) => { pending.current = coalesceInput(pending.current, { seq: 0, move: move.current, look: [Math.max(-LOOK_MAX, Math.min(LOOK_MAX, dx)), Math.max(-LOOK_MAX, Math.min(LOOK_MAX, dy))] }); },
    aim: (dx, dy) => { pending.current = coalesceInput(pending.current, { seq: 0, move: move.current, look: [0, 0], aim: [Math.max(-LOOK_MAX, Math.min(LOOK_MAX, dx)), Math.max(-LOOK_MAX, Math.min(LOOK_MAX, dy))] }); },
    release,
  };
}

/** The stick: a pad that follows one finger (pointer capture), reporting a vector inside the unit disc. */
function Stick({ onMove, onEnd, disabled }: { onMove: (v: Vec2) => void; onEnd: () => void; disabled: boolean }): ReactNode {
  const origin = useRef<{ id: number; x: number; y: number } | null>(null);
  const [knob, setKnob] = useState<Vec2>([0, 0]);
  const end = (): void => { origin.current = null; setKnob([0, 0]); onEnd(); };
  const at = (e: RPointerEvent): Vec2 => { const o = origin.current as { x: number; y: number }; return clampStick([(e.clientX - o.x) / STICK_RADIUS_PX, (e.clientY - o.y) / STICK_RADIUS_PX]); };
  return (
    <div
      className="pc-stick" role="group" aria-label="Movement stick" aria-disabled={disabled} data-testid="pc-stick"
      onPointerDown={(e) => { if (disabled || origin.current !== null) return; origin.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }}
      onPointerMove={(e) => { if (origin.current?.id !== e.pointerId) return; const v = at(e); setKnob(v); onMove([v[0], v[1]]); }}
      onPointerUp={(e) => { if (origin.current?.id === e.pointerId) end(); }}
      onPointerCancel={(e) => { if (origin.current?.id === e.pointerId) end(); }}
      onLostPointerCapture={(e) => { if (origin.current?.id === e.pointerId) end(); }}
    >
      <span className="pc-knob" style={{ transform: `translate(${knob[0] * 24}px, ${knob[1] * 24}px)` }} aria-hidden="true" />
      <span className="ui-hint pc-pad-label">{disabled ? "Not your turn" : "Move"}</span>
    </div>
  );
}

/** The look area: dragging turns the view by the distance moved. Another finger on the stick does not disturb it (each pointer is its own). */
function LookArea({ onLook, onEnd, disabled }: { onLook: (dx: number, dy: number) => void; onEnd: () => void; disabled: boolean }): ReactNode {
  const last = useRef<{ id: number; x: number; y: number } | null>(null);
  return (
    <div
      className="pc-look" role="group" aria-label="Look area" aria-disabled={disabled} data-testid="pc-look"
      onPointerDown={(e) => { if (disabled || last.current !== null) return; last.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }}
      onPointerMove={(e) => { const l = last.current; if (l?.id !== e.pointerId) return; onLook((e.clientX - l.x) / LOOK_PX, (e.clientY - l.y) / LOOK_PX); last.current = { id: l.id, x: e.clientX, y: e.clientY }; }}
      onPointerUp={(e) => { if (last.current?.id === e.pointerId) { last.current = null; onEnd(); } }}
      onPointerCancel={(e) => { if (last.current?.id === e.pointerId) { last.current = null; onEnd(); } }}
    >
      <span className="ui-hint pc-pad-label">{disabled ? "Not your turn" : "Look"}</span>
    </div>
  );
}

/** The pad: stick on the left, look on the right, and the Player's gyro opt-in. Sends only while this Player is the active Detective and online. */
export function Pad({ active, online, send, faces }: { active: boolean; online: boolean; send: Send; faces?: ReactNode }): ReactNode {
  const pad = usePadInput({ active, online, send });
  const [gyro, setGyro] = useState<"off" | "on" | "denied" | "none">("off");
  useGyroAim(gyro === "on" && active, pad.aim);
  const enable = async (): Promise<void> => {
    const r = await askOrientationPermission();
    setGyro(r === "granted" || r === "unneeded" ? "on" : r === "none" ? "none" : "denied");
  };
  const disabled = !active || !online;
  return (
    <section className="pc-pad" aria-label="Pad">
      <Stick disabled={disabled} onMove={pad.stick} onEnd={() => pad.stick([0, 0])} />
      <LookArea disabled={disabled} onLook={pad.look} onEnd={() => undefined} />
      <div className="pc-faces">{faces}</div>
      <div className="pc-gyro ui-stack--tight">
        {gyro === "on" ? (
          <button type="button" role="switch" aria-checked="true" className="ui-button ui-switch" onClick={() => setGyro("off")}><span className="ui-switch-name">Aim with tilt</span><span className="ui-switch-state">On</span></button>
        ) : (
          <button type="button" className="ui-button" onClick={() => void enable()}>Aim with tilt</button>
        )}
        {gyro === "denied" ? <p className="ui-hint" role="status">Tilt is not allowed on this phone, so use the look area.</p> : null}
        {gyro === "none" ? <p className="ui-hint" role="status">This phone has no tilt sensor, so use the look area.</p> : null}
      </div>
    </section>
  );
}
