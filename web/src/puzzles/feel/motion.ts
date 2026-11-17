import { clampTilt, deadZone, dialFromGravity, smoothTilt, tiltForScreen, zeroTilt, type Tilt } from "@hauntology/shared/puzzles/motion";
import type { FeelSettings, Motion, Subscribe, TiltState } from "./types";

type Handler = (e: Event) => void;
type PermissionedEvent = { requestPermission?: () => Promise<string> };

/** The few things the sensor code needs from the browser, so a test can hand in its own. */
export type MotionHost = Readonly<{
  addEventListener(type: string, fn: Handler): void;
  removeEventListener(type: string, fn: Handler): void;
  /** `window.DeviceOrientationEvent` and `window.DeviceMotionEvent` (absent on a desktop). */
  DeviceOrientationEvent?: PermissionedEvent | undefined;
  DeviceMotionEvent?: PermissionedEvent | undefined;
  /** `document.hidden` */
  isHidden(): boolean;
  /** The screen angle: 0, 90, 180 or 270. */
  screenAngle(): number;
  now(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
}>;

const SAMPLE_GAP_MS = 33; // at most about 30 samples a second
const FIRST_READING_MS = 1500;

type OrientationLike = Event & { alpha?: number | null; beta?: number | null; gamma?: number | null };
type MotionLike = Event & { accelerationIncludingGravity?: { x: number | null; y: number | null; z: number | null } | null };

/**
 * Tilt from the phone's orientation sensor. `enable()` asks for permission from a tap (iPhone) and only says `on`
 * once a real reading arrives, so a desktop browser answers `unsupported` instead of pretending. The first reading is
 * the neutral pose until `holdLevel()`. Hidden or face-down: no readings. Raw sensor values never leave this file.
 */
export class BrowserMotion implements Motion {
  state: TiltState = "off";
  tilt: Tilt = { x: 0, y: 0 };
  dial: number | null = null;
  private smoothed: Tilt = { x: 0, y: 0 };
  private raw: Tilt = { x: 0, y: 0 };
  private prevAccel: { x: number; y: number; z: number } | null = null;
  private peakJolt = 0;
  private zero: Tilt | null = null;
  private last = 0;
  private listening = false;
  private first: (() => void) | null = null;
  private pending: Promise<TiltState> | null = null;
  /** The Player turned tilt off: it stays off until they turn it on again. */
  private userOff = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly host: MotionHost, private readonly settings: () => FeelSettings) {}

  subscribe: Subscribe = (listener) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(state: TiltState): TiltState { if (this.state !== state) { this.state = state; for (const l of [...this.listeners]) l(); } return state; }

  /** True where the phone must be asked from a tap (an iPhone). */
  private needsTap(): boolean {
    return typeof this.host.DeviceOrientationEvent?.requestPermission === "function" || typeof this.host.DeviceMotionEvent?.requestPermission === "function";
  }

  async autoEnable(opts: { fromTap: boolean }): Promise<TiltState> {
    const s = this.settings();
    if (s.touchOnly || s.tilt === false || this.userOff) return this.state;
    if (this.pending) return this.pending;
    if (this.state !== "off") return this.state; // on, denied or unsupported: never try again by itself
    if (this.needsTap() && !opts.fromTap) return this.state;
    return this.enable();
  }

  /** One ask at a time: a second call while the first waits for a reading shares its answer. */
  enable(): Promise<TiltState> {
    if (this.pending) return this.pending;
    this.userOff = false;
    const run = this.ask().finally(() => { this.pending = null; });
    this.pending = run;
    return run;
  }

  private async ask(): Promise<TiltState> {
    if (this.settings().touchOnly) return this.state;
    if (this.state === "on") return "on";
    const DO = this.host.DeviceOrientationEvent;
    if (!DO) return this.set("unsupported");
    try {
      const asks: Promise<string>[] = [];
      if (typeof DO.requestPermission === "function") asks.push(DO.requestPermission()); // both start inside the tap
      const DM = this.host.DeviceMotionEvent;
      if (DM && typeof DM.requestPermission === "function") asks.push(DM.requestPermission());
      if (asks.length > 0 && (await Promise.all(asks)).some((r) => r !== "granted")) return this.set("denied");
    } catch {
      return this.set("denied");
    }
    this.listen();
    const got = await new Promise<boolean>((resolve) => {
      const t = this.host.setTimeout(() => resolve(false), FIRST_READING_MS);
      this.first = () => { this.host.clearTimeout(t); resolve(true); };
    });
    this.first = null;
    if (!got) { this.unlisten(); return this.set("unsupported"); }
    return this.set("on");
  }

  disable(): void {
    this.userOff = true;
    this.unlisten();
    this.tilt = { x: 0, y: 0 };
    this.smoothed = { x: 0, y: 0 };
    this.zero = null;
    this.dial = null;
    this.set("off");
  }

  holdLevel(): void {
    this.zero = this.raw;
    this.smoothed = { x: 0, y: 0 };
    this.tilt = { x: 0, y: 0 };
  }

  private readonly onOrientation = (e: Event): void => {
    const ev = e as OrientationLike;
    if (ev.beta == null || ev.gamma == null) return;
    this.first?.();
    if (this.host.isHidden() || Math.abs(ev.beta) > 150) return; // hidden or face down: stop reading
    const t = this.host.now();
    if (t - this.last < SAMPLE_GAP_MS) return;
    this.last = t;
    this.raw = tiltForScreen({ beta: ev.beta, gamma: ev.gamma }, this.host.screenAngle());
    this.zero ??= this.raw; // the pose you start in is level
    const rel = zeroTilt(this.zero, this.raw);
    this.smoothed = smoothTilt(this.smoothed, clampTilt({ x: deadZone(rel.x), y: deadZone(rel.y) }));
    const k = this.settings().sensitivity;
    this.tilt = { x: this.smoothed.x * k, y: this.smoothed.y * k };
  };

  private readonly onMotion = (e: Event): void => {
    const g = (e as MotionLike).accelerationIncludingGravity;
    if (!g) return;
    const cur = { x: g.x ?? 0, y: g.y ?? 0, z: g.z ?? 0 };
    // every reading, not sampled: a knock lasts a few hundredths of a second
    if (this.prevAccel !== null && !this.host.isHidden()) this.peakJolt = Math.max(this.peakJolt, Math.hypot(cur.x - this.prevAccel.x, cur.y - this.prevAccel.y, cur.z - this.prevAccel.z));
    this.prevAccel = cur;
    const a = dialFromGravity(cur.x, cur.y, cur.z);
    this.dial = a === null ? null : (this.settings().dialInvert ? -a : a);
  };

  takeJolt(): number {
    const j = this.peakJolt;
    this.peakJolt = 0;
    return j;
  }
  private readonly onRotate: Handler = () => { this.zero = null; }; // a turned screen needs a new neutral

  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    this.host.addEventListener("deviceorientation", this.onOrientation);
    this.host.addEventListener("devicemotion", this.onMotion);
    this.host.addEventListener("orientationchange", this.onRotate);
  }
  private unlisten(): void {
    if (!this.listening) return;
    this.listening = false;
    this.prevAccel = null;
    this.peakJolt = 0;
    this.host.removeEventListener("deviceorientation", this.onOrientation);
    this.host.removeEventListener("devicemotion", this.onMotion);
    this.host.removeEventListener("orientationchange", this.onRotate);
  }
}
