// Cut wires: join each cut end to the terminal that matches its place in the fuse box you saw earlier.
// Colour is never the only signal: each wire also has its own dash pattern and end shape.
import { h, svg } from '../dom.js';

export const STYLES = [
  { name: 'red circle', color: '#ff6b6b', dash: '', shape: 'circle' },
  { name: 'blue square', color: '#6bb6ff', dash: '10 6', shape: 'square' },
  { name: 'green triangle', color: '#6be39a', dash: '2 7', shape: 'triangle' },
  { name: 'yellow diamond', color: '#ffd86b', dash: '14 5 3 5', shape: 'diamond' },
  { name: 'violet cross', color: '#c49bff', dash: '26 6', shape: 'cross' },
  { name: 'white hexagon', color: '#e8e8e8', dash: '4 4', shape: 'hex' },
];

export function shapeEl(shape, cx, cy, r, fill) {
  const pts = (arr) => arr.map(([x, y]) => `${(cx + x * r).toFixed(1)},${(cy + y * r).toFixed(1)}`).join(' ');
  switch (shape) {
    case 'square': return svg('rect', { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r, rx: 3, fill });
    case 'triangle': return svg('polygon', { points: pts([[0, -1.1], [1, 0.8], [-1, 0.8]]), fill });
    case 'diamond': return svg('polygon', { points: pts([[0, -1.2], [1, 0], [0, 1.2], [-1, 0]]), fill });
    case 'cross': return svg('polygon', { points: pts([[-0.35, -1], [0.35, -1], [0.35, -0.35], [1, -0.35], [1, 0.35], [0.35, 0.35], [0.35, 1], [-0.35, 1], [-0.35, 0.35], [-1, 0.35], [-1, -0.35], [-0.35, -0.35]]), fill });
    case 'hex': return svg('polygon', { points: pts([[1, 0], [0.5, 0.87], [-0.5, 0.87], [-1, 0], [-0.5, -0.87], [0.5, -0.87]]), fill });
    default: return svg('circle', { cx, cy, r, fill });
  }
}

export default {
  id: 'wires',
  title: 'Cut wires',
  blurb: 'Join every cut wire to the numbered terminal where it sat in the fuse box. Match by colour, pattern and shape.',
  memory: true,
  renderSight(el, payload) {
    el.replaceChildren(h('p', { class: 'hint' }, 'The fuse box, top to bottom:'));
    const box = svg('svg', { viewBox: `0 0 240 ${payload.order.length * 44 + 8}`, width: '100%', role: 'img', 'aria-label': 'Fuse box wire order' });
    payload.order.forEach((w, i) => {
      const y = 26 + i * 44, st = STYLES[w];
      box.append(svg('text', { x: 14, y: y + 6, fill: '#8e8c86', 'font-size': 18 }, String(i + 1)));
      box.append(svg('line', { x1: 40, y1: y, x2: 200, y2: y, stroke: st.color, 'stroke-width': 7, 'stroke-dasharray': st.dash, 'stroke-linecap': 'round' }));
      box.append(shapeEl(st.shape, 218, y, 10, st.color));
    });
    el.append(box);
  },
  mount(ctx) {
    const { lock, feel, stage } = ctx;
    const n = lock.view.n, ids = lock.view.leftOrder;
    const H = 70 + n * 62, W = 340;
    const ys = (i) => 50 + i * ((H - 100) / (n - 1));
    const conn = new Map(); // wire id -> terminal index
    const board = svg('svg', { class: 'board', viewBox: `0 0 ${W} ${H}`, role: 'application', 'aria-label': 'Wires board' });
    const lines = svg('g'), handles = svg('g'), terms = svg('g'), drag = svg('g');
    board.append(lines, terms, handles, drag);

    ids.forEach((_, ti) => { // terminals on the right, numbered, no colour
      terms.append(svg('circle', { cx: 290, cy: ys(ti), r: 22, fill: '#1f2230', stroke: '#454a60', 'stroke-width': 2 }));
      terms.append(svg('text', { x: 290, y: ys(ti) + 7, 'text-anchor': 'middle', fill: '#ece8df', 'font-size': 20, 'font-weight': 700 }, String(ti + 1)));
    });
    ids.forEach((w, li) => {
      const st = STYLES[w];
      const g = svg('g', { 'data-w': w, role: 'button', 'aria-label': `Wire ${st.name}` });
      g.append(svg('circle', { cx: 50, cy: ys(li), r: 27, fill: '#171923', stroke: st.color, 'stroke-width': 2.5 }));
      g.append(shapeEl(st.shape, 50, ys(li), 13, st.color));
      handles.append(g);
    });

    function pt(e) {
      const m = board.getScreenCTM().inverse();
      const p = board.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
      const q = p.matrixTransform(m);
      return { x: q.x, y: q.y };
    }
    function draw() {
      lines.replaceChildren();
      for (const [w, ti] of conn) {
        const li = ids.indexOf(w), st = STYLES[w];
        lines.append(svg('path', { d: `M 77 ${ys(li)} C 170 ${ys(li)}, 170 ${ys(ti)}, 268 ${ys(ti)}`, fill: 'none', stroke: st.color, 'stroke-width': 7, 'stroke-dasharray': st.dash, 'stroke-linecap': 'round' }));
      }
      submit.disabled = conn.size !== n;
    }
    let dragging = null;
    board.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('[data-w]');
      if (!g) return;
      board.setPointerCapture(e.pointerId);
      dragging = Number(g.dataset.w);
      conn.delete(dragging); draw();
      onMove(e);
    });
    function onMove(e) {
      if (dragging === null) return;
      const p = pt(e), li = ids.indexOf(dragging), st = STYLES[dragging];
      drag.replaceChildren(svg('line', { x1: 77, y1: ys(li), x2: p.x, y2: p.y, stroke: st.color, 'stroke-width': 7, 'stroke-dasharray': st.dash, 'stroke-linecap': 'round' }));
    }
    board.addEventListener('pointermove', onMove);
    const release = (e) => {
      if (dragging === null) return;
      const p = pt(e);
      let best = -1, bd = 40;
      ids.forEach((_, ti) => { const d = Math.hypot(p.x - 290, p.y - ys(ti)); if (d < bd) { bd = d; best = ti; } });
      if (best >= 0) {
        for (const [w, ti] of conn) if (ti === best) conn.delete(w); // a terminal holds one wire
        conn.set(dragging, best);
        feel.buzz('snap'); feel.sound('snap');
      }
      dragging = null; drag.replaceChildren(); draw();
    };
    board.addEventListener('pointerup', release);
    board.addEventListener('pointercancel', () => { dragging = null; drag.replaceChildren(); });

    const submit = h('button', { class: 'primary', style: { width: '100%' }, disabled: true, onClick: () => ctx.submit({ pairs: [...conn.entries()] }) }, 'Check the wires');
    stage.append(h('p', { class: 'hint' }, 'Drag a wire end to a terminal. Drag it again to move it. Drop it elsewhere to unplug it.'), board, submit);
    draw();
  },
};
