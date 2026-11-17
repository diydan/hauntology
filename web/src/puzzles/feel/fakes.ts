import type { HapticName } from "@hauntology/shared/puzzles/haptics";
import type { Tilt } from "@hauntology/shared/puzzles/motion";
import type { SoundName } from "@hauntology/shared/puzzles/sound";
import type { Breath, FeelEvent, Haptics, MicState, Motion, PuzzleFeel, SoundState, Subscribe, Synth, TiltState } from "./types";

const subscribable = (): { subscribe: Subscribe; fire: () => void } => {
  const set = new Set<() => void>();
  return { subscribe: (l) => { set.add(l); return () => { set.delete(l); }; }, fire: () => { for (const l of [...set]) l(); } };
};

/** A motion sensor a test drives by hand. */
export class FakeMotion implements Motion {
  state: TiltState;
  tilt: Tilt = { x: 0, y: 0 };
  dial: number | null = null;
  enableResult: TiltState;
  enabled = 0;
  leveled = 0;
  /** Every `autoEnable` call, as its `fromTap`. */
  autoCalls: boolean[] = [];
  /** The Player's wish for tilt and Touch only, as the settings would say. */
  wish = true;
  touchOnly = false;
  /** An iPhone: asks only from a tap. */
  needsTap = false;
  userOff = false;
  private readonly sub = subscribable();
  subscribe: Subscribe = this.sub.subscribe;
  constructor(initial: TiltState = "off", enableResult: TiltState = "on") { this.state = initial; this.enableResult = enableResult; }
  async enable(): Promise<TiltState> { this.enabled++; this.userOff = false; this.state = this.enableResult; this.sub.fire(); return this.state; }
  async autoEnable(opts: { fromTap: boolean }): Promise<TiltState> {
    this.autoCalls.push(opts.fromTap);
    if (this.touchOnly || !this.wish || this.userOff || this.state !== "off") return this.state;
    if (this.needsTap && !opts.fromTap) return this.state;
    return this.enable();
  }
  disable(): void { this.userOff = true; this.state = "off"; this.tilt = { x: 0, y: 0 }; this.sub.fire(); }
  holdLevel(): void { this.leveled++; this.tilt = { x: 0, y: 0 }; }
  /** The jolt the next `takeJolt` gives (a test sets it, as a knock on the table would). */
  jolt = 0;
  takeJolt(): number { const j = this.jolt; this.jolt = 0; return j; }
  /** Test helpers. */
  setTilt(x: number, y: number): void { this.tilt = { x, y }; }
  setState(state: TiltState): void { this.state = state; this.sub.fire(); }
}

export class FakeHaptics implements Haptics {
  mode: "vibrate" | "visual" = "visual";
  supported = true;
  readonly buzzes: HapticName[] = [];
  attempts = 0;
  hotColds: Array<[number, number]> = [];
  constructor(private readonly emit: (e: FeelEvent) => void = () => {}) {}
  newAttempt(): void { this.attempts++; }
  buzz(name: HapticName): boolean { this.buzzes.push(name); this.emit({ type: "buzz", name }); return true; }
  hotCold(distanceDeg: number, windowDeg: number): number { this.hotColds.push([distanceDeg, windowDeg]); return 800; }
}

export class FakeSynth implements Synth {
  state: SoundState = "on";
  readonly played: SoundName[] = [];
  private readonly sub = subscribable();
  subscribe: Subscribe = this.sub.subscribe;
  constructor(private readonly emit: (e: FeelEvent) => void = () => {}) {}
  async unlock(): Promise<SoundState> { this.state = "on"; this.sub.fire(); return this.state; }
  play(name: SoundName): boolean { this.played.push(name); this.emit({ type: "sound", name, muted: this.state !== "on" }); return this.state === "on"; }
  note(index: 0 | 1 | 2 | 3 | 4): boolean { return this.play(`note${index}` as SoundName); }
}

export class FakeBreath implements Breath {
  state: MicState = "off";
  level = 0;
  blowing = false;
  threshold = 0.08;
  startResult: MicState = "on";
  private readonly sub = subscribable();
  subscribe: Subscribe = this.sub.subscribe;
  async start(): Promise<MicState> { this.state = this.startResult; this.sub.fire(); return this.state; }
  stop(): void { if (this.state === "on") { this.state = "off"; this.sub.fire(); } this.level = 0; this.blowing = false; }
}

export type FakeFeel = PuzzleFeel & Readonly<{ motion: FakeMotion; haptics: FakeHaptics; synth: FakeSynth; breath: FakeBreath; events: FeelEvent[] }>;

/** A whole feel layer for tests: nothing real, everything recorded. */
export function createFakeFeel(opts: { tilt?: TiltState } = {}): FakeFeel {
  const listeners = new Set<(e: FeelEvent) => void>();
  const events: FeelEvent[] = [];
  const emit = (e: FeelEvent): void => { events.push(e); for (const l of [...listeners]) l(e); };
  const motion = new FakeMotion(opts.tilt ?? "off");
  const haptics = new FakeHaptics(emit);
  const synth = new FakeSynth(emit);
  const breath = new FakeBreath();
  return { motion, haptics, synth, breath, events, onEvent: (l) => { listeners.add(l); return () => { listeners.delete(l); }; }, closeLock: () => { breath.stop(); } };
}
