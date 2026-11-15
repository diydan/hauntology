// Spirit board: a word is whispered. Roll the planchette onto each letter and rest there to spell it.
// Tilt rolls the planchette (same physics idea as the Cyber-Orb demo, in fixed steps). Touch: drag it, or tap a letter.
// In the game the Whisper's prerendered line says the word; this test page uses your phone's own voice.
import { h } from '../dom.js';
import { defaultWorld, newBall, makeStepper } from '../core.js';

const W = 340, H = 300, LR = 22;
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const POS = LETTERS.map((ch, i) => {
  const row = i < 13 ? 0 : 1, k = i % 13, t = k / 12;
  return { ch, x: 26 + t * 288, y: (row ? 200 : 104) - 26 * Math.sin(Math.PI * t) };
});

export default {
  id: 'board',
  title: 'Spirit board',
  blurb: 'Listen to the whispered word (twice at most). Roll the planchette onto each letter and rest on it to spell the word.',
  memory: false,
  mount(ctx) {
    const { lock, feel, stage, settings } = ctx;
    const v = lock.view, word = lock.secret.word; // test page only: the real game keeps the word on the server
    const world = { ...defaultWorld(W, H, [], 20), friction: 3.2, maxSpeed: 230, accel: 12 };
    const ball = newBall(W / 2, H - 40);
    const roll = makeStepper(ball, world);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = h('canvas', { width: W * dpr, height: H * dpr, style: { width: '100%', maxWidth: '380px', display: 'block', margin: '0 auto', borderRadius: '14px', background: '#1a1410', touchAction: 'none' }, 'aria-label': 'Spirit board' });
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    let plays = 0, finger = false, down = null, curLetter = null, dwell = 0, armed = true;
    const spelled = [];
    const slots = h('div', { class: 'digits' });
    const local = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
    const nearest = (x, y, max) => { let b = null, bd = max; POS.forEach((p) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; b = p; } }); return b; };
    function choose(p) {
      if (spelled.length >= v.length) return;
      spelled.push(p.ch); feel.buzz('thunk'); feel.sound('thunk'); paint();
      armed = false;
      if (spelled.length === v.length) ctx.submit({ letters: spelled.join('') });
    }
    function paint() { slots.replaceChildren(...Array.from({ length: v.length }, (_, i) => h('span', {}, spelled[i] || '·'))); }

    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); finger = true; const p = local(e); ball.x = p.x; ball.y = p.y; ball.vx = ball.vy = 0; down = { ...p, moved: false }; });
    cv.addEventListener('pointermove', (e) => { if (!finger) return; const p = local(e); ball.x = Math.max(20, Math.min(W - 20, p.x)); ball.y = Math.max(20, Math.min(H - 20, p.y)); ball.vx = ball.vy = 0; if (down && Math.hypot(p.x - down.x, p.y - down.y) > 10) down.moved = true; });
    const up = (e) => {
      if (!finger) return;
      finger = false;
      if (down && !down.moved) { const p = nearest(local(e).x, local(e).y, 26); if (p) choose(p); } // touch path: tap a letter
      down = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', () => { finger = false; down = null; });

    ctx.onTick((t, dt) => {
      if (!finger) roll(dt, feel.tiltOn ? feel.tiltScaled : { x: 0, y: 0 }); // no tilt and no finger: it settles
      const speed = Math.hypot(ball.vx, ball.vy);
      const near = nearest(ball.x, ball.y, LR + 4);
      if (near?.ch !== curLetter) { curLetter = near?.ch ?? null; dwell = 0; if (near) { feel.buzz('tick'); feel.sound('tick'); armed = true; } }
      else if (near && armed && speed < 40) { dwell += dt; if (dwell >= v.dwellMs) { dwell = 0; choose(near); } }
      else dwell = 0;
      // draw
      c.fillStyle = '#1a1410'; c.fillRect(0, 0, W, H);
      c.font = '600 22px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      POS.forEach((p) => { c.fillStyle = p.ch === curLetter ? '#ffd86b' : '#d9c9a3'; c.fillText(p.ch, p.x, p.y); });
      if (curLetter && dwell > 0) { const p = POS[LETTERS.indexOf(curLetter)]; c.strokeStyle = '#7fd6a1'; c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y, LR + 2, -Math.PI / 2, -Math.PI / 2 + (dwell / v.dwellMs) * Math.PI * 2); c.stroke(); }
      c.fillStyle = 'rgba(185,166,255,.28)'; c.strokeStyle = '#b9a6ff'; c.lineWidth = 2;
      c.beginPath(); c.arc(ball.x, ball.y, 20, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#0e0f14'; c.beginPath(); c.arc(ball.x, ball.y, 5, 0, Math.PI * 2); c.fill();
    });

    const hear = h('button', { class: 'primary', onClick: () => {
      if (plays >= v.plays) return;
      plays++;
      hear.textContent = plays >= v.plays ? 'No more whispers' : `Hear the word (${v.plays - plays} left)`;
      hear.disabled = plays >= v.plays;
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(word.toLowerCase());
        u.rate = 0.7; u.pitch = 0.6; u.volume = 1;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
      } else ctx.toast('This phone has no speech voice. Turn on Assist in settings to see the word.', 'bad');
    } }, `Hear the word (${v.plays} left)`);
    ctx.onWrong(() => { spelled.length = 0; paint(); });
    ctx.onCleanup(() => { try { speechSynthesis?.cancel(); } catch { /* ignore */ } });
    stage.append(h('div', { class: 'row' }, hear), settings.assist ? h('p', { class: 'hint' }, `Assist: the word is ${word}`) : null, cv, slots,
      h('div', { class: 'row' }, h('button', { onClick: () => { spelled.length = 0; paint(); } }, 'Clear')),
      h('p', { class: 'hint' }, 'Tilt on: roll the planchette and rest on a letter. Tilt off: drag it, or tap a letter.'));
    paint();
  },
};
