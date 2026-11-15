// Hidden words: a dark wall with letters you can only see in your torch beam. Tap the letters in reading order.
// Tilt the phone to aim the torch, or drag a finger. The phone pulses when the beam crosses a letter.
import { h } from '../dom.js';
import { clamp } from '../core.js';

const S = 320, R = 74;

export default {
  id: 'words',
  title: 'Hidden words',
  blurb: 'Letters are written on a dark wall. Light them with your torch and tap them left to right to read the word.',
  memory: false,
  mount(ctx) {
    const { lock, feel, stage } = ctx;
    const letters = lock.view.letters, n = letters.length;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = h('canvas', { width: S * dpr, height: S * dpr, style: { width: '100%', maxWidth: '360px', display: 'block', margin: '0 auto', borderRadius: '14px', background: '#07080b', touchAction: 'none' }, 'aria-label': 'Dark wall with hidden letters' });
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    const beam = { x: S / 2, y: S / 2 };
    const target = { x: S / 2, y: S / 2 };
    let finger = false, down = null, lastVisible = new Set();
    const picked = [];
    const word = h('div', { class: 'digits' });
    const pos = (l) => ({ x: l.x * S, y: l.y * S });
    const vis = (l) => { const p = pos(l); const d = Math.hypot(p.x - beam.x, p.y - beam.y); return clamp(1 - (d - R * 0.55) / (R * 0.45), 0, 1); };
    const local = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * S, y: ((e.clientY - r.top) / r.height) * S }; };

    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); finger = true; const p = local(e); target.x = p.x; target.y = p.y; down = { ...p, moved: false }; });
    cv.addEventListener('pointermove', (e) => { if (!finger) return; const p = local(e); target.x = p.x; target.y = p.y; if (down && Math.hypot(p.x - down.x, p.y - down.y) > 10) down.moved = true; });
    const up = (e) => {
      if (!finger) return;
      finger = false;
      const p = local(e);
      if (down && !down.moved) {
        let best = -1, bd = 34;
        letters.forEach((l, i) => { const q = pos(l), d = Math.hypot(p.x - q.x, p.y - q.y); if (d < bd && vis(l) > 0.45 && !picked.includes(i)) { bd = d; best = i; } });
        if (best >= 0) { picked.push(best); feel.buzz('click'); feel.sound('click'); paintWord(); if (picked.length === n) ctx.submit({ letters: picked.slice() }); }
      }
      down = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', () => { finger = false; down = null; });

    function paintWord() { word.replaceChildren(...Array.from({ length: n }, (_, i) => h('span', {}, i < picked.length ? letters[picked[i]].ch : '·'))); }
    ctx.onWrong(() => { picked.length = 0; paintWord(); });

    ctx.onTick(() => {
      if (!finger && feel.tiltOn) { // tilt aims the torch around the whole wall
        const t = feel.tiltScaled;
        target.x = S / 2 + clamp(t.x / 45, -1, 1) * (S / 2 - 10);
        target.y = S / 2 + clamp(t.y / 45, -1, 1) * (S / 2 - 10);
      }
      beam.x += (target.x - beam.x) * 0.25; beam.y += (target.y - beam.y) * 0.25;
      c.clearRect(0, 0, S, S);
      c.fillStyle = '#07080b'; c.fillRect(0, 0, S, S);
      const g = c.createRadialGradient(beam.x, beam.y, 4, beam.x, beam.y, R);
      g.addColorStop(0, 'rgba(255,240,200,0.20)'); g.addColorStop(1, 'rgba(255,240,200,0)');
      c.fillStyle = g; c.fillRect(0, 0, S, S);
      c.font = '700 40px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const now = new Set();
      letters.forEach((l, i) => {
        const a = vis(l), p = pos(l);
        if (a > 0.6) now.add(i);
        if (a <= 0) return;
        c.globalAlpha = a * 0.95;
        c.fillStyle = picked.includes(i) ? '#7fd6a1' : '#f3ead2';
        c.fillText(l.ch, p.x, p.y);
      });
      c.globalAlpha = 1;
      for (const i of now) if (!lastVisible.has(i)) { feel.buzz('tick'); feel.sound('tick'); }
      lastVisible = now;
    });

    stage.append(h('p', { class: 'hint' }, 'Aim the torch. Tap a lit letter.'), cv, word,
      h('div', { class: 'row' }, h('button', { onClick: () => { picked.length = 0; paintWord(); } }, 'Clear')),
      h('p', { class: 'hint' }, 'Tilt on: lean the phone to sweep the beam. Tilt off: drag a finger.'));
    paintWord();
  },
};
