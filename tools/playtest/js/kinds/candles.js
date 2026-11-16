// Candle order: watch the candles gutter one by one, then snuff them in the same order.
// Touch: tap a candle to snuff it. Optional: turn on "Blow to snuff", tap a candle to pick it, then blow on the phone.
// The microphone only measures loudness; nothing is recorded.
import { h, svg, sleep } from '../dom.js';

const HEIGHTS = [96, 62, 118, 78, 104];

export default {
  id: 'candles',
  title: 'Candle order',
  blurb: 'Watch the order the candles gutter (twice at most). Then put them out in that same order. A wrong order relights them all.',
  memory: false,
  mount(ctx) {
    const { lock, feel, stage } = ctx;
    const v = lock.view;
    let shows = 0, showing = false, alive = true, selected = null, blowing = false, micWanted = false;
    const out = [];
    const W = 340, H = 220, gap = W / v.n;
    const board = svg('svg', { class: 'board', viewBox: `0 0 ${W} ${H}`, role: 'application', 'aria-label': 'Candles' });
    const flames = [], bodies = [];
    for (let i = 0; i < v.n; i++) {
      const cx = gap * (i + 0.5), ht = HEIGHTS[i];
      const g = svg('g', { role: 'button', 'aria-label': `Candle ${i + 1}`, style: { cursor: 'pointer' } });
      const body = svg('rect', { x: cx - 18, y: H - 20 - ht, width: 36, height: ht, rx: 6, fill: '#d9d2c3', stroke: 'transparent', 'stroke-width': 3 });
      const num = svg('text', { x: cx, y: H - 30, 'text-anchor': 'middle', fill: '#3b3a36', 'font-size': 22, 'font-weight': 800 }, String(i + 1));
      const flame = svg('ellipse', { cx, cy: H - 20 - ht - 16, rx: 8, ry: 15, fill: '#ffcf6e' });
      const hit = svg('rect', { x: cx - gap / 2 + 2, y: 0, width: gap - 4, height: H, fill: 'transparent' });
      g.append(body, num, flame, hit);
      g.addEventListener('pointerdown', () => tap(i));
      board.append(g);
      flames.push(flame); bodies.push(body);
    }
    const lit = (i) => !out.includes(i);
    function paint() {
      flames.forEach((f, i) => { f.style.opacity = lit(i) ? '1' : '0'; });
      bodies.forEach((b, i) => b.setAttribute('stroke', selected === i ? '#b9a6ff' : 'transparent'));
    }
    function snuff(i) {
      if (!lit(i) || showing) return;
      out.push(i); selected = null;
      feel.sound('gutter'); feel.buzz('tick');
      paint();
      if (out.length === v.n) ctx.submit({ order: out.slice() });
    }
    function tap(i) {
      if (showing || !lit(i)) return;
      if (micWanted && feel.micState === 'on') { selected = i; paint(); return; }
      snuff(i);
    }
    async function show() {
      if (showing || shows >= v.shows) return;
      showing = true; shows++;
      showBtn.disabled = true;
      out.length = 0; paint();
      for (const i of v.order) {
        if (!alive) return;
        flames[i].style.opacity = '0.15'; feel.sound('gutter'); feel.buzz('tick');
        await sleep(520);
        flames[i].style.opacity = '1';
        await sleep(260);
      }
      showing = false;
      showBtn.textContent = shows >= v.shows ? 'No more shows' : `Watch again (${v.shows - shows} left)`;
      showBtn.disabled = shows >= v.shows;
    }
    const showBtn = h('button', { class: 'primary', onClick: show }, `Watch (${v.shows} left)`);
    const micBtn = h('button', { onClick: async () => {
      if (micWanted) { micWanted = false; feel.stopBreath(); micBtn.textContent = 'Blow to snuff: off'; paint(); return; }
      const r = await feel.startBreath();
      if (r !== 'on') return ctx.toast(r === 'denied' ? 'Microphone was denied. Tap the candles instead.' : 'No microphone. Tap the candles instead.', 'bad');
      micWanted = true; micBtn.textContent = 'Blow to snuff: ON (tap a candle, then blow)';
    } }, 'Blow to snuff: off');
    const meter = h('div', { class: 'meter', hidden: true }, h('i'), h('u'));
    const unsub = feel.onBreath((level, b) => { blowing = b; });
    ctx.onCleanup(() => { alive = false; unsub(); });
    ctx.onTick(() => {
      meter.hidden = feel.micState !== 'on';
      if (feel.micState === 'on') {
        meter.firstChild.style.width = `${Math.min(100, feel.level * 220)}%`;
        meter.lastChild.style.left = `${Math.min(100, feel.blowThreshold * 220)}%`;
        if (selected !== null) flames[selected].setAttribute('transform', `skewX(${Math.min(40, feel.level * 120)})`);
        if (blowing && selected !== null) { flames[selected].removeAttribute('transform'); snuff(selected); blowing = false; }
      } else if (micWanted) { micWanted = false; micBtn.textContent = 'Blow to snuff: off'; }
    });
    ctx.onWrong(() => { out.length = 0; selected = null; paint(); }); // a wrong order relights every candle
    stage.append(h('p', { class: 'hint' }, 'Tap a candle to put it out.'), board, h('div', { class: 'row' }, showBtn), h('div', { class: 'row' }, micBtn), meter,
      h('p', { class: 'hint' }, 'The microphone is optional and measures loudness only.'));
    paint();
  },
};
