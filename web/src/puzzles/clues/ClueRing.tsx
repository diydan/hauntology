import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { PerspectiveCamera, Scene } from "three";
import { clueTitle, type SpiritClue } from "@hauntology/shared/puzzles/clues";
import { RING_MS, RING_MS_ASSIST, allRead, arrowFor, readSet, ringDone, ringPlan, showAllRead, startRing, stepRing, viewOfDirection, type RingState } from "@hauntology/shared/puzzles/ring";
import { useRearCamera, type CameraDeps } from "../../table/camera";
import { isFaceDown, type OrientationSource } from "../../table/orientation";
import { createWebGLRenderer, type RendererFactory, type TableRenderer } from "../../table/renderer";
import { dragBy, dragQuat, forwardOf, orientationQuat, START_VIEW, type DragView, type Orientation, type Quat } from "../../table/view";
import { useFrame } from "../hooks";
import { ClueList } from "./ClueList";
import { canvasLabeller, createRingScene, type Labeller, type RingScene } from "./ringScene";
import "./ClueRing.css";

/**
 * The Clue ring on a phone (puzzles 10.6, 10.8, Requirement 15): the clues of a Sight hang in the air round the Player, who turns the phone (or
 * drags) to look at them. An unread clue is a ring with a question mark; looking at one steadily for 0.7 s reads it (one click buzz, one soft
 * pulse, a line in the live region). The ring replaces the 5 seconds of a plain Sight and ends when the Player taps Done, every clue is read or
 * 30 seconds have passed (45 with Assist). The Clue list is beside it, with "Show all as text", so a Lock is finishable without turning; an arrow
 * shows the way to the nearest unread clue after 3 seconds of nothing read. At most 12 clues, at most 30 frames a second, paused face down or
 * hidden, still under reduced motion. The camera is an opt-in backdrop from the Camera tap only: a video element under the canvas, never recorded,
 * stored, copied to a canvas, analysed or sent. The ring reads only the Player's own clues and the seed's placement, sends nothing and keeps nothing.
 * Everything that touches the browser comes in by a port (`orientation`, `createRenderer`, `media`, the frame loop), so a jsdom test drives it with fakes.
 */
export type ClueRingProps = Readonly<{
  clues: readonly SpiritClue[];
  assist?: boolean;
  reducedMotion?: boolean;
  /** The orientation sensor, already asked for by the switch's own tap (an iPhone only allows that from a tap). */
  orientation?: OrientationSource | null;
  createRenderer?: RendererFactory;
  media?: CameraDeps["media"];
  /** The click buzz, once for each clue read; its visual twin is the soft pulse. */
  buzz?: () => void;
  onDone: () => void;
  /** The ids read in one step, for whoever shows the count (the Spirit table's Clues control). */
  onRead?: (read: ReadonlySet<string>) => void;
  label?: Labeller;
  screenAngle?: () => number;
}>;

const prefersReduced = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const NO_WEBGL = "This phone cannot draw the ring, so here are the clues as a list.";

export function ClueRing(props: ClueRingProps): ReactNode {
  const { clues, assist = false, orientation = null, createRenderer = createWebGLRenderer, onDone, onRead, buzz, label = canvasLabeller } = props;
  const reduced = props.reducedMotion ?? prefersReduced();
  const [state, setState] = useState<RingState>(() => startRing(clues));
  const stateRef = useRef(state);
  const [listOpen, setListOpen] = useState(false);
  const [arrow, setArrow] = useState<ReturnType<typeof arrowFor>>({ show: false, clueId: null, angle: 0 });
  const [said, setSaid] = useState("");
  const [drawable, setDrawable] = useState(true);
  const [tapped, setTapped] = useState(false);
  const cam = useRearCamera(props.media === undefined ? {} : { media: props.media });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<TableRenderer | null>(null);
  const sceneRef = useRef<{ scene: Scene; camera: PerspectiveCamera; ring: RingScene } | null>(null);
  const reading = useRef<Orientation | null>(null);
  const faceDown = useRef(false);
  const dragView = useRef<DragView>({ ...START_VIEW, pitch: 0 });
  const dragFrom = useRef<{ x: number; y: number } | null>(null);
  const lastDraw = useRef<number | undefined>(undefined);
  const doneRef = useRef(false);
  const listOpenRef = useRef(listOpen);
  listOpenRef.current = listOpen;
  /** "Show all as text" was used: the ring then waits for Done or the time limit, so the Player can read the list (decision for review). */
  const shownAll = useRef(false);
  const latest = useRef({ onDone, onRead, buzz });
  latest.current = { onDone, onRead, buzz };
  const titles = useMemo(() => new Map(clues.map((c) => [c.id, clueTitle(c)])), [clues]);

  // the sensor: a reading goes straight to the next frame and is never stored or sent
  useEffect(() => {
    if (!orientation) return;
    return orientation.subscribe((o) => { reading.current = o; faceDown.current = isFaceDown(o); });
  }, [orientation]);

  const quatNow = useCallback((): Quat => {
    const o = reading.current;
    if (orientation?.available && o) {
      const q = orientationQuat(o, props.screenAngle?.() ?? (typeof screen !== "undefined" && screen.orientation ? screen.orientation.angle : 0));
      if (q) return q;
    }
    return dragQuat(dragView.current);
  }, [orientation, props.screenAngle]);

  // the scene and the renderer: made once the canvas is there, thrown away when the ring closes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = createRenderer(canvas);
    if (!r) { setDrawable(false); setListOpen(true); return; }
    setDrawable(true);
    rendererRef.current = r;
    const scene = new Scene();
    const camera = new PerspectiveCamera(60, 390 / 700, 0.1, 20);
    const ring = createRingScene(clues, label);
    scene.add(ring.group);
    sceneRef.current = { scene, camera, ring };
    const fit = (): void => {
      const st = stageRef.current; if (!st) return;
      const w = st.clientWidth || 390, h = st.clientHeight || 700;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      r.resize(w, h, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
    };
    fit();
    if (typeof window !== "undefined") window.addEventListener("resize", fit);
    return () => {
      if (typeof window !== "undefined") window.removeEventListener("resize", fit);
      ring.dispose(); r.dispose(); sceneRef.current = null; rendererRef.current = null;
    };
  }, [clues, createRenderer, label]);

  // the loop: reads what the view points at, draws at most 30 frames a second, and does nothing face down or hidden
  useFrame((t, dt) => {
    const hidden = typeof document !== "undefined" && document.hidden;
    const plan = ringPlan({ faceDown: faceDown.current, hidden, reducedMotion: reduced, now: t, ...(lastDraw.current !== undefined ? { lastDrawMs: lastDraw.current } : {}) });
    if (!plan.awake) return;
    const q = quatNow();
    const view = viewOfDirection(forwardOf(q));
    const step = stepRing(stateRef.current, clues, view, dt, true);
    stateRef.current = step.state;
    const sc = sceneRef.current;
    if (step.newlyRead.length > 0) {
      for (const id of step.newlyRead) { sc?.ring.pulse(id, plan.still); latest.current.buzz?.(); }
      const first = step.newlyRead[0]!;
      const c = clues.find((x) => x.id === first);
      setSaid(c ? `Read. ${titles.get(first) ?? "A clue"}: ${c.text}.` : "");
      setState(step.state);
      latest.current.onRead?.(readSet(step.state));
    }
    const a = arrowFor(step.state, clues, view, listOpenRef.current);
    setArrow((cur) => (cur.show === a.show && cur.clueId === a.clueId && Math.abs(cur.angle - a.angle) < 0.05 ? cur : a));
    if (plan.draw && sc && rendererRef.current) {
      lastDraw.current = t;
      sc.camera.quaternion.set(q.x, q.y, q.z, q.w);
      sc.ring.setRead(readSet(step.state));
      if (!plan.still) sc.ring.update(dt);
      rendererRef.current.render(sc.scene, sc.camera);
    }
    const over = shownAll.current ? step.state.openMs >= (assist ? RING_MS_ASSIST : RING_MS) : ringDone(step.state, assist, false);
    if (!doneRef.current && over) { doneRef.current = true; latest.current.onDone(); }
  });

  const finish = (): void => { setTapped(true); if (!doneRef.current) { doneRef.current = true; latest.current.onDone(); } };
  const showAll = (): void => { shownAll.current = true; const next = showAllRead(stateRef.current); stateRef.current = next; setState(next); latest.current.onRead?.(readSet(next)); setSaid("Every clue is shown as text."); };

  // dragging looks round when there is no sensor (or Tilt is off); the sensor wins when it gives readings
  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>): void => { e.currentTarget.setPointerCapture?.(e.pointerId); dragFrom.current = { x: e.clientX, y: e.clientY }; };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    const f = dragFrom.current; if (!f) return;
    dragView.current = dragBy(dragView.current, e.clientX - f.x, e.clientY - f.y);
    dragFrom.current = { x: e.clientX, y: e.clientY };
  };
  const onUp = (): void => { dragFrom.current = null; };

  const read = readSet(state);
  const arrowWords = arrow.show && arrow.clueId !== null ? `The nearest unread clue is ${Math.abs(arrow.angle) < Math.PI / 4 ? "to your right" : Math.abs(arrow.angle) > (3 * Math.PI) / 4 ? "to your left" : arrow.angle > 0 ? "above" : "below"}.` : "";
  return (
    <section className="cr-ring ui-stack--tight" aria-label="Clues in the air" data-reduced={reduced ? "1" : "0"}>
      <div className="cr-stage" ref={stageRef}>
        <video ref={cam.videoRef} className="cr-video" muted playsInline aria-hidden="true" tabIndex={-1} hidden={cam.status !== "on"} />
        <canvas ref={canvasRef} className="cr-canvas" aria-hidden="true" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        {arrow.show && arrow.clueId !== null ? <span className="cr-arrow ui-chip is-active" data-testid="cr-arrow" style={{ transform: `rotate(${(-arrow.angle * 180) / Math.PI}deg)` }} aria-hidden="true">➤</span> : null}
        {cam.status === "on" ? <span className="cr-camera-on ui-chip is-active" role="status">Camera on</span> : null}
      </div>
      {!drawable ? <p className="ui-notice" role="status">{NO_WEBGL}</p> : null}
      <p className="ui-sr-only" role="status" aria-live="polite" data-testid="cr-said">{said}</p>
      {arrowWords !== "" ? <p className="ui-hint" role="status" data-testid="cr-arrow-words">{arrowWords}</p> : null}
      <p className="ui-hint" data-testid="cr-count">{read.size} of {clues.length} clues read. Turn round and look; hold your gaze on a clue to read it.</p>
      <ul className="ui-sr-only" aria-label="Clues in the air">
        {clues.map((c) => <li key={c.id}>{titles.get(c.id)}: {read.has(c.id) ? c.text : "not found yet"}</li>)}
      </ul>
      <div className="cr-controls ui-row">
        {cam.status === "on"
          ? <button type="button" className="ui-button" onClick={cam.stop}>Stop camera</button>
          : <button type="button" className="ui-button" onClick={() => void cam.start()} disabled={cam.status === "starting"}>Camera</button>}
        <button type="button" className="ui-button" aria-expanded={listOpen} onClick={() => setListOpen((o) => !o)}>Clue list</button>
        <button type="button" className="ui-button ui-button--primary" onClick={finish} data-tapped={tapped ? "1" : "0"}>{allRead(state) ? "Done" : "Done looking"}</button>
      </div>
      {cam.status === "refused" || cam.status === "unavailable" || cam.status === "starting" ? <p className="ui-hint" role="status">{cam.message}</p> : null}
      {listOpen ? <ClueList clues={clues} read={read} onShowAll={showAll} onClose={() => setListOpen(false)} /> : null}
    </section>
  );
}
