// Spirit board: a word is whispered, with a short clue. Roll the planchette onto each letter and pick it.
// Tilt rolls the planchette; letters gently pull it in, and a tap anywhere picks the letter under it (or just rest
// on it for a moment). Touch: drag it, or tap a letter. In the game the Whisper's prerendered line says the word;
// this test page uses the clearest voice the phone has.
import { h } from '../dom.js';
import { defaultWorld, newBall, makeStepper } from '../core.js';
import { speakWord } from '../speech.js';

const W = 340, H = 310, LR = 26;
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const ROWS = [[0, 9], [9, 18], [18, 26]]; // A to I, J to R, S to Z
/** Where each letter sits: three gentle arcs, spaced for a thumb. */
export const LETTER_POS = LETTERS.map((ch, i) => {
  const r = ROWS.findIndex(([a, b]) => i >= a && i < b), [a, b] = ROWS[r], t = (i - a) / (b - a - 1);
  return { ch, x: 30 + t * 280, y: 78 + r * 82 - 16 * Math.sin(Math.PI * t) };
});
const MAGNET_PX = 36, MAGNET_PULL = 16, MAGNET_MAX_SPEED = 150;

export default {
  id: 'board',
  title: 'Spirit board',
  usesTilt: true,
  blurb: 'Listen to the whispered word and its clue (twice at most). Roll the planchette onto each letter, then tap to pick it.',
  memory: false,
  mount(ctx) {
    const { lock, feel, stage, settings } = ctx;
    const v = lock.view, word = lock.secret.word; // test page only: the real game keeps the word on the server
    const world = { ...defaultWorld(W, H, [], 20), friction: 5, maxSpeed: 260, accel: 22 };
    const ball = newBall(W / 2, H - 30);
    stage.__ball = ball; // for tests and debugging
    const roll = makeStepper(ball, world);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = h('canvas', { width: W * dpr, height: H * dpr, style: { width: '100%', maxWidth: '380px', display: 'block', margin: '0 auto', borderRadius: '14px', background: '#1a1410', touchAction: 'none' }, 'aria-label': 'Spirit board' });
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    let plays = 0, finger = false, down = null, curLetter = null, dwell = 0, armed = true;
    const spelled = [];
    const slots = h('div', { class: 'digits' });
    const local = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
    const nearest = (x, y, max) => { let b = null, bd = max; LETTER_POS.forEach((p) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; b = p; } }); return b; };
    function choose(p) {
      if (spelled.length >= v.length) return;
      spelled.push(p.ch); feel.buzz('thunk'); feel.sound('thunk'); paint();
      armed = false;
      if (spelled.length === v.length) ctx.submit({ letters: spelled.join('') });
    }
    function paint() { slots.replaceChildren(...Array.from({ length: v.length }, (_, i) => h('span', {}, spelled[i] || '·'))); }

    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); finger = true; const p = local(e); down = { ...p, moved: false }; });
    cv.addEventListener('pointermove', (e) => {
      if (!finger) return;
      const p = local(e);
      if (down && !down.moved && Math.hypot(p.x - down.x, p.y - down.y) > 10) down.moved = true;
      if (down?.moved) { ball.x = Math.max(20, Math.min(W - 20, p.x)); ball.y = Math.max(20, Math.min(H - 20, p.y)); ball.vx = ball.vy = 0; } // a finger drag carries the planchette
    });
    const up = (e) => {
      if (!finger) return;
      finger = false;
      if (down && !down.moved) {
        const p = local(e);
        const tapped = nearest(p.x, p.y, 28); // touch path: tap a letter
        const under = feel.tiltOn ? nearest(ball.x, ball.y, 40) : null; // tilt path: tap anywhere picks the letter under the planchette
        const pick = tapped || under;
        if (pick) choose(pick);
      }
      down = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', () => { finger = false; down = null; });

    ctx.onTick((t, dt) => {
      if (!finger) {
        // letters pull a slow planchette in, so resting on one is easy
        const pulled = nearest(ball.x, ball.y, MAGNET_PX);
        if (pulled && Math.hypot(ball.vx, ball.vy) < MAGNET_MAX_SPEED) {
          const k = MAGNET_PULL * (dt / 1000);
          ball.vx += (pulled.x - ball.x) * k; ball.vy += (pulled.y - ball.y) * k;
        }
        roll(dt, feel.tiltOn ? feel.tiltScaled : { x: 0, y: 0 }); // no tilt and no finger: it settles
      }
      const speed = Math.hypot(ball.vx, ball.vy);
      const near = nearest(ball.x, ball.y, LR);
      if (near?.ch !== curLetter) { curLetter = near?.ch ?? null; dwell = 0; if (near) { feel.buzz('tick'); feel.sound('tick'); armed = true; } }
      else if (near && armed && speed < 45) { dwell += dt; if (dwell >= v.dwellMs) { dwell = 0; choose(near); } }
      else dwell = 0;
      // draw
      c.fillStyle = '#1a1410'; c.fillRect(0, 0, W, H);
      c.font = '600 28px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      LETTER_POS.forEach((p) => { c.fillStyle = p.ch === curLetter ? '#ffd86b' : '#d9c9a3'; c.fillText(p.ch, p.x, p.y); });
      if (curLetter && dwell > 0) { const p = LETTER_POS[LETTERS.indexOf(curLetter)]; c.strokeStyle = '#7fd6a1'; c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y, LR + 2, -Math.PI / 2, -Math.PI / 2 + (dwell / v.dwellMs) * Math.PI * 2); c.stroke(); }
      c.fillStyle = 'rgba(185,166,255,.28)'; c.strokeStyle = '#b9a6ff'; c.lineWidth = 2;
      c.beginPath(); c.arc(ball.x, ball.y, 20, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#0e0f14'; c.beginPath(); c.arc(ball.x, ball.y, 5, 0, Math.PI * 2); c.fill();
    });

    const hear = h('button', { class: 'primary', onClick: () => {
      if (plays >= v.plays) return;
      plays++;
      hear.textContent = plays >= v.plays ? 'No more whispers' : `Hear the word (${v.plays - plays} left)`;
      hear.disabled = plays >= v.plays;
      if (!speakWord(word, v.clue)) ctx.toast('This phone has no speech voice. Use the clue below.', 'bad');
    } }, `Hear the word (${v.plays} left)`);
    ctx.onWrong(() => { spelled.length = 0; paint(); });
    ctx.onCleanup(() => { try { speechSynthesis?.cancel(); } catch { /* ignore */ } });
    stage.append(
      h('div', { class: 'row' }, hear),
      h('p', { class: 'hint', style: { fontSize: '16px', color: 'var(--fg)' } }, `Clue: ${v.clue} · ${v.length} letters`),
      settings.assist ? h('p', { class: 'hint' }, `Assist: the word is ${word}`) : null,
      cv, slots,
      h('div', { class: 'row' }, h('button', { onClick: () => { spelled.length = 0; paint(); } }, 'Clear')),
      h('p', { class: 'hint' }, 'Tilt on: roll the planchette onto a letter and tap anywhere to pick it (or rest on it). Tilt off: drag it, or tap a letter.'));
    paint();
  },
};
