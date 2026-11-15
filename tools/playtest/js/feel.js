// The phone "feel" layer: vibration, synthesised sound, tilt (gyroscope) and breath (microphone loudness).
// Every channel is an extra. With "Touch only" on, or on a phone that lacks a channel, the pages still work
// and show a visual twin instead. Mirrors .kiro/specs/puzzles/design.md ("The feel layer").
import {
  HapticLimiter, PATTERNS, pulsesOf, RECIPES, SOUND_CAPS, NOTE_FREQS, hotColdInterval,
  tiltForScreen, zeroTilt, deadZone, clampTilt, smoothTilt, dialFromGravity, blowDetect, BLOW_FLOOR,
} from './core.js';

// ---------------------------------------------------------------- settings
const KEY = 'hw-playtest-v1';
export const DEFAULTS = {
  touchOnly: false, assist: false, hapticMode: 'auto', audioChannel: 'normal', dialInvert: false,
  sensitivity: 1, cap: 25000, delay: 0, skipSight: false, level: 'easy',
};
export function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
export function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } }
export const RESULTS_KEY = 'hw-playtest-results-v1';
export function loadResults() { try { return JSON.parse(localStorage.getItem(RESULTS_KEY) || '[]'); } catch { return []; } }
export function saveResult(r) {
  const all = loadResults();
  all.push(r);
  try { localStorage.setItem(RESULTS_KEY, JSON.stringify(all.slice(-300))); } catch { /* private mode */ }
}

const now = () => performance.now();

// ---------------------------------------------------------------- silent media trick (ignores the ringer switch)
function silentWavUrl() {
  const rate = 8000, n = 4000;
  const buf = new Uint8Array(44 + n).fill(0x80);
  const dv = new DataView(buf.buffer);
  const w = (o, s) => [...s].forEach((c, i) => buf[o + i] = c.charCodeAt(0));
  w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
  w(36, 'data'); dv.setUint32(40, n, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

// ---------------------------------------------------------------- the Feel object
export class Feel {
  /** hooks: { onVisual(name), onSound(name), onChange() } */
  constructor(settings, hooks = {}) {
    this.settings = settings;
    this.hooks = hooks;
    this.limiter = new HapticLimiter();
    this.lastHot = 0;
    this.log = [];
    // sound
    this.ctx = null; this.master = null; this.noise = null; this.voices = 0; this.soundState = 'locked'; this.silentEl = null;
    // motion
    this.tiltState = 'off'; this.tilt = { x: 0, y: 0 }; this.rawTilt = { x: 0, y: 0 }; this.zeroPoint = null;
    this.dial = null; this.rateHz = 0; this.angles = { alpha: null, beta: null, gamma: null }; this.grav = null;
    this._subs = new Set(); this._dialSubs = new Set(); this._evCount = 0; this._rateT = now(); this._lastEv = 0;
    // breath
    this.micState = 'off'; this.level = 0; this.baseline = 0; this._levels = []; this._breathSubs = new Set();
  }
  note(msg) { this.log.push(`${(now() / 1000).toFixed(1)}s ${msg}`); if (this.log.length > 60) this.log.shift(); this.hooks.onChange?.(); }
  changed() { this.hooks.onChange?.(); }

  // ------------------------------------------------------------ haptics
  get hapticsResolved() {
    const m = this.settings.hapticMode;
    if (m === 'visual') return 'visual';
    if (m === 'ios-tick') return 'ios-tick';
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') return 'vibrate';
    return 'visual';
  }
  newAttempt() { this.limiter.reset(); this.lastHot = 0; }
  /** Play a named buzz. Always shows the visual twin; the real buzz only when allowed. */
  buzz(name) {
    const pattern = this.limiter.offer(name, now());
    if (!pattern) return false;
    this.hooks.onVisual?.(name);
    if (this.settings.touchOnly) return true;
    const mode = this.hapticsResolved;
    if (mode === 'vibrate') { try { navigator.vibrate(pattern); } catch { /* ignore */ } }
    else if (mode === 'ios-tick') this._iosTick(pattern);
    return true;
  }
  _iosTick(pattern) {
    if (!this._switch) {
      const label = document.createElement('label');
      label.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      label.append(input);
      document.body.append(label);
      this._switch = label;
    }
    for (const [off] of pulsesOf(pattern)) {
      if (off === 0) this._switch.click(); else setTimeout(() => this._switch.click(), off);
    }
  }
  /** Lock pick hot and cold: call every frame; pulses when the interval for this distance has passed. */
  hotCold(distanceDeg, windowDeg) {
    const interval = hotColdInterval(distanceDeg, windowDeg);
    const t = now();
    if (t - this.lastHot >= interval) {
      this.lastHot = t;
      this.buzz('tick');
      this.sound('tick');
    }
    return interval;
  }

  // ------------------------------------------------------------ sound
  async unlockSound() {
    if (this.settings.touchOnly) return this.soundState;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.soundState = 'unsupported'; this.changed(); return this.soundState; }
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = SOUND_CAPS.masterGain;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    try { await this.ctx.resume(); } catch { /* ignore */ }
    this.applyAudioChannel();
    // a silent one-sample buffer finishes the unlock on iOS
    const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource();
    s.buffer = b; s.connect(this.ctx.destination); s.start(0);
    this.soundState = this.ctx.state === 'running' ? (this.settings.audioChannel === 'media' ? 'media' : 'on') : 'locked';
    this.note(`sound ${this.soundState}`);
    this.changed();
    return this.soundState;
  }
  applyAudioChannel() {
    if (this.settings.audioChannel !== 'media') return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* not supported */ }
    if (!this.silentEl) {
      const a = document.createElement('audio');
      a.src = silentWavUrl(); a.loop = true; a.setAttribute('playsinline', ''); a.volume = 0.01;
      this.silentEl = a;
    }
    this.silentEl.play().catch(() => {});
  }
  /** Play a recipe by name. Returns true when a sound was actually made. */
  sound(name) {
    this.hooks.onSound?.(name);
    if (this.settings.touchOnly || !this.ctx || this.ctx.state !== 'running') return false;
    const rec = RECIPES[name];
    if (!rec || this.voices >= SOUND_CAPS.voices) return false;
    const ctx = this.ctx, t0 = ctx.currentTime;
    this.voices++;
    setTimeout(() => { this.voices = Math.max(0, this.voices - 1); }, rec.ms + 30);
    for (const p of rec.parts) {
      const dur = p.ms / 1000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(p.gain, t0 + Math.min((p.attack || 4) / 1000, dur / 2));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      g.connect(this.master);
      if (p.type === 'noise') {
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const f = ctx.createBiquadFilter();
        f.type = p.filter; f.frequency.setValueAtTime(p.hz, t0); f.Q.value = p.filter === 'bandpass' ? 1.2 : 0.7;
        if (p.hzTo) f.frequency.linearRampToValueAtTime(p.hzTo, t0 + dur);
        src.connect(f); f.connect(g);
        src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.02);
      } else {
        const o = ctx.createOscillator();
        o.type = p.wave;
        o.frequency.setValueAtTime(Math.max(20, p.from), t0);
        if (p.to !== p.from) o.frequency.linearRampToValueAtTime(Math.max(20, p.to), t0 + dur);
        if (p.wobbleHz) {
          const lfo = ctx.createOscillator(), lg = ctx.createGain();
          lfo.frequency.value = p.wobbleHz; lg.gain.value = 6;
          lfo.connect(lg); lg.connect(o.frequency);
          lfo.start(t0); lfo.stop(t0 + dur + 0.02);
        }
        o.connect(g);
        o.start(t0); o.stop(t0 + dur + 0.02);
      }
    }
    return true;
  }
  playNote(i) { return this.sound(`note${i}`); }

  // ------------------------------------------------------------ motion (the gyroscope)
  screenAngle() {
    if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
    return typeof window.orientation === 'number' ? (window.orientation + 360) % 360 : 0;
  }
  /** Ask for tilt. Must be called from a tap. Resolves 'on' | 'denied' | 'unsupported'. */
  async enableTilt() {
    if (this.settings.touchOnly) return this.tiltState;
    if (this.tiltState === 'on') return 'on';
    const DO = window.DeviceOrientationEvent, DM = window.DeviceMotionEvent;
    if (!DO) { this.tiltState = 'unsupported'; this.changed(); return this.tiltState; }
    try {
      const reqs = [];
      if (typeof DO.requestPermission === 'function') reqs.push(DO.requestPermission());
      if (DM && typeof DM.requestPermission === 'function') reqs.push(DM.requestPermission());
      if (reqs.length) {
        const res = await Promise.all(reqs);
        if (res.some((r) => r !== 'granted')) { this.tiltState = 'denied'; this.note('motion permission denied'); this.changed(); return this.tiltState; }
      }
    } catch (err) {
      this.tiltState = 'denied'; this.note(`motion permission error: ${err?.message || err}`); this.changed(); return this.tiltState;
    }
    this._listen();
    const got = await new Promise((res) => {
      const t = setTimeout(() => res(false), 1500);
      this._first = () => { clearTimeout(t); res(true); };
    });
    this._first = null;
    if (!got) { this._unlisten(); this.tiltState = 'unsupported'; this.note('no motion readings arrived'); }
    else this.tiltState = 'on';
    this.changed();
    return this.tiltState;
  }
  disableTilt() { this._unlisten(); this.tiltState = 'off'; this.tilt = { x: 0, y: 0 }; this.zeroPoint = null; this.changed(); }
  _listen() {
    if (this._on) return;
    this._on = true;
    this._oHandler = (e) => this._orient(e);
    this._mHandler = (e) => this._motion(e);
    this._vis = () => { if (document.hidden) this.tilt = { x: 0, y: 0 }; };
    this._rot = () => { this.zeroPoint = null; };
    window.addEventListener('deviceorientation', this._oHandler);
    window.addEventListener('devicemotion', this._mHandler);
    document.addEventListener('visibilitychange', this._vis);
    window.addEventListener('orientationchange', this._rot);
    screen.orientation?.addEventListener?.('change', this._rot);
  }
  _unlisten() {
    if (!this._on) return;
    this._on = false;
    window.removeEventListener('deviceorientation', this._oHandler);
    window.removeEventListener('devicemotion', this._mHandler);
    document.removeEventListener('visibilitychange', this._vis);
    window.removeEventListener('orientationchange', this._rot);
    screen.orientation?.removeEventListener?.('change', this._rot);
  }
  _orient(e) {
    if (e.beta == null || e.gamma == null) return;
    const t = now();
    this._first?.();
    this._evCount++;
    if (t - this._rateT >= 1000) { this.rateHz = Math.round((this._evCount * 1000) / (t - this._rateT)); this._evCount = 0; this._rateT = t; }
    this.angles = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
    if (document.hidden || Math.abs(e.beta) > 150) return; // hidden or face down: stop reading
    if (t - this._lastEv < 33) return; // at most about 30 samples a second
    this._lastEv = t;
    const raw = tiltForScreen({ beta: e.beta, gamma: e.gamma }, this.screenAngle());
    this.rawTilt = raw;
    if (!this.zeroPoint) this.zeroPoint = raw; // the pose you start in is level, until you tap "Hold level"
    const rel = zeroTilt(this.zeroPoint, raw);
    const dz = { x: deadZone(rel.x), y: deadZone(rel.y) };
    this.tilt = smoothTilt(this.tilt, clampTilt(dz));
    for (const cb of this._subs) cb(this.tilt);
  }
  _motion(e) {
    const g = e.accelerationIncludingGravity;
    if (!g) return;
    this.grav = { x: g.x, y: g.y, z: g.z };
    const sign = this.settings.dialInvert ? -1 : 1;
    const a = dialFromGravity(g.x, g.y, g.z);
    this.dial = a === null ? null : sign * a;
    for (const cb of this._dialSubs) cb(this.dial);
  }
  /** "Hold level": the angle you hold the phone at now becomes neutral. */
  holdLevel() { this.zeroPoint = this.rawTilt; this.tilt = { x: 0, y: 0 }; this.note('hold level'); }
  onTilt(cb) { this._subs.add(cb); return () => this._subs.delete(cb); }
  onDial(cb) { this._dialSubs.add(cb); return () => this._dialSubs.delete(cb); }
  get tiltOn() { return this.tiltState === 'on' && !this.settings.touchOnly; }
  /** Tilt scaled by the sensitivity setting. */
  get tiltScaled() { const k = this.settings.sensitivity; return { x: this.tilt.x * k, y: this.tilt.y * k }; }

  // ------------------------------------------------------------ breath (the microphone)
  /** Ask for the microphone. Must be called from a tap. Only a loudness number is ever computed. */
  async startBreath() {
    if (this.settings.touchOnly) return this.micState;
    if (this.micState === 'on') return 'on';
    if (!navigator.mediaDevices?.getUserMedia) { this.micState = 'unsupported'; this.changed(); return this.micState; }
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (err) {
      this.micState = 'denied'; this.note(`mic ${err?.name || 'denied'}`); this.changed(); return this.micState;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    this._mctx = new AC();
    try { await this._mctx.resume(); } catch { /* ignore */ }
    const src = this._mctx.createMediaStreamSource(this._stream);
    this._an = this._mctx.createAnalyser();
    this._an.fftSize = 1024;
    src.connect(this._an); // not connected to the speakers, never recorded
    const buf = new Float32Array(this._an.fftSize);
    this._levels = []; this.baseline = 0;
    const t0 = now();
    this._timer = setInterval(() => {
      this._an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const level = Math.sqrt(sum / buf.length);
      const t = now();
      this.level = level;
      if (t - t0 < 600) this.baseline = Math.max(this.baseline, level); // the first 0.6 s is the room
      this._levels.push({ t, level });
      while (this._levels.length && t - this._levels[0].t > 1500) this._levels.shift();
      const blowing = blowDetect(this._levels, this.baseline);
      for (const cb of this._breathSubs) cb(level, blowing);
    }, 33);
    this.micState = 'on';
    this.note('mic on (loudness only)');
    this.changed();
    return 'on';
  }
  stopBreath() {
    clearInterval(this._timer); this._timer = null;
    this._stream?.getTracks().forEach((t) => t.stop()); this._stream = null;
    try { this._mctx?.close(); } catch { /* ignore */ }
    this._mctx = null; this._an = null;
    if (this.micState === 'on') { this.micState = 'off'; this.note('mic off'); this.changed(); }
    this.level = 0; this._levels = [];
  }
  onBreath(cb) { this._breathSubs.add(cb); return () => this._breathSubs.delete(cb); }
  get blowThreshold() { return Math.max(BLOW_FLOOR, 3 * this.baseline); }

  // ------------------------------------------------------------ summary for the status chips
  summary() {
    return {
      tilt: this.settings.touchOnly ? 'off' : this.tiltState,
      buzz: this.settings.touchOnly ? 'visual' : this.hapticsResolved,
      sound: this.settings.touchOnly ? 'off' : this.soundState,
      mic: this.settings.touchOnly ? 'off' : this.micState,
    };
  }
  /** Stop everything a closing Lock should stop. */
  closeLock() { this.stopBreath(); this._subs.clear(); this._dialSubs.clear(); this._breathSubs.clear(); }
}

export { PATTERNS, NOTE_FREQS };
