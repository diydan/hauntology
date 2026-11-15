// Safe code: turn the dial to each digit of the code from the plaque you saw, then press Set.
// Drag the dial, or turn on "Twist" and turn the phone like a dial. A click at every digit.
import { h, svg, angleOf, polar } from '../dom.js';

const C = 150;

export default {
  id: 'safe',
  title: 'Safe code',
  blurb: 'Dial the code from the plaque you saw. Turn the dial to a digit under the marker and press Set. Do that for every digit.',
  memory: true,
  renderSight(el, payload) {
    el.replaceChildren(h('p', { class: 'hint' }, 'A brass plaque, scratched with numbers:'),
      h('div', { class: 'digits' }, ...payload.code.map((d) => h('span', {}, String(d)))));
  },
  mount(ctx) {
    const { lock, feel, stage } = ctx;
    const n = lock.view.digits;
    let theta = 0, last = 0, dragging = false, startAng = 0, startTheta = 0, twist = false, dial0 = null, base = 0;
    const code = [];
    const board = svg('svg', { class: 'board', viewBox: '0 0 300 300', style: { width: '82%', margin: '0 auto' }, role: 'application', 'aria-label': 'Safe dial' });
    const dialG = svg('g');
    board.append(svg('circle', { cx: C, cy: C, r: 142, fill: '#1b1e2b', stroke: '#454a60', 'stroke-width': 4 }), dialG,
      svg('polygon', { points: '150,26 137,2 163,2', fill: '#b9a6ff' }));
    for (let i = 0; i < 10; i++) {
      const [x, y] = polar(C, C, 112, i * 36);
      dialG.append(svg('text', { x, y: y + 11, 'text-anchor': 'middle', fill: '#ece8df', 'font-size': 32, 'font-weight': 700 }, String(i)));
      const [x1, y1] = polar(C, C, 138, i * 36 + 18), [x2, y2] = polar(C, C, 130, i * 36 + 18);
      dialG.append(svg('line', { x1, y1, x2, y2, stroke: '#5c6178', 'stroke-width': 3 }));
    }
    const slots = h('div', { class: 'digits' });
    const digitAt = (t) => Math.round((((-t % 360) + 360) % 360) / 36) % 10;
    const readout = h('div', { class: 'muted', style: { textAlign: 'center' } }, '');
    function paint() {
      dialG.setAttribute('transform', `rotate(${theta} ${C} ${C})`);
      slots.replaceChildren(...Array.from({ length: n }, (_, i) => h('span', {}, i < code.length ? String(code[i]) : '·')));
      readout.textContent = `Under the marker: ${digitAt(theta)}`;
    }
    function turnTo(t) {
      theta = t;
      const d = digitAt(theta);
      if (d !== last) { last = d; feel.buzz('click'); feel.sound('click'); }
      paint();
    }
    const local = (e) => { const r = board.getBoundingClientRect(), k = 300 / r.width; return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k }; };
    board.addEventListener('pointerdown', (e) => {
      board.setPointerCapture(e.pointerId);
      const p = local(e);
      dragging = true; startAng = angleOf(C, C, p.x, p.y); startTheta = theta;
    });
    board.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const p = local(e);
      let d = angleOf(C, C, p.x, p.y) - startAng;
      d = ((d + 540) % 360) - 180;
      turnTo(startTheta + d);
    });
    const up = () => { dragging = false; };
    board.addEventListener('pointerup', up);
    board.addEventListener('pointercancel', up);

    const twistBtn = h('button', { onClick: async () => {
      if (!feel.tiltOn) { const r = await feel.enableTilt(); if (r !== 'on') return ctx.toast('Tilt is not available. Drag the dial.', 'bad'); }
      twist = !twist; dial0 = feel.dial; base = theta;
      twistBtn.textContent = twist ? 'Twist: on' : 'Twist: off';
      twistBtn.classList.toggle('primary', twist);
    } }, 'Twist: off');
    ctx.onTick(() => {
      if (!twist || dragging || !feel.tiltOn || feel.dial === null) return;
      if (dial0 === null) { dial0 = feel.dial; base = theta; return; }
      let d = feel.dial - dial0;
      d = ((d + 540) % 360) - 180;
      turnTo(base + d);
    });

    const setBtn = h('button', { class: 'primary', onClick: () => {
      if (code.length >= n) return;
      code.push(digitAt(theta));
      feel.buzz('thunk'); feel.sound('thunk');
      paint();
      if (code.length === n) ctx.submit({ code: code.slice() });
    } }, 'Set');
    const undoBtn = h('button', { onClick: () => { code.pop(); paint(); } }, 'Undo');
    ctx.onWrong(() => { code.length = 0; paint(); });
    stage.append(h('p', { class: 'hint' }, 'Drag around the dial to turn it.'), board, readout, slots,
      h('div', { class: 'row' }, undoBtn, setBtn, twistBtn),
      h('p', { class: 'hint' }, 'Twist needs Tilt on and the phone held upright.'));
    paint();
  },
};
