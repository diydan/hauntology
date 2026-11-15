import { describe, expect, it, vi } from "vitest";
import { BrowserBreath, type MicSession } from "./breath";
import { BrowserHaptics } from "./haptics";
import { BrowserMotion, type MotionHost } from "./motion";
import { BrowserSynth, type AudioLike } from "./synth";
import { DEFAULT_FEEL_SETTINGS, type FeelEvent, type FeelSettings } from "./types";

const settings = (over: Partial<FeelSettings> = {}) => (): FeelSettings => ({ ...DEFAULT_FEEL_SETTINGS, ...over });

// ---------------------------------------------------------------- motion
function motionHost(over: Partial<MotionHost> = {}) {
  const handlers = new Map<string, Set<(e: Event) => void>>();
  const timers: Array<{ id: number; fn: () => void; ms: number; live: boolean }> = [];
  let clock = 1000;
  const host: MotionHost = {
    addEventListener: (t, f) => { (handlers.get(t) ?? handlers.set(t, new Set()).get(t))?.add(f); },
    removeEventListener: (t, f) => { handlers.get(t)?.delete(f); },
    isHidden: () => false,
    screenAngle: () => 0,
    now: () => clock,
    setTimeout: (fn, ms) => { timers.push({ id: timers.length + 1, fn, ms, live: true }); return timers.length; },
    clearTimeout: (id) => { const t = timers[id - 1]; if (t) t.live = false; },
    DeviceOrientationEvent: {},
    ...over,
  };
  const fire = (type: string, props: Record<string, unknown>) => { const e = Object.assign(new Event(type), props); for (const h of handlers.get(type) ?? []) h(e); };
  return {
    host, fire, handlers,
    tick: (ms: number) => { clock += ms; },
    expire: () => { for (const t of timers) if (t.live) { t.live = false; t.fn(); } },
    orientation: (beta: number, gamma: number) => fire("deviceorientation", { alpha: 0, beta, gamma }),
  };
}

describe("BrowserMotion", () => {
  it("turns on once a real reading arrives, with the first pose as neutral", async () => {
    const m = motionHost();
    const motion = new BrowserMotion(m.host, settings());
    const on = motion.enable();
    m.orientation(45, 0);
    expect(await on).toBe("on");
    expect(motion.state).toBe("on");
    m.tick(40); m.orientation(45, 20); // lean right 20 degrees from the starting pose
    expect(motion.tilt.x).toBeGreaterThan(0);
    expect(motion.tilt.x).toBeLessThanOrEqual(20);
    expect(motion.tilt.y).toBe(0);
  });

  it("answers unsupported when no reading ever comes (a desktop) or the API is absent", async () => {
    const m = motionHost();
    const motion = new BrowserMotion(m.host, settings());
    const p = motion.enable();
    m.fire("deviceorientation", { alpha: null, beta: null, gamma: null }); // a desktop fires one empty event
    m.expire();
    expect(await p).toBe("unsupported");
    expect(m.handlers.get("deviceorientation")?.size ?? 0).toBe(0);
    const none = motionHost({ DeviceOrientationEvent: undefined });
    expect(await new BrowserMotion(none.host, settings()).enable()).toBe("unsupported");
  });

  it("asks both permissions inside the tap itself, and reports a denial", async () => {
    const asked: string[] = [];
    const m = motionHost({
      DeviceOrientationEvent: { requestPermission: () => { asked.push("orientation"); return Promise.resolve("denied"); } },
      DeviceMotionEvent: { requestPermission: () => { asked.push("motion"); return Promise.resolve("granted"); } },
    });
    const motion = new BrowserMotion(m.host, settings());
    const p = motion.enable();
    expect(asked).toEqual(["orientation", "motion"]); // both asked before the first await resolves
    expect(await p).toBe("denied");
    expect(motion.state).toBe("denied");
    const throwing = motionHost({ DeviceOrientationEvent: { requestPermission: () => Promise.reject(new Error("no")) } });
    expect(await new BrowserMotion(throwing.host, settings()).enable()).toBe("denied");
  });

  it("does nothing under Touch only, and notifies subscribers when the state changes", async () => {
    const m = motionHost();
    const off = new BrowserMotion(m.host, settings({ touchOnly: true }));
    expect(await off.enable()).toBe("off");
    const motion = new BrowserMotion(m.host, settings());
    const seen: string[] = [];
    const unsub = motion.subscribe(() => seen.push(motion.state));
    const p = motion.enable();
    m.orientation(30, 0);
    await p;
    motion.disable();
    unsub();
    motion.holdLevel();
    expect(seen).toEqual(["on", "off"]);
  });

  it("reads nothing while hidden or face down, at most about 30 times a second, and scales by sensitivity", async () => {
    let hidden = false;
    const m = motionHost({ isHidden: () => hidden });
    const motion = new BrowserMotion(m.host, settings({ sensitivity: 2 }));
    const p = motion.enable();
    m.orientation(45, 0);
    await p;
    m.tick(40); m.orientation(45, 10);
    const a = motion.tilt.x;
    expect(a).toBeGreaterThan(0);
    m.tick(5); m.orientation(45, 40); // too soon: ignored
    expect(motion.tilt.x).toBe(a);
    hidden = true;
    m.tick(40); m.orientation(45, 40);
    expect(motion.tilt.x).toBe(a);
    hidden = false;
    m.tick(40); m.orientation(170, 40); // face down
    expect(motion.tilt.x).toBe(a);
    const single = new BrowserMotion(motionHost().host, settings({ sensitivity: 1 }));
    expect(single.tilt).toEqual({ x: 0, y: 0 });
  });

  it("takes a new neutral on a turned screen and on holdLevel, and reads the twist from gravity", async () => {
    const m = motionHost();
    const motion = new BrowserMotion(m.host, settings({ dialInvert: false }));
    const p = motion.enable();
    m.orientation(45, 0);
    await p;
    m.tick(40); m.orientation(45, 30);
    expect(motion.tilt.x).toBeGreaterThan(0);
    motion.holdLevel();
    expect(motion.tilt).toEqual({ x: 0, y: 0 });
    m.fire("devicemotion", { accelerationIncludingGravity: { x: 9.8, y: 0, z: 0 } });
    expect(motion.dial).toBeCloseTo(90, 5);
    m.fire("devicemotion", { accelerationIncludingGravity: { x: 0, y: 0, z: 9.8 } });
    expect(motion.dial).toBeNull(); // lying flat
    const inv = new BrowserMotion(m.host, settings({ dialInvert: true }));
    const q = inv.enable();
    m.orientation(45, 0);
    await q;
    m.fire("devicemotion", { accelerationIncludingGravity: { x: 9.8, y: 0, z: 0 } });
    expect(inv.dial).toBeCloseTo(-90, 5);
  });
});

// ---------------------------------------------------------------- haptics
describe("BrowserHaptics", () => {
  const make = (over: { vibrate?: (p: readonly number[]) => boolean; settings?: Partial<FeelSettings> } = {}) => {
    let t = 0;
    const events: FeelEvent[] = [];
    const vibrate = vi.fn(over.vibrate ?? (() => true));
    const h = new BrowserHaptics({ vibrate: over.vibrate === undefined && "noVibrate" in over ? undefined : vibrate, now: () => t }, settings(over.settings), (e) => events.push(e));
    return { h, vibrate, events, at: (ms: number) => { t = ms; } };
  };

  it("buzzes the pattern and shows the twin, and stays within the limits", () => {
    const { h, vibrate, events, at } = make();
    expect(h.mode).toBe("vibrate");
    at(0);
    expect(h.buzz("snap")).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([20, 25, 20]);
    expect(events).toEqual([{ type: "buzz", name: "snap" }]);
    at(100);
    expect(h.buzz("snap")).toBe(true);
    at(200);
    expect(h.buzz("tick")).toBe(false); // a fifth pulse in the second
    expect(vibrate).toHaveBeenCalledTimes(2);
    h.newAttempt();
    expect(h.buzz("tick")).toBe(true);
  });

  it("says whether the phone can buzz at all, whatever the setting", () => {
    expect(make().h.supported).toBe(true);
    expect(make({ settings: { hapticMode: "visual" } }).h.supported).toBe(true); // can buzz, but the Player chose the glow
    expect(make({ settings: { hapticMode: "visual" } }).h.mode).toBe("visual");
    expect(new BrowserHaptics({ now: () => 0 }, settings(), () => {}).supported).toBe(false);
  });

  it("does not call vibrate before the page has been touched (the browser would log an error), but still shows the twin", () => {
    let active = false;
    const events: FeelEvent[] = [];
    const vibrate = vi.fn(() => true);
    const h = new BrowserHaptics({ vibrate, now: () => 0, canVibrate: () => active }, settings(), (e) => events.push(e));
    expect(h.buzz("click")).toBe(true);
    expect(vibrate).not.toHaveBeenCalled();
    expect(events).toEqual([{ type: "buzz", name: "click" }]);
    active = true;
    h.newAttempt();
    expect(h.buzz("click")).toBe(true);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("shows only the twin under Touch only, the visual mode and on a phone with no vibration", () => {
    for (const s of [{ touchOnly: true }, { hapticMode: "visual" as const }]) {
      const { h, vibrate, events } = make({ settings: s });
      expect(h.buzz("thunk")).toBe(true);
      expect(vibrate).not.toHaveBeenCalled();
      expect(events).toHaveLength(1);
    }
    const events: FeelEvent[] = [];
    const none = new BrowserHaptics({ now: () => 0 }, settings(), (e) => events.push(e));
    expect(none.mode).toBe("visual");
    expect(none.buzz("click")).toBe(true);
    expect(events).toEqual([{ type: "buzz", name: "click" }]);
  });

  it("pulses hot and cold no faster than its interval, and survives a refused vibration", () => {
    const { h, vibrate, at } = make({ vibrate: () => { throw new Error("refused"); } });
    at(0);
    expect(h.hotCold(30, 10)).toBeGreaterThan(250);
    expect(vibrate).toHaveBeenCalledTimes(1);
    at(100);
    h.hotCold(30, 10);
    expect(vibrate).toHaveBeenCalledTimes(1); // too soon
    at(1000);
    h.hotCold(0, 10);
    expect(vibrate).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------- synth
function fakeAudio(state = "running") {
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = () => ({ gain: param(), frequency: param(), Q: { value: 0 }, type: "", buffer: null as unknown, connect: vi.fn(), start: vi.fn(), stop: vi.fn() });
  const made = { gains: 0, oscillators: 0, sources: 0 };
  const ctx: AudioLike = {
    state, currentTime: 0, sampleRate: 100, destination: {},
    resume: () => Promise.resolve(),
    createGain: () => { made.gains++; return node() as never; },
    createBuffer: (_c, len) => ({ getChannelData: () => new Float32Array(len) }),
    createBufferSource: () => { made.sources++; return node() as never; },
    createBiquadFilter: () => node() as never,
    createOscillator: () => { made.oscillators++; return node() as never; },
  };
  return { ctx, made };
}

describe("BrowserSynth", () => {
  const make = (over: Partial<FeelSettings> = {}, audio: AudioLike | null = fakeAudio().ctx) => {
    const events: FeelEvent[] = [];
    const timers: Array<() => void> = [];
    const synth = new BrowserSynth({ createContext: () => audio, setTimeout: (fn) => { timers.push(fn); return timers.length; }, random: () => 0.5 }, settings(over), (e) => events.push(e));
    return { synth, events, timers };
  };

  it("is silent until a tap unlocks it, and the twin still fires", async () => {
    const { synth, events } = make();
    expect(synth.state).toBe("locked");
    expect(synth.play("click")).toBe(false);
    expect(events).toEqual([{ type: "sound", name: "click", muted: true }]);
    expect(await synth.unlock()).toBe("on");
    expect(synth.play("click")).toBe(true);
    expect(events.at(-1)).toEqual({ type: "sound", name: "click", muted: false });
    expect(synth.note(3)).toBe(true);
    expect(events.at(-1)).toEqual({ type: "sound", name: "note3", muted: false });
  });

  it("plays nothing without the owner's yes or under Touch only, and says unsupported with no audio", async () => {
    const a = make({ soundConsent: false });
    await a.synth.unlock();
    expect(a.synth.play("thunk")).toBe(false);
    const b = make({ touchOnly: true });
    expect(await b.synth.unlock()).toBe("locked");
    const none = make({}, null);
    expect(await none.synth.unlock()).toBe("unsupported");
    expect(none.synth.play("tick")).toBe(false);
  });

  it("never has more than four voices at once, and frees one when a sound ends", async () => {
    const { synth, timers } = make();
    await synth.unlock();
    const results = [1, 2, 3, 4, 5].map(() => synth.play("creak"));
    expect(results).toEqual([true, true, true, true, false]);
    timers[0]?.();
    expect(synth.play("creak")).toBe(true);
  });

  it("notifies subscribers when it unlocks", async () => {
    const { synth } = make();
    const seen: string[] = [];
    synth.subscribe(() => seen.push(synth.state));
    await synth.unlock();
    expect(seen).toEqual(["on"]);
  });
});

// ---------------------------------------------------------------- breath
describe("BrowserBreath", () => {
  function make(open: () => Promise<MicSession>, over: Partial<FeelSettings> = {}) {
    let t = 0;
    const intervals: Array<() => void> = [];
    const breath = new BrowserBreath({ open, now: () => t, setInterval: (fn) => { intervals.push(fn); return intervals.length; }, clearInterval: () => {} }, settings(over));
    return { breath, step: (ms: number) => { t += ms; intervals[0]?.(); } };
  }
  const session = (level: () => number): MicSession & { stopped: number } => {
    const s = { stopped: 0, analyser: { fftSize: 8, getFloatTimeDomainData: (a: Float32Array) => a.fill(level()) }, stop() { s.stopped++; } };
    return s;
  };

  it("hears a sustained breath above the room level, and only loudness numbers are kept", async () => {
    let level = 0.01;
    const s = session(() => level);
    const { breath, step } = make(() => Promise.resolve(s));
    expect(await breath.start()).toBe("on");
    for (let i = 0; i < 20; i++) step(33); // quiet: sets the room level
    expect(breath.blowing).toBe(false);
    level = 0.5;
    for (let i = 0; i < 6; i++) step(33); // 200 ms: not yet
    expect(breath.blowing).toBe(false);
    for (let i = 0; i < 6; i++) step(33);
    expect(breath.blowing).toBe(true);
    expect(breath.level).toBeCloseTo(0.5, 5);
    expect(breath.threshold).toBeGreaterThanOrEqual(0.08);
    breath.stop();
    expect(s.stopped).toBe(1);
    expect([breath.state, breath.level, breath.blowing]).toEqual(["off", 0, false]);
  });

  it("reports a denial, a missing microphone and Touch only", async () => {
    expect(await make(() => Promise.reject(Object.assign(new Error("x"), { name: "NotAllowedError" }))).breath.start()).toBe("denied");
    expect(await make(() => Promise.reject(Object.assign(new Error("x"), { name: "NotFoundError" }))).breath.start()).toBe("unsupported");
    const off = make(() => Promise.resolve(session(() => 0)), { touchOnly: true });
    expect(await off.breath.start()).toBe("off");
  });
});

describe("BrowserBreath and a hidden page", () => {
  function make() {
    let t = 0;
    const s = { stopped: 0, analyser: { fftSize: 8, getFloatTimeDomainData: (a: Float32Array) => a.fill(0.01) }, stop() { s.stopped++; } };
    const watchers = new Set<() => void>();
    const breath = new BrowserBreath({
      open: () => Promise.resolve(s), now: () => t, setInterval: () => 1, clearInterval: () => {},
      onHidden: (fn) => { watchers.add(fn); return () => { watchers.delete(fn); }; },
    }, settings());
    return { breath, s, watchers, hide: () => { for (const w of [...watchers]) w(); }, tick: () => { t += 33; } };
  }

  it("stops listening when the page is hidden, and stops watching once it has stopped", async () => {
    const { breath, s, watchers, hide } = make();
    expect(await breath.start()).toBe("on");
    expect(watchers.size).toBe(1);
    hide();
    expect(breath.state).toBe("off");
    expect(s.stopped).toBe(1);
    expect(watchers.size).toBe(0);
    hide(); // nothing left to stop
    expect(s.stopped).toBe(1);
  });

  it("stops watching when the Player stops it, and watches again when it is started again", async () => {
    const { breath, watchers, s } = make();
    await breath.start();
    breath.stop();
    expect(watchers.size).toBe(0);
    expect(s.stopped).toBe(1);
    expect(await breath.start()).toBe("on");
    expect(watchers.size).toBe(1);
    breath.stop();
  });
});
