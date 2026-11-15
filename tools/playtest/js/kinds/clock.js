// Clock time: set the hands to the time on the stopped clock you saw in an earlier room.
// Drag a hand, or turn on "Twist" and turn the phone like a dial. Five-minute steps with a tick each.
import { h, svg, angleOf, polar } from '../dom.js';

const C = 150;

function face() {
  const g = svg('g');
  g.append(svg('circle', { cx: C, cy: C, r: 138, fill: '#1b1e2b', stroke: '#454a60', 'stroke-width': 4 }));
  for (let i = 0; i < 60; i++) {
    const big = i % 5 === 0;
    const [x1, y1] = polar(C, C, big ? 114 : 124, i * 6), [x2, y2] = polar(C, C, 132, i * 6);
    g.append(svg('line', { x1, y1, x2, y2, stroke: big ? '#ece8df' : '#5c6178', 'stroke-width': big ? 3 : 1.5 }));
  }
  for (let n = 1; n <= 12; n++) {
    const [x, y] = polar(C, C, 94, n * 30);
    g.append(svg('text', { x, y: y + 8, 'text-anchor': 'middle', fill: '#ece8df', 'font-size': 24, 'font-weight': 650 }, String(n)));
  }
  return g;
}
function hands(hh, mm, hourCol = '#ece8df', minCol = '#b9a6ff') {
  const g = svg('g');
  const ha = (hh % 12) * 30 + mm * 0.5, ma = mm * 6;
  const [hx, hy] = polar(C, C, 66, ha), [mx, my] = polar(C, C, 104, ma);
  g.append(svg('line', { x1: C, y1: C, x2: hx, y2: hy, stroke: hourCol, 'stroke-width': 10, 'stroke-linecap': 'round' }));
  g.append(svg('line', { x1: C, y1: C, x2: mx, y2: my, stroke: minCol, 'stroke-width': 6, 'stroke-linecap': 'round' }));
  g.append(svg('circle', { cx: C, cy: C, r: 8, fill: '#ece8df' }));
  return { g, ha, ma };
}

export default {
  id: 'clock',
  title: 'Clock time',
  blurb: 'Set the clock to the time the stopped clock showed. Drag the short hand (hours) or the long hand (minutes).',
  memory: true,
  renderSight(el, payload) {
    const s = svg('svg', { viewBox: '0 0 300 300', width: '70%', role: 'img', 'aria-label': `A stopped clock showing ${payload.h}:${String(payload.m).padStart(2, '0')}` });
    s.append(face(), hands(payload.h, payload.m).g);
    el.replaceChildren(h('p', { class: 'hint' }, 'A clock, stopped:'), s, h('p', { class: 'muted' }, `${payload.h}:${String(payload.m).padStart(2, '0')}`));
  },
  mount(ctx) {
    const { feel, stage } = ctx;
    let hh = 12, mm = 0, dragging = null, hand = 'minute', twist = false, dial0 = null, base = 0;
    const board = svg('svg', { class: 'board', viewBox: '0 0 300 300', style: { width: '86%', margin: '0 auto' }, role: 'application', 'aria-label': 'Clock to set' });
    const handsG = svg('g');
    board.append(face(), handsG);
    const readout = h('div', { class: 'big', style: { fontSize: '30px' } }, '12:00');
    const handSeg = h('div', { class: 'seg' },
      ...['hour', 'minute'].map((k) => h('button', { 'data-k': k, onClick: () => { hand = k; recapture(); paint(); } }, k)));
    const twistBtn = h('button', { onClick: async () => {
      if (!feel.tiltOn) { const r = await feel.enableTilt(); if (r !== 'on') return ctx.toast('Tilt is not available. Drag the hands.', 'bad'); }
      twist = !twist; recapture(); paint();
    } }, 'Twist: off');

    function recapture() { dial0 = feel.dial; base = hand === 'minute' ? mm * 6 : (hh % 12) * 30; }
    function paint() {
      handsG.replaceChildren(hands(hh, mm).g);
      readout.textContent = `${hh}:${String(mm).padStart(2, '0')}`;
      for (const b of handSeg.children) b.setAttribute('aria-pressed', String(b.dataset.k === hand));
      twistBtn.textContent = twist ? `Twist: turning the ${hand} hand` : 'Twist: off';
      twistBtn.classList.toggle('primary', twist);
    }
    function setFromAngle(which, a) {
      let changed = false;
      if (which === 'minute') {
        const m = (Math.round(a / 30) * 5) % 60;
        if (m !== mm) { mm = m; changed = true; }
      } else {
        let hr = Math.round(((a - mm * 0.5 + 360) % 360) / 30) % 12;
        if (hr === 0) hr = 12;
        if (hr !== hh) { hh = hr; changed = true; }
      }
      if (changed) { feel.buzz('tick'); feel.sound('tick'); paint(); }
    }
    function pickHand(a, r) {
      const diff = (x, y) => { const d = Math.abs(x - y) % 360; return d > 180 ? 360 - d : d; };
      const dh = diff(a, (hh % 12) * 30 + mm * 0.5) - (r < 70 ? 25 : 0), dm = diff(a, mm * 6);
      return dh < dm ? 'hour' : 'minute';
    }
    const local = (e) => {
      const r = board.getBoundingClientRect(), k = 300 / r.width;
      return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
    };
    board.addEventListener('pointerdown', (e) => {
      board.setPointerCapture(e.pointerId);
      const p = local(e), a = angleOf(C, C, p.x, p.y), r = Math.hypot(p.x - C, p.y - C);
      dragging = pickHand(a, r); hand = dragging; recapture();
      setFromAngle(dragging, a);
    });
    board.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const p = local(e);
      setFromAngle(dragging, angleOf(C, C, p.x, p.y));
    });
    const up = () => { dragging = null; recapture(); paint(); };
    board.addEventListener('pointerup', up);
    board.addEventListener('pointercancel', up);

    ctx.onTick(() => {
      if (!twist || dragging || !feel.tiltOn) return;
      if (feel.dial === null) return;
      if (dial0 === null) { recapture(); return; }
      let d = feel.dial - dial0;
      d = ((d + 540) % 360) - 180;
      setFromAngle(hand, (((base + d) % 360) + 360) % 360);
    });
    stage.append(
      h('p', { class: 'hint' }, 'Hold a hand and drag around the dial.'),
      board, readout,
      h('div', { class: 'row' }, handSeg, twistBtn),
      h('button', { class: 'primary', style: { width: '100%' }, onClick: () => ctx.submit({ h: hh, m: mm }) }, 'Set this time'),
      h('p', { class: 'hint' }, 'Twist needs Tilt on and the phone held upright, like a steering wheel.'));
    paint();
  },
};
