import { BLOW_FLOOR, blowDetect, type LoudnessSample } from "@hauntology/shared/puzzles/blow";
import type { Breath, FeelSettings, MicState, Subscribe } from "./types";

export interface AnalyserLike { fftSize: number; getFloatTimeDomainData(a: Float32Array): void }
export interface MicSession { analyser: AnalyserLike; stop(): void }

export type BreathHost = Readonly<{
  /** Open the microphone with echo cancellation, noise suppression and gain control off. Rejects when refused. Called from a tap. */
  open(): Promise<MicSession>;
  now(): number;
  setInterval(fn: () => void, ms: number): number;
  clearInterval(id: number): void;
  /** Call `fn` when the page is hidden (a tab switch, a locked screen); returns a function that stops listening. */
  onHidden?: ((fn: () => void) => () => void) | undefined;
}>;

const WINDOW_MS = 1500;
const ROOM_MS = 600; // the first 0.6 s sets the room level

/**
 * Breath from loudness numbers only. The analyser gives one loudness number per frame; no audio is stored,
 * recorded, played back or sent, and nothing leaves this file but `level` and `blowing`.
 */
export class BrowserBreath implements Breath {
  state: MicState = "off";
  level = 0;
  blowing = false;
  private baseline = 0;
  private samples: LoudnessSample[] = [];
  private session: MicSession | null = null;
  private timer: number | null = null;
  private unwatch: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly host: BreathHost, private readonly settings: () => FeelSettings) {}

  get threshold(): number { return Math.max(BLOW_FLOOR, 3 * this.baseline); }
  subscribe: Subscribe = (listener) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(state: MicState): MicState { if (this.state !== state) { this.state = state; for (const l of [...this.listeners]) l(); } return state; }

  async start(): Promise<MicState> {
    if (this.settings().touchOnly) return this.state;
    if (this.state === "on") return "on";
    try {
      this.session = await this.host.open();
    } catch (err) {
      return this.set((err as { name?: string })?.name === "NotFoundError" ? "unsupported" : "denied");
    }
    this.unwatch = this.host.onHidden?.(() => this.stop()) ?? null; // listening stops when the page is hidden
    const analyser = this.session.analyser;
    const buf = new Float32Array(analyser.fftSize);
    const t0 = this.host.now();
    this.samples = [];
    this.baseline = 0;
    this.timer = this.host.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += (buf[i] as number) ** 2;
      const level = Math.sqrt(sum / buf.length);
      const t = this.host.now();
      this.level = level;
      if (t - t0 < ROOM_MS) this.baseline = Math.max(this.baseline, level);
      this.samples.push({ t, level });
      while (this.samples.length > 0 && t - (this.samples[0] as LoudnessSample).t > WINDOW_MS) this.samples.shift();
      this.blowing = blowDetect(this.samples, this.baseline);
    }, 33);
    return this.set("on");
  }

  stop(): void {
    this.unwatch?.();
    this.unwatch = null;
    if (this.timer !== null) this.host.clearInterval(this.timer);
    this.timer = null;
    this.session?.stop();
    this.session = null;
    this.samples = [];
    this.level = 0;
    this.blowing = false;
    if (this.state === "on") this.set("off");
  }
}
