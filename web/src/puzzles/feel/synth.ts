import { NOTE_FREQS, RECIPES, SOUND_CAPS, type SoundName, type SoundPart } from "@hauntology/shared/puzzles/sound";
import type { FeelEvent, FeelSettings, SoundState, Subscribe, Synth } from "./types";

/** The slice of Web Audio the synthesiser uses, so a test can hand in a fake context. */
export interface AudioLike {
  readonly state: string;
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: unknown;
  resume(): Promise<void>;
  createGain(): GainLike;
  createBuffer(channels: number, length: number, rate: number): { getChannelData(c: number): Float32Array };
  createBufferSource(): { buffer: unknown; connect(n: unknown): void; start(when?: number, offset?: number): void; stop(when?: number): void };
  createBiquadFilter(): { type: string; frequency: ParamLike; Q: { value: number }; connect(n: unknown): void };
  createOscillator(): { type: string; frequency: ParamLike; connect(n: unknown): void; start(when?: number): void; stop(when?: number): void };
}
interface ParamLike { value: number; setValueAtTime(v: number, t: number): unknown; linearRampToValueAtTime(v: number, t: number): unknown; exponentialRampToValueAtTime(v: number, t: number): unknown }
interface GainLike { gain: ParamLike; connect(n: unknown): void }

export type SynthHost = Readonly<{
  /** Make an audio context, or null when the browser has none. Called from a tap. */
  createContext(): AudioLike | null;
  setTimeout(fn: () => void, ms: number): number;
  random(): number;
}>;

/**
 * Puzzle sounds from the recipes in `shared`, synthesised: no file, no licence, no size. Plays only after the owner's
 * yes and a tap that unlocked audio, never more than four voices, never louder than half. A sound that is not heard
 * still fires its twin event, so a muted phone shows what it would have played.
 */
export class BrowserSynth implements Synth {
  state: SoundState = "locked";
  private ctx: AudioLike | null = null;
  private master: GainLike | null = null;
  private noise: unknown = null;
  private voices = 0;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly host: SynthHost, private readonly settings: () => FeelSettings, private readonly emit: (e: FeelEvent) => void) {}

  subscribe: Subscribe = (listener) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(state: SoundState): SoundState { if (this.state !== state) { this.state = state; for (const l of [...this.listeners]) l(); } return state; }

  async unlock(): Promise<SoundState> {
    if (this.settings().touchOnly) return this.state;
    if (!this.ctx) {
      const ctx = this.host.createContext();
      if (!ctx) return this.set("unsupported");
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = SOUND_CAPS.masterGain;
      this.master.connect(ctx.destination);
      const len = Math.max(1, Math.floor(ctx.sampleRate));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = this.host.random() * 2 - 1;
      this.noise = buf;
    }
    try { await this.ctx.resume(); } catch { /* the next tap tries again */ }
    return this.set(this.ctx.state === "running" ? "on" : "locked");
  }

  play(name: SoundName): boolean {
    const heard = this.make(name);
    this.emit({ type: "sound", name, muted: !heard });
    return heard;
  }
  note(index: 0 | 1 | 2 | 3 | 4): boolean {
    return this.play(`note${index}` as SoundName);
  }

  private make(name: SoundName): boolean {
    const ctx = this.ctx;
    const master = this.master;
    const s = this.settings();
    if (s.touchOnly || !s.soundConsent || !ctx || !master || ctx.state !== "running" || this.voices >= SOUND_CAPS.voices) return false;
    const rec = RECIPES[name];
    this.voices++;
    this.host.setTimeout(() => { this.voices = Math.max(0, this.voices - 1); }, rec.ms + 30);
    const t0 = ctx.currentTime;
    for (const part of rec.parts) this.part(ctx, master, part, t0);
    return true;
  }

  private part(ctx: AudioLike, master: GainLike, p: SoundPart, t0: number): void {
    const dur = p.ms / 1000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(p.gain, t0 + Math.min((p.attack ?? 4) / 1000, dur / 2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(master);
    if (p.type === "noise") {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = p.filter;
      f.frequency.setValueAtTime(p.hz, t0);
      if (p.hzTo !== undefined) f.frequency.linearRampToValueAtTime(p.hzTo, t0 + dur);
      f.Q.value = p.filter === "bandpass" ? 1.2 : 0.7;
      src.connect(f);
      f.connect(g);
      src.start(t0, this.host.random() * 0.5);
      src.stop(t0 + dur + 0.02);
      return;
    }
    const o = ctx.createOscillator();
    o.type = p.wave;
    o.frequency.setValueAtTime(Math.max(20, p.from), t0);
    if (p.to !== p.from) o.frequency.linearRampToValueAtTime(Math.max(20, p.to), t0 + dur);
    if (p.wobbleHz !== undefined) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = p.wobbleHz;
      lg.gain.value = 6;
      lfo.connect(lg);
      lg.connect(o.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.02);
    }
    o.connect(g);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
}

export { NOTE_FREQS };
