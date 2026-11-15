// Lock pick: hold the tension, tilt (or slide) the pick, feel for each pin's hidden sweet spot.
import { h } from '../dom.js';
import { tiltToPosition } from '../core.js';

export default {
  id: 'lockpick',
  title: 'Lock pick',
  blurb: 'Hold Tension, then move the pick. The phone buzzes faster as you get near each pin. Hold it still in the sweet spot to set the pin.',
  memory: false,
  mount(ctx) {
    const { lock, feel, stage } = ctx;
    const v = lock.view;
    let pos = 0, tension = false, cur = 0, dwell = 0, inWin = false;
    const sets = [];

    const pins = h('div', { class: 'pins' }, ...Array.from({ length: v.pins }, () => h('div', { class: 'pin' }, h('i'))));
    const heat = h('div', { class: 'heat' }, '');
    const pickEl = h('div', { class: 'pick' });
    const track = h('div', { class: 'track' }, pickEl);
    const slider = h('input', { type: 'range', class: 'wide', min: v.range[0], max: v.range[1], step: 0.5, value: 0, 'aria-label': 'Pick position' });
    const hold = h('button', { class: 'hold', 'aria-pressed': 'false' }, 'Tension (hold)');

    const setTension = (on) => { tension = on; hold.classList.toggle('down', on); hold.setAttribute('aria-pressed', String(on)); if (!on) { dwell = 0; inWin = false; } };
    hold.addEventListener('pointerdown', (e) => { hold.setPointerCapture(e.pointerId); setTension(true); });
    hold.addEventListener('pointerup', () => setTension(false));
    hold.addEventListener('pointercancel', () => setTension(false));
    // Touch path: touching the slider is the tension, so one finger is enough.
    slider.addEventListener('pointerdown', () => setTension(true));
    slider.addEventListener('pointerup', () => setTension(false));
    slider.addEventListener('pointercancel', () => setTension(false));
    slider.addEventListener('input', () => { pos = Number(slider.value); });

    stage.append(
      h('p', { class: 'hint' }, 'Pins set in order, left to right.'),
      pins, heat, track, slider, hold,
      h('p', { class: 'hint' }, 'Tilt on: lean the phone to move the pick while you hold Tension. Tilt off: drag the slider.'));

    const pinEls = [...pins.children];
    const label = (d) => (d < v.windowDeg / 2 ? 'hot' : d < 14 ? 'warm' : d < 28 ? 'cool' : 'cold');

    ctx.onTick((t, dt) => {
      if (feel.tiltOn) {
        if (tension) { pos = tiltToPosition(feel.tiltScaled.x, v.range[0], v.range[1]); slider.value = pos; }
      }
      pickEl.style.left = `${((pos - v.range[0]) / (v.range[1] - v.range[0])) * 100}%`;
      if (cur >= v.pins) return;
      pinEls.forEach((p, i) => { p.classList.toggle('cur', i === cur); p.classList.toggle('set', i < cur); });
      if (!tension) { heat.textContent = 'Hold Tension'; return; }
      const d = Math.abs(pos - v.centers[cur]);
      const inside = d <= v.windowDeg / 2;
      heat.textContent = label(d);
      if (inside && !inWin) { feel.buzz('click'); feel.sound('click'); }
      inWin = inside;
      if (inside) {
        feel.hotCold(0, v.windowDeg); // inside the window the interval is its shortest
        dwell += dt;
        if (dwell >= v.dwellMs) {
          sets.push({ pin: cur, atDeg: Math.round(pos * 10) / 10, atMs: Math.round(ctx.elapsed()) });
          feel.buzz('thunk'); feel.sound('thunk');
          cur++; dwell = 0; inWin = false;
          pinEls.forEach((p, i) => { p.classList.toggle('set', i < cur); p.classList.toggle('cur', i === cur); });
          if (cur >= v.pins) { setTension(false); ctx.submit({ sets }); }
        }
      } else {
        dwell = 0;
        feel.hotCold(d, v.windowDeg);
      }
    });
    ctx.onWrong(() => { cur = 0; sets.length = 0; dwell = 0; });
  },
};
