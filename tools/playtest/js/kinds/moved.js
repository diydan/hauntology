// What moved: remember the shelf you saw. The lights go out for two seconds. Tap what changed.
import { h, svg, sleep } from '../dom.js';
import { dimPlan } from '../core.js';

// twelve original little glyphs on a 40 by 40 box: shape and colour both differ
const ITEMS = [
  ['candlestick', '#ffd86b', (s) => [s('rect', { x: 15, y: 18, width: 10, height: 16, fill: 'F' }), s('rect', { x: 9, y: 32, width: 22, height: 4, fill: 'F' }), s('ellipse', { cx: 20, cy: 11, rx: 3.5, ry: 6, fill: 'F' })]],
  ['key', '#c9c9d4', (s) => [s('circle', { cx: 13, cy: 14, r: 7, fill: 'none', stroke: 'F', 'stroke-width': 4 }), s('rect', { x: 18, y: 12, width: 16, height: 4, fill: 'F' }), s('rect', { x: 28, y: 16, width: 4, height: 6, fill: 'F' }), s('rect', { x: 22, y: 16, width: 3, height: 5, fill: 'F' })]],
  ['cup', '#6bb6ff', (s) => [s('path', { d: 'M8 12 H30 L27 32 H11 Z', fill: 'F' }), s('path', { d: 'M30 15 H35 Q36 24 29 24', fill: 'none', stroke: 'F', 'stroke-width': 3 })]],
  ['book', '#ff8b8b', (s) => [s('rect', { x: 8, y: 7, width: 24, height: 28, rx: 2, fill: 'F' }), s('line', { x1: 14, y1: 7, x2: 14, y2: 35, stroke: '#0e0f14', 'stroke-width': 2 })]],
  ['bell', '#e8c27a', (s) => [s('path', { d: 'M20 6 C12 8 11 16 10 24 L8 30 H32 L30 24 C29 16 28 8 20 6 Z', fill: 'F' }), s('circle', { cx: 20, cy: 34, r: 3, fill: 'F' })]],
  ['lamp', '#6be39a', (s) => [s('polygon', { points: '10,18 30,18 25,6 15,6', fill: 'F' }), s('rect', { x: 18.5, y: 18, width: 3, height: 14, fill: 'F' }), s('rect', { x: 12, y: 32, width: 16, height: 4, fill: 'F' })]],
  ['hat', '#c49bff', (s) => [s('ellipse', { cx: 20, cy: 28, rx: 16, ry: 5, fill: 'F' }), s('rect', { x: 11, y: 10, width: 18, height: 18, rx: 3, fill: 'F' })]],
  ['vase', '#7fe0e0', (s) => [s('path', { d: 'M15 6 H25 L24 14 C32 18 31 32 26 35 H14 C9 32 8 18 16 14 Z', fill: 'F' })]],
  ['mirror', '#d6d6ee', (s) => [s('ellipse', { cx: 20, cy: 15, rx: 11, ry: 13, fill: 'none', stroke: 'F', 'stroke-width': 4 }), s('rect', { x: 18, y: 28, width: 4, height: 8, fill: 'F' })]],
  ['box', '#ffb27a', (s) => [s('rect', { x: 7, y: 15, width: 26, height: 18, rx: 2, fill: 'F' }), s('rect', { x: 5, y: 9, width: 30, height: 7, rx: 2, fill: 'F' }), s('rect', { x: 18, y: 20, width: 4, height: 5, fill: '#0e0f14' })]],
  ['moon', '#f4efc1', (s) => [s('path', { d: 'M26 6 A15 15 0 1 0 34 26 A12 12 0 1 1 26 6 Z', fill: 'F' })]],
  ['star', '#ffe27a', (s) => [s('polygon', { points: '20,4 24.5,15 36,15.5 27,23 30,35 20,28 10,35 13,23 4,15.5 15.5,15', fill: 'F' })]],
];

export function itemSvg(id, px = 56) {
  const [name, color, draw] = ITEMS[id];
  const el = svg('svg', { viewBox: '0 0 40 40', width: px, height: px, role: 'img', 'aria-label': name });
  const s = (tag, attrs) => svg(tag, Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, v === 'F' ? color : v])));
  el.append(...draw(s));
  return el;
}
export const itemName = (id) => (id < 0 ? 'empty spot' : ITEMS[id][0]);

function shelfEl(items, cols, onTap) {
  const grid = h('div', { class: 'shelf', style: { gridTemplateColumns: `repeat(${cols}, 1fr)` } });
  items.forEach((id, i) => {
    const slot = h('button', { class: `slot${id < 0 ? ' empty' : ''}`, 'aria-label': `Spot ${i + 1}: ${itemName(id)}`, 'aria-pressed': 'false', onClick: () => onTap?.(i, slot) });
    if (id >= 0) slot.append(itemSvg(id));
    grid.append(slot);
  });
  return grid;
}

export default {
  id: 'moved',
  title: 'What moved',
  blurb: 'Remember the shelf. The lights go out for two seconds. When they come back, tap everything that changed: swapped, new, or missing.',
  memory: true,
  renderSight(el, payload) {
    el.replaceChildren(h('p', { class: 'hint' }, 'A shelf:'), shelfEl(payload.shelf, payload.shelf.length === 6 ? 3 : 4));
  },
  mount(ctx) {
    const { lock, feel, stage } = ctx;
    const v = lock.view;
    const cols = v.slots === 6 ? 3 : 4;
    const picked = new Set();
    let alive = true;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dark = h('div', { class: 'dark', style: { textAlign: 'center', padding: '70px 0', fontSize: '20px', opacity: '0.9' } }, 'The lights go out…');
    stage.append(dark);
    (async () => {
      feel.newAttempt();
      feel.buzz('rumble'); feel.sound('creak');
      const plan = dimPlan('dark', reduced); // fades only, two changes at most, peak under white; one still step for reduced motion
      if (!reduced) {
        dark.style.transition = 'opacity .6s ease';
        await sleep(40);
        dark.style.opacity = String(plan[1].lum);
        await sleep(1400);
        dark.style.opacity = String(plan[3].lum);
        await sleep(600);
      } else {
        dark.style.opacity = String(plan[0].lum);
        await sleep(2000);
      }
      if (!alive) return;
      dark.remove();
      const grid = shelfEl(v.after, cols, (i, slot) => {
        if (picked.has(i)) picked.delete(i); else picked.add(i);
        slot.setAttribute('aria-pressed', String(picked.has(i)));
        feel.buzz('tick'); feel.sound('tick');
        count.textContent = `${picked.size} chosen`;
      });
      const count = h('p', { class: 'hint' }, '0 chosen');
      ctx.onWrong(() => { picked.clear(); grid.querySelectorAll('.slot').forEach((b) => b.setAttribute('aria-pressed', 'false')); count.textContent = '0 chosen'; });
      stage.append(h('p', { class: 'hint' }, 'The lights are back. What changed?'), grid, count,
        h('button', { class: 'primary', style: { width: '100%' }, onClick: () => ctx.submit({ changed: [...picked].sort((a, b) => a - b) }) }, 'These changed'));
    })();
    ctx.onCleanup(() => { alive = false; });
  },
};
