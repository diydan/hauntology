import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { PerspectiveCamera, Scene } from "three";
import type { Theory } from "@hauntology/shared/party/theory";
import type { TableData } from "@hauntology/shared/table/data";
import { tablePlan } from "@hauntology/shared/table/plan";
import { useRearCamera, type CameraDeps } from "./camera";
import { carryTarget, dropOutcome, gestureStep, IDLE, type Gesture } from "./carry";
import { buildModel, findPiece, type PieceId, type TableModel } from "./model";
import { isFaceDown, type OrientationSource } from "./orientation";
import { pickPiece, rayToBoard, worldRay } from "./picking";
import { createWebGLRenderer, webglAvailable, type RendererFactory, type TableRenderer } from "./renderer";
import { BoardArrow, PieceCard, TableControls } from "./TableControls";
import { TableList } from "./TableList";
import { createTableScene, type PictureRef, type TableScene } from "./threeScene";
import { ARROW_START, boardView, DEFAULT_ANCHOR, DEFAULT_FOV, dragBy, dragQuat, orientationQuat, placeAt, START_VIEW, stepArrow, type Anchor, type DragView, type Orientation, type Quat } from "./view";
import "./table.css";

/**
 * The Spirit table on a phone (spirit-table Requirements 2 to 6 and 9): the three.js scene turned by the orientation sensor or by dragging,
 * at most 30 frames a second, paused face down or hidden, still under reduced motion, with the camera backdrop on the Player's own tap, the
 * four controls, the piece card, the board arrow and the carry of a Suspect onto a room. It reads only Table data and the Player's own
 * Theory marks, sends nothing and stores nothing (3.4): the Theory mark goes out through `onTheory` to whoever keeps the notebook.
 * Everything that touches the browser comes in through a port (`createRenderer`, `orientation`, `media`, `frame`), so a jsdom test drives it
 * with fakes. The real WebGL drawing is the one thing a jsdom test cannot prove.
 */

export type FrameClock = Readonly<{ request: (cb: (t: number) => void) => number; cancel: (id: number) => void; now: () => number }>;
const browserClock = (): FrameClock => ({ request: (cb) => requestAnimationFrame(cb), cancel: (id) => cancelAnimationFrame(id), now: () => performance.now() });

export type SpiritTableProps = Readonly<{
  data: TableData;
  roomCode: string;
  theory: Theory;
  onTheory: (next: Theory) => void;
  /** Spirit clues read so far (the Clue ring of `puzzles` hangs round the same viewpoint), or null where there are none. */
  clueCount?: number | null;
  onClues?: () => void;
  reducedMotion?: boolean;
  orientation?: OrientationSource | null;
  createRenderer?: RendererFactory;
  media?: CameraDeps["media"];
  frame?: FrameClock;
  portraits?: Readonly<Record<string, PictureRef>>;
  buzz?: (ms: number) => void;
  /** Tilt is on from the start (the Spirit table switch already asked for motion with its own tap). */
  initialTilt?: boolean;
  /** The Clue ring of `puzzles` hangs in the same scene with the same camera, so it turns with the same view (7.1). It returns the way to take itself down. */
  ring?: (ctx: Readonly<{ scene: Scene; camera: PerspectiveCamera }>) => () => void;
  /** The screen's turn in degrees (0 upright). */
  screenAngle?: () => number;
}>;

const prefersReduced = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const defaultBuzz = (ms: number): void => { try { navigator.vibrate?.(ms); } catch { /* no buzz here */ } };
const NO_WEBGL = "This phone cannot draw the table, so here it is as a list.";
const DRIFT = "Tilt can drift. Tap Place to centre the table again.";

export function SpiritTable(props: SpiritTableProps): ReactNode {
  const { data, roomCode, theory, onTheory } = props;
  const reduced = props.reducedMotion ?? prefersReduced();
  const clock = useMemo(() => props.frame ?? browserClock(), [props.frame]);
  const factory = props.createRenderer ?? createWebGLRenderer;
  const orientation = props.orientation ?? null;

  const [webgl] = useState<boolean>(() => (props.createRenderer ? true : webglAvailable()));
  const [mode, setMode] = useState<"table" | "list">("table");
  const [picked, setPicked] = useState<PieceId | null>(null);
  const [tiltOn, setTiltOn] = useState<boolean>(!!props.initialTilt && !!props.orientation?.available);
  const [saying, setSaying] = useState<string>("");
  const [arrow, setArrow] = useState<{ show: boolean; angle: number }>({ show: false, angle: 0 });
  const [drawn, setDrawn] = useState<boolean>(true);
  const cam = useRearCamera(props.media === undefined ? {} : { media: props.media });

  // The model is rebuilt from Table data and the Player's own Theory marks, at the clock's time: the list and the drawing read the same one.
  const tRef = useRef(0);
  const model: TableModel = useMemo(() => buildModel({ data, roomCode, theory, tMs: tRef.current, reducedMotion: reduced }), [data, roomCode, theory, reduced]);
  const modelRef = useRef(model); modelRef.current = model;
  const theoryRef = useRef(theory); theoryRef.current = theory;
  const onTheoryRef = useRef(onTheory); onTheoryRef.current = onTheory;

  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<TableScene | null>(null);
  const rendererRef = useRef<TableRenderer | null>(null);
  const anchorRef = useRef<Anchor>(DEFAULT_ANCHOR);
  const dragView = useRef<DragView>(START_VIEW);
  const lastReading = useRef<Orientation | null>(null);
  const quatRef = useRef<Quat>(dragQuat(START_VIEW));
  const gesture = useRef<Gesture>(IDLE);
  const faceDown = useRef(false);
  const arrowState = useRef(ARROW_START);
  const lastDraw = useRef<number | undefined>(undefined);
  const lastFrameAt = useRef<number | undefined>(undefined);
  const driftSaid = useRef(false);
  const aspect = useRef(DEFAULT_FOV.aspect);
  const carriedRef = useRef<string | null>(null);
  const ringRef = useRef(props.ring); ringRef.current = props.ring;

  const sensorsOn = !!orientation && orientation.available && tiltOn;

  // the sensor
  useEffect(() => {
    if (!orientation || !tiltOn) return;
    return orientation.subscribe((o) => { lastReading.current = o; faceDown.current = isFaceDown(o); });
  }, [orientation, tiltOn]);

  const currentQuat = useCallback((): Quat => {
    const o = lastReading.current;
    if (sensorsOn && o) {
      const q = orientationQuat(o, props.screenAngle?.() ?? (typeof screen !== "undefined" && screen.orientation ? screen.orientation.angle : 0));
      if (q) return q;
    }
    return dragQuat(dragView.current);
  }, [sensorsOn, props.screenAngle]);

  // the scene and the renderer: made once the canvas is there, thrown away when the Table closes
  useEffect(() => {
    if (!webgl || mode !== "table") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = factory(canvas);
    if (!r) { setDrawn(false); return; }
    setDrawn(true);
    rendererRef.current = r;
    const scene = createTableScene(modelRef.current, { reducedMotion: reduced, ...(props.portraits ? { portraits: props.portraits } : {}) });
    sceneRef.current = scene;
    const takeDownRing = ringRef.current ? ringRef.current({ scene: scene.scene, camera: scene.camera }) : null;
    const fit = (): void => {
      const st = stageRef.current; if (!st) return;
      const w = st.clientWidth || 390, h = st.clientHeight || 700;
      aspect.current = w / h; r.resize(w, h, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
    };
    fit();
    const onResize = (): void => fit();
    if (typeof window !== "undefined") window.addEventListener("resize", onResize);
    return () => {
      if (typeof window !== "undefined") window.removeEventListener("resize", onResize);
      takeDownRing?.(); scene.dispose(); r.dispose(); sceneRef.current = null; rendererRef.current = null;
    };
  }, [webgl, mode, factory, reduced, props.portraits]);

  // the loop: at most 30 frames a second, paused face down or hidden, still under reduced motion
  useEffect(() => {
    if (!webgl || mode !== "table") return;
    let id = 0, alive = true;
    const loop = (): void => {
      if (!alive) return;
      id = clock.request(loop);
      const now = clock.now();
      const plan = tablePlan({
        sensors: !!orientation && orientation.available, tilt: tiltOn, faceDown: faceDown.current,
        hidden: typeof document !== "undefined" && document.visibilityState === "hidden", reducedMotion: reduced, webgl: !!rendererRef.current, now,
        ...(lastDraw.current !== undefined ? { lastDrawMs: lastDraw.current } : {}),
      });
      if (!plan.draw) return;
      const dt = lastFrameAt.current === undefined ? 16 : now - lastFrameAt.current;
      lastDraw.current = now; lastFrameAt.current = now; tRef.current = now;
      const scene = sceneRef.current, r = rendererRef.current;
      if (!scene || !r) return;
      const q = currentQuat(); quatRef.current = q;
      scene.setView(anchorRef.current, q, aspect.current);
      const m = buildModel({ data: data, roomCode, theory: theoryRef.current, tMs: now, reducedMotion: reduced });
      scene.sync(m, now, dt);
      r.render(scene.scene, scene.camera);
      const bv = boardView(q, anchorRef.current);
      const next = stepArrow(arrowState.current, bv.inView, dt);
      if (next.show !== arrowState.current.show) setArrow({ show: next.show, angle: bv.angle });
      arrowState.current = next;
    };
    id = clock.request(loop);
    return () => { alive = false; clock.cancel(id); };
  }, [webgl, mode, clock, orientation, tiltOn, reduced, currentQuat, data, roomCode]);

  useEffect(() => { sceneRef.current?.select(picked); }, [picked]);

  // ---- the finger
  const rayAt = useCallback((e: { clientX: number; clientY: number }) => {
    const st = stageRef.current; if (!st) return null;
    const box = st.getBoundingClientRect();
    const w = box.width || 1, h = box.height || 1;
    const nx = ((e.clientX - box.left) / w) * 2 - 1, ny = -(((e.clientY - box.top) / h) * 2 - 1);
    const ray = worldRay(quatRef.current, { vertical: DEFAULT_FOV.vertical, aspect: aspect.current }, nx, ny);
    return ray ? rayToBoard(anchorRef.current, ray) : null;
  }, []);

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const ray = rayAt(e);
    const hit = ray ? pickPiece(modelRef.current, ray, ["suspect"]) : null;
    gesture.current = gestureStep(gesture.current, { type: "down", x: e.clientX, y: e.clientY, suspect: hit ? hit.replace(/^suspect:/, "") : null }).state;
    lastPointer.current = { x: e.clientX, y: e.clientY };
  };
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  const feetAndRoom = useCallback((e: { clientX: number; clientY: number }) => {
    const ray = rayAt(e); return ray ? carryTarget(modelRef.current, ray) : null;
  }, [rayAt]);

  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    const { state, effect } = gestureStep(gesture.current, { type: "move", x: e.clientX, y: e.clientY });
    gesture.current = state;
    if (effect.kind === "turn") { if (!sensorsOn) dragView.current = dragBy(dragView.current, -effect.dx, -effect.dy); }
    else if (effect.kind === "carry_start" || effect.kind === "carry_move") {
      const t = feetAndRoom(e);
      if (effect.kind === "carry_start") { (props.buzz ?? defaultBuzz)(15); setPicked(`suspect:${effect.suspect}`); carriedRef.current = effect.suspect; }
      if (carriedRef.current) sceneRef.current?.carry(carriedRef.current, t ? t.head : null, t?.room?.zone ?? null);
    }
  };
  const finish = (e: ReactPointerEvent<HTMLCanvasElement>, cancelled: boolean): void => {
    const { state, effect } = gestureStep(gesture.current, { type: cancelled ? "cancel" : "up" });
    gesture.current = state;
    if (effect.kind === "tap") {
      const ray = rayAt(e), id = ray ? pickPiece(modelRef.current, ray) : null;
      setPicked(id);
    } else if (effect.kind === "drop") {
      const out = dropOutcome(modelRef.current, theoryRef.current, effect.suspect, feetAndRoom(e));
      (props.buzz ?? defaultBuzz)(10);
      sceneRef.current?.carry(null, null, null); carriedRef.current = null;
      if (out.change !== "none") onTheoryRef.current(out.theory);
      setSaying(out.say);
    } else if (effect.kind === "cancel_carry") { sceneRef.current?.carry(null, null, null); carriedRef.current = null; }
  };

  // ---- the controls
  const onPlace = (): void => {
    // read the way the phone points NOW, from the turn in use at this moment (4.1), never from an earlier view
    const q = currentQuat(); quatRef.current = q;
    const placed = placeAt(q, anchorRef.current.heading);
    anchorRef.current = placed; arrowState.current = ARROW_START; setArrow({ show: false, angle: 0 });
    sceneRef.current?.pulse();
    setSaying("Table placed in front of you.");
  };
  const onTilt = (): void => {
    if (!orientation || !orientation.available) return;
    if (tiltOn) { orientation.disable(); setTiltOn(false); setSaying(""); return; }
    setSaying("");
    void orientation.enable().then((ok) => {
      if (!ok) { setSaying("Motion was not allowed. Drag to turn the view."); return; }
      setTiltOn(true);
      if (!driftSaid.current) { driftSaid.current = true; setSaying(DRIFT); }
    });
  };

  const pickedPiece = picked ? findPiece(model, picked) : undefined;
  const camOn = cam.status === "on";
  const tiltState: "on" | "off" | "unavailable" = !orientation || !orientation.available ? "unavailable" : tiltOn ? "on" : "off";

  if (!webgl || (webgl && !drawn)) {
    return (
      <div className="st-layer">
        <TableList model={model} theory={theory} onTheory={onTheory} notice={NO_WEBGL} />
      </div>
    );
  }

  return (
    <div className="st-layer">
      <div className="ui-segments" role="group" aria-label="Table or list">
        <button type="button" className="ui-button" aria-pressed={mode === "table"} onClick={() => setMode("table")}>Table</button>
        <button type="button" className="ui-button" aria-pressed={mode === "list"} onClick={() => setMode("list")}>List</button>
      </div>
      {mode === "list" ? (
        <TableList model={model} theory={theory} onTheory={onTheory} onPick={(id) => { setPicked(id); setMode("table"); }} />
      ) : (
        <div className="st-stage" ref={stageRef}>
          <video ref={cam.videoRef} className="st-video" playsInline muted aria-hidden="true" hidden={!camOn} />
          <canvas
            ref={canvasRef} className="st-canvas" role="img" aria-label="Spirit table, drawn view. Everything on it is also in the list."
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={(e) => finish(e, false)} onPointerCancel={(e) => finish(e, true)}
          />
          {camOn ? (
            <div className="st-indicator">
              <span className="ui-chip is-active" role="status">Camera on</span>
              <button type="button" className="ui-button st-stop" onClick={cam.stop}>Stop camera</button>
            </div>
          ) : null}
          {arrow.show ? <BoardArrow angle={arrow.angle} /> : null}
          {pickedPiece ? <PieceCard model={model} piece={pickedPiece} onClose={() => setPicked(null)} /> : null}
        </div>
      )}
      <TableControls
        camera={cam.status} onCamera={() => { if (cam.status === "on" || cam.status === "starting") cam.stop(); else void cam.start(); }}
        onPlace={onPlace} tilt={tiltState} onTilt={onTilt}
        clueCount={props.clueCount ?? null} onClues={props.onClues ?? (() => undefined)}
      />
      <p className="ui-status" role="status">{cam.status === "refused" || cam.status === "unavailable" ? cam.message : saying}</p>
    </div>
  );
}
