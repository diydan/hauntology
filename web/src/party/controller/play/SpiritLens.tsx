import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { lensData, lensPlan, type LensData } from "@hauntology/shared/party/lens";
import type { PrivateView, PublicView } from "@hauntology/shared/party/views";
import { askOrientationPermission, useDeviceAngles } from "../../phone/sensors";
import type { GameView } from "../game-view";
import { nameOf } from "./play-logic";

/** The lens's data from the Engine's own views the phone receives: only what this Player may already see (party-mode 16.1). */
export function lensDataOf(game: GameView, me: number): LensData | null {
  const p = game.priv;
  const pub = game.pub;
  if (p === null || pub === null) return null;
  return lensData({ seat: me, hand: p.hand, shownToMe: p.shownToMe.map((x) => x.card), found: p.found } as unknown as PrivateView, { events: pub.events } as unknown as PublicView);
}

/** A beta near upside down (|beta| beyond 150 degrees) or lying flat face down: the lens pauses. */
export const isFaceDown = (a: { beta: number; gamma: number } | null): boolean => a !== null && (Math.abs(a.beta) > 150 || Math.abs(a.gamma) > 150);

/**
 * The Spirit lens (party-mode 9.17): off by default and local to the phone. A tap turns it on (and asks for motion from that tap), a second tap on the picture
 * calibrates it again (drift is expected), a phone with no sensors or one that prefers reduced motion gets a fixed view, it draws simple sprites for what this
 * Player already knows at 30 frames a second at most, and it stops while the phone lies face down or the page is hidden. It uses no camera and no markers.
 */
export function SpiritLens({ game, me, reducedMotion, sensors, askPermission = askOrientationPermission, now = Date.now, visible = () => document.visibilityState !== "hidden" }: {
  game: GameView; me: number; reducedMotion: boolean; sensors: boolean; askPermission?: () => Promise<"granted" | "denied" | "unneeded" | "none">; now?: () => number; visible?: () => boolean;
}): ReactNode {
  const [on, setOn] = useState(false);
  const [permitted, setPermitted] = useState(false);
  const [calibratedAt, setCalibratedAt] = useState<number | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const angles = useDeviceAngles(on && permitted);
  const calYaw = useRef(0);
  const data = useMemo(() => lensDataOf(game, me), [game, me]);
  const live = sensors && permitted;
  const plan = lensPlan({ sensors: live, faceDown: false, hidden: false, reducedMotion, now: now(), calibratedAtMs: calibratedAt });
  const dataRef = useRef(data);
  dataRef.current = data;
  const pubRef = useRef(game.pub);
  pubRef.current = game.pub;

  useEffect(() => {
    if (!on) return;
    const draw = (): void => {
      const a = angles.current;
      const p = lensPlan({ sensors: live, faceDown: isFaceDown(a), hidden: !visible(), reducedMotion, now: now(), calibratedAtMs: calibratedAt });
      const c = canvas.current;
      const ctx = c?.getContext("2d");
      if (!p.draw || c === null || !ctx || dataRef.current === null) return;
      const d = dataRef.current;
      const w = c.width, h = c.height;
      ctx.clearRect(0, 0, w, h);
      const yaw = p.fixedView || a === null ? 0 : ((a.alpha - calYaw.current) * Math.PI) / 180;
      const names = d.known.map((id) => nameOf(pubRef.current, id));
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      names.forEach((n, i) => {
        const ang = (i / Math.max(1, names.length)) * Math.PI * 2 + yaw;
        const x = w / 2 + Math.sin(ang) * (w * 0.32);
        const y = h / 2 - Math.cos(ang) * (h * 0.28);
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillText(n, x, y + 20);
      });
      d.ripples.forEach((r, i) => { ctx.beginPath(); ctx.arc(w / 2, h / 2, 20 + i * 10, 0, Math.PI * 2); ctx.stroke(); });
      void d.inspected;
    };
    const id = setInterval(draw, plan.frameIntervalMs);
    draw();
    return () => clearInterval(id);
  }, [on, live, reducedMotion, calibratedAt, plan.frameIntervalMs, angles, now, visible]);

  const turnOn = async (): Promise<void> => {
    const r = sensors ? await askPermission() : "none";
    setPermitted(r === "granted" || r === "unneeded");
    setOn(true);
  };
  const calibrate = (): void => { calYaw.current = angles.current?.alpha ?? 0; setCalibratedAt(now()); };
  const pubNames = (data?.known ?? []).map((id) => nameOf(game.pub, id));
  return (
    <section className="pc-lens ui-stack" aria-label="Spirit lens">
      <h2 className="ui-heading">Spirit lens</h2>
      {!on ? (
        <>
          <p className="ui-hint">Off. It shows what you already know as ghostly shapes. It uses no camera.</p>
          <button type="button" className="ui-button" onClick={() => void turnOn()}>Turn on the lens</button>
        </>
      ) : (
        <>
          <canvas ref={canvas} className="pc-lens-canvas" width={320} height={240} role="img" aria-label={pubNames.length === 0 ? "The lens shows nothing yet." : `The lens shows what you know: ${pubNames.join(", ")}.`} onClick={calibrate} />
          <p className="ui-hint" role="status">{plan.fixedView ? "Fixed view: this phone cannot turn the picture." : "Point the phone around. Tap the picture to line it up again; it drifts."}</p>
          <button type="button" className="ui-button" onClick={() => setOn(false)}>Turn off the lens</button>
        </>
      )}
    </section>
  );
}
