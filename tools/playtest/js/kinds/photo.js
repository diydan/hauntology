// Torn photo: the picture you saw is torn into pieces and turned. Tap a piece to turn it, drag it into place.
// The picture is drawn from simple shapes, so it uses no outside image.
import { h } from '../dom.js';
import { rngFrom, hash, shuffle, range } from '../core.js';

const CELL = 100;

export function drawPicture(pic, w, hgt) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = hgt;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, hgt);
  g.addColorStop(0, pic.top); g.addColorStop(1, pic.bottom);
  c.fillStyle = g; c.fillRect(0, 0, w, hgt);
  const u = Math.min(w, hgt);
  for (const s of pic.shapes) {
    c.save();
    c.translate(s.x * w, s.y * hgt);
    c.rotate((s.a * Math.PI) / 180);
    c.fillStyle = s.c;
    const r = s.s * u;
    c.beginPath();
    if (s.t === 'circle') c.arc(0, 0, r, 0, Math.PI * 2);
    else if (s.t === 'rect') c.rect(-r, -r * 0.6, r * 2, r * 1.2);
    else { c.moveTo(0, -r * 1.1); c.lineTo(r, r * 0.8); c.lineTo(-r, r * 0.8); c.closePath(); }
    c.fill();
    c.restore();
  }
  return cv;
}

export default {
  id: 'photo',
  title: 'Torn photo',
  blurb: 'A photo you saw is torn into pieces, and they are turned. Tap a piece to turn it. Drag it onto the frame where it belongs.',
  memory: true,
  renderSight(el, payload) {
    const cv = drawPicture(payload.picture, payload.cols * CELL, payload.rows * CELL);
    cv.style.cssText = 'width:80%;border-radius:8px;border:2px solid #454a60';
    el.replaceChildren(h('p', { class: 'hint' }, 'A photo, pinned to the wall:'), cv);
  },
  mount(ctx) {
    const { lock, feel, stage } = ctx;
    const v = lock.view, n = v.cols * v.rows;
    const BW = 300, fx = (BW - v.cols * CELL) / 2, frameH = v.rows * CELL, trayY = frameH + 24;
    const BH = trayY + Math.ceil(n / 3) * CELL + 4;
    const full = drawPicture(v.picture, v.cols * CELL, v.rows * CELL);
    const slotPos = (s) => ({ x: fx + (s % v.cols) * CELL, y: Math.floor(s / v.cols) * CELL });
    const order = shuffle(rngFrom(hash('tray', lock.seed)), range(n));
    const homePos = (p) => { const i = order.indexOf(p); return { x: (i % 3) * CELL, y: trayY + Math.floor(i / 3) * CELL }; };

    const board = h('div', { style: { position: 'relative', width: `${BW}px`, height: `${BH}px`, margin: '0 auto', touchAction: 'none' } });
    for (let s = 0; s < n; s++) {
      const p = slotPos(s);
      board.append(h('div', { style: { position: 'absolute', left: `${p.x}px`, top: `${p.y}px`, width: `${CELL}px`, height: `${CELL}px`, border: '2px dashed #454a60', borderRadius: '8px', boxSizing: 'border-box' } }));
    }
    const pieces = range(n).map((id) => {
      const cv = document.createElement('canvas');
      cv.width = CELL; cv.height = CELL;
      cv.getContext('2d').drawImage(full, (id % v.cols) * CELL, Math.floor(id / v.cols) * CELL, CELL, CELL, 0, 0, CELL, CELL);
      cv.style.cssText = 'width:100%;height:100%;border-radius:6px;display:block;pointer-events:none';
      const el = h('div', { 'aria-label': `Piece ${id + 1}`, style: { position: 'absolute', width: `${CELL - 4}px`, height: `${CELL - 4}px`, transition: 'transform .18s ease, left .15s ease, top .15s ease', cursor: 'grab', boxShadow: '0 2px 6px rgba(0,0,0,.5)', borderRadius: '8px' } }, cv);
      return { id, el, turns: 0, slot: null, x: 0, y: 0 };
    });
    const occupant = (s) => pieces.find((p) => p.slot === s);
    function place(p, x, y) { p.x = x; p.y = y; p.el.style.left = `${x + 2}px`; p.el.style.top = `${y + 2}px`; }
    function paintRot(p) { p.el.style.transform = `rotate(${(lock.view.turns0[p.id] + p.turns) * 90}deg)`; }
    function home(p) { p.slot = null; const hp = homePos(p.id); place(p, hp.x, hp.y); }
    pieces.forEach((p) => { home(p); paintRot(p); board.append(p.el); });

    const fits = (p, s) => s === p.id && (lock.view.turns0[p.id] + p.turns) % 4 === 0;
    let drag = null;
    board.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('[aria-label^="Piece"]');
      if (!el) return;
      const p = pieces.find((q) => q.el === el);
      board.setPointerCapture(e.pointerId);
      const r = board.getBoundingClientRect();
      drag = { p, sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left - p.x, oy: e.clientY - r.top - p.y, moved: false, from: { slot: p.slot, x: p.x, y: p.y } };
      p.el.style.zIndex = 5;
    });
    board.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8) return;
      drag.moved = true;
      const r = board.getBoundingClientRect();
      drag.p.el.style.transition = 'transform .18s ease';
      place(drag.p, e.clientX - r.left - drag.ox, e.clientY - r.top - drag.oy);
    });
    const end = () => {
      if (!drag) return;
      const { p, moved, from } = drag;
      drag = null;
      p.el.style.zIndex = 1;
      p.el.style.transition = 'transform .18s ease, left .15s ease, top .15s ease';
      if (!moved) { p.turns = (p.turns + 1) % 4; paintRot(p); feel.buzz('tick'); feel.sound('rustle'); checkDone(); return; }
      let best = null, bd = 62;
      for (let s = 0; s < n; s++) {
        const sp = slotPos(s), d = Math.hypot(p.x + CELL / 2 - (sp.x + CELL / 2), p.y + CELL / 2 - (sp.y + CELL / 2));
        if (d < bd) { bd = d; best = s; }
      }
      if (best === null) { home(p); return; }
      const other = occupant(best);
      if (other && other !== p) { // swap: the other piece goes where this one came from
        if (from.slot !== null) { other.slot = from.slot; place(other, slotPos(from.slot).x, slotPos(from.slot).y); } else home(other);
      }
      p.slot = best; const sp = slotPos(best); place(p, sp.x, sp.y);
      if (fits(p, best)) { feel.buzz('click'); feel.sound('click'); } else feel.sound('rustle');
      checkDone();
    };
    board.addEventListener('pointerup', end);
    board.addEventListener('pointercancel', end);
    const check = h('button', { class: 'primary', style: { width: '100%' }, disabled: true,
      onClick: () => ctx.submit({ placed: pieces.map((p) => ({ piece: p.id, slot: p.slot, turns: p.turns })) }) }, 'Check the photo');
    function checkDone() { check.disabled = !pieces.every((p) => p.slot !== null); }
    // a wrong Attempt keeps the pieces where they are; the Player adjusts
    stage.append(h('p', { class: 'hint' }, 'Tap a piece to turn it. Drag it onto the frame. Fill the frame, then check.'), board, check);
  },
};
