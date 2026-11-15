// The device side of an effect: play a sound, a buzz, a light or an identify card, locally or when pushed.
// Sound needs the owner's tap (Allow sound) first. A buzz always has a visual twin. Light obeys the light rules
// and is skipped for a Player who prefers reduced motion. Every call returns { status, reason }.
import { expandFx } from './protocol.js';
import { lightPlan, lightKeyframes } from './light.js';

export class FxPlayer {
  /** opts: { feel, doc, reduced() -> boolean, getName() -> string } */
  constructor({ feel, doc = document, reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches, getName = () => 'This device' }) {
    this.feel = feel; this.doc = doc; this.reduced = reduced; this.getName = getName;
    this.lightEl = null;
  }

  /** Play every part of an effect now. Parts with a delay start later; the result reflects the first parts' start. */
  async play(fx) {
    this.feel.newAttempt();
    const parts = expandFx(fx);
    const results = [];
    for (const part of parts) {
      if (part.delayMs > 0) setTimeout(() => this.part(part), part.delayMs);
      else results.push(this.part(part));
    }
    return this.summary(results.length ? results : [{ status: 'played' }]);
  }
  summary(results) {
    const played = results.find((r) => r.status === 'played');
    if (played) { const note = results.find((r) => r.reason && r.status === 'played'); return { status: 'played', reason: note?.reason || '' }; }
    const first = results[0];
    return { status: first.status, reason: first.reason || '' };
  }
  part(p) {
    switch (p.kind) {
      case 'sound': return this.sound(p.name);
      case 'buzz': return this.buzz(p.name);
      case 'light': return this.light(p.name, p.ms);
      case 'identify': return this.identify(p.ms);
      default: return { status: 'skipped', reason: 'unknown' };
    }
  }
  sound(name) {
    const f = this.feel;
    if (!f.ctx || f.ctx.state !== 'running') { f.hooks.onSound?.(name); return { status: 'blocked', reason: 'sound_locked' }; }
    return f.sound(name) ? { status: 'played' } : { status: 'blocked', reason: 'voices_full' };
  }
  buzz(name) {
    const f = this.feel;
    const mode = f.hapticsResolved;
    const accepted = f.buzz(name);
    if (!accepted) return { status: 'skipped', reason: 'buzz_limit' };
    return { status: 'played', reason: mode === 'visual' ? 'visual_only' : '' };
  }
  light(name, ms) {
    if (this.reduced()) return { status: 'skipped', reason: 'reduced_motion' };
    const plan = lightPlan(name, ms);
    if (!plan) return { status: 'skipped', reason: 'unknown' };
    this.lightEl?.remove();
    const el = this.doc.createElement('div');
    el.className = 'lightfx';
    el.style.cssText = 'position:fixed;inset:0;z-index:100;pointer-events:none;background:rgb(0,0,0)';
    this.doc.body.append(el);
    this.lightEl = el;
    const { duration, frames } = lightKeyframes(plan);
    const done = () => { if (this.lightEl === el) this.lightEl = null; el.remove(); };
    if (typeof el.animate === 'function') {
      const a = el.animate(frames, { duration, easing: 'linear', fill: 'forwards' });
      a.onfinish = done;
    }
    setTimeout(done, duration + 300);
    return { status: 'played' };
  }
  identify(ms = 3000) {
    const el = this.doc.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:110;background:#14151c;color:#ece8df;display:grid;place-items:center;font:700 14vw/1.1 system-ui,sans-serif;text-align:center;padding:20px;pointer-events:none';
    el.textContent = this.getName();
    this.doc.body.append(el);
    setTimeout(() => el.remove(), ms);
    return { status: 'played' };
  }
}
