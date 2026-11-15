// Drives the real screens with taps and drags (touch path only) and checks each one opens its lock.
// The geometry stub in helpers.js puts every box at 0,0 so a pointer position equals the screen's own coordinates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, reachPlay, tick, click, buttonWith, pointer, waitFor, pastMinSolve, opened } from './helpers.js';
import { minSolveMs, SHELF_ITEMS } from '../js/core.js';

const skip = !JSDOM && 'jsdom not installed';
const polar = (cx, cy, r, deg) => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)];

for (const level of ['easy', 'normal']) {
  test(`ui musicbox (${level}): keys in tune order`, { skip }, async () => {
    const { hw } = await reachPlay('musicbox', level);
    await pastMinSolve(hw, minSolveMs(hw.lock));
    const keys = [...document.querySelectorAll('.key')];
    for (const n of hw.lock.secret.tune) click(keys[n]);
    await tick(30);
    assert.ok(opened());
    assert.deepEqual(window.__errors, []);
  });

  test(`ui candles (${level}): snuff in the shown order`, { skip }, async () => {
    const { hw } = await reachPlay('candles', level);
    await pastMinSolve(hw, minSolveMs(hw.lock));
    for (const i of hw.lock.secret.order) pointer(document.querySelector(`[aria-label="Candle ${i + 1}"]`), 'pointerdown');
    await tick(30);
    assert.ok(opened());
  });

  test(`ui moved (${level}): lights go out, then tap what changed`, { skip }, async () => {
    const { hw } = await reachPlay('moved', level);
    await waitFor(() => document.querySelectorAll('.slot').length > 0, 4000, 'the shelf after the dark');
    await pastMinSolve(hw, minSolveMs(hw.lock));
    const slots = [...document.querySelectorAll('.slot')];
    assert.equal(slots.length, hw.lock.view.slots);
    for (const i of hw.lock.secret.changed) click(slots[i]);
    click(buttonWith('These changed'));
    await tick(30);
    assert.ok(opened());
  });

  test(`ui moved (${level}): a wrong pick costs an attempt and keeps the game going`, { skip }, async () => {
    const { hw } = await reachPlay('moved', level, 777);
    await waitFor(() => document.querySelectorAll('.slot').length > 0, 4000, 'the shelf');
    await pastMinSolve(hw, minSolveMs(hw.lock));
    const slots = [...document.querySelectorAll('.slot')];
    const wrong = slots.findIndex((_, i) => !hw.lock.secret.changed.includes(i));
    click(slots[wrong]);
    click(buttonWith('These changed'));
    await tick(30);
    assert.ok(!opened());
    assert.equal(document.querySelectorAll('.pip.used').length, 1);
  });

  test(`ui lockpick (${level}): hold the tension and set every pin`, { skip }, async () => {
    const { hw } = await reachPlay('lockpick', level);
    const slider = document.querySelector('input[type=range].wide');
    const centers = hw.lock.secret.centers;
    pointer(slider, 'pointerdown');
    for (let i = 0; i < centers.length; i++) {
      if (i === centers.length - 1) await pastMinSolve(hw, minSolveMs(hw.lock)); // a real hand is not faster than the minimum
      slider.value = String(centers[i]);
      slider.dispatchEvent(new window.Event('input', { bubbles: true }));
      // wait for the pin itself (400 ms of frames), not a fixed time: frames slow down on a busy machine
      if (i < centers.length - 1) await waitFor(() => document.querySelectorAll('.pin.set').length > i, 8000, `pin ${i + 1} to set`);
      else await waitFor(opened, 8000, 'the lock to open').catch((e) => { throw new Error(`${e.message}; last verdict ${JSON.stringify(window.__hwVerdict)}`); });
    }
    assert.deepEqual(window.__errors, []);
    assert.ok(opened(), 'every pin set and the lock opened');
  });

  test(`ui lockpick (${level}): a pick that never rests in a window sets nothing`, { skip }, async () => {
    const { hw } = await reachPlay('lockpick', level);
    const slider = document.querySelector('input[type=range].wide');
    const c = hw.lock.secret.centers[0];
    pointer(slider, 'pointerdown');
    slider.value = String(c < 0 ? 38 : -38); // far from the first pin's window
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    await tick(700);
    assert.equal(document.querySelectorAll('.pin.set').length, 0);
    assert.ok(!opened());
  });

  test(`ui clock (${level}): drag the minute hand, then the hour hand`, { skip }, async () => {
    const { hw } = await reachPlay('clock', level);
    await pastMinSolve(hw, minSolveMs(hw.lock));
    const { h, m } = hw.lock.secret;
    const board = document.querySelector('svg.board');
    // minute hand: grab it at 12 o'clock (both hands rest there), drag to the minute
    let [x, y] = polar(150, 150, 104, 0);
    pointer(board, 'pointerdown', x, y);
    [x, y] = polar(150, 150, 104, m * 6);
    pointer(board, 'pointermove', x, y);
    pointer(board, 'pointerup', x, y);
    // hour hand: grab it where it is now (m / 2 degrees), at a short radius, and drag to the hour
    [x, y] = polar(150, 150, 50, m * 0.5);
    pointer(board, 'pointerdown', x, y);
    [x, y] = polar(150, 150, 50, (h % 12) * 30 + m * 0.5);
    pointer(board, 'pointermove', x, y);
    pointer(board, 'pointerup', x, y);
    assert.equal(document.querySelector('.big').textContent, `${h}:${String(m).padStart(2, '0')}`);
    click(buttonWith('Set this time'));
    await tick(30);
    assert.ok(opened());
  });

  test(`ui wires (${level}): drag each wire to its terminal`, { skip }, async () => {
    const { hw } = await reachPlay('wires', level);
    await pastMinSolve(hw, minSolveMs(hw.lock));
    const n = hw.lock.view.n, H = 70 + n * 62, ys = (i) => 50 + i * ((H - 100) / (n - 1));
    const board = document.querySelector('svg.board');
    hw.lock.view.leftOrder.forEach((w, li) => {
      const handle = board.querySelector(`[data-w="${w}"]`);
      pointer(handle, 'pointerdown', 50, ys(li));
      pointer(board, 'pointermove', 290, ys(hw.lock.secret.terminalOf[w]));
      pointer(board, 'pointerup', 290, ys(hw.lock.secret.terminalOf[w]));
    });
    const btn = buttonWith('Check the wires');
    assert.equal(btn.disabled, false);
    click(btn);
    await tick(30);
    assert.ok(opened());
  });

  test(`ui safe (${level}): turn the dial to each digit and Set`, { skip }, async () => {
    const { hw } = await reachPlay('safe', level);
    await pastMinSolve(hw, minSolveMs(hw.lock));
    const board = document.querySelector('svg.board');
    let theta = 0;
    for (const d of hw.lock.secret.code) {
      const want = -d * 36;
      let delta = ((want - theta + 540) % 360) - 180;
      const [x0, y0] = polar(150, 150, 100, 0), [x1, y1] = polar(150, 150, 100, delta);
      pointer(board, 'pointerdown', x0, y0);
      pointer(board, 'pointermove', x1, y1);
      pointer(board, 'pointerup', x1, y1);
      theta += delta;
      click(buttonWith('Set'));
    }
    await tick(30);
    assert.ok(opened());
  });

  test(`ui board (${level}): tap each letter of the word`, { skip }, async () => {
    const { hw } = await reachPlay('board', level);
    await pastMinSolve(hw, minSolveMs(hw.lock));
    const canvas = document.querySelector('canvas');
    for (const ch of hw.lock.secret.word) {
      const i = ch.charCodeAt(0) - 65, row = i < 13 ? 0 : 1, k = i % 13, t = k / 12;
      pointer(canvas, 'pointerdown', 26 + t * 288, (row ? 200 : 104) - 26 * Math.sin(Math.PI * t));
      pointer(canvas, 'pointerup', 26 + t * 288, (row ? 200 : 104) - 26 * Math.sin(Math.PI * t));
    }
    await tick(30);
    assert.ok(opened());
  });

  test(`ui words (${level}): light each letter and tap it in reading order`, { skip }, async () => {
    const { hw } = await reachPlay('words', level);
    await pastMinSolve(hw, minSolveMs(hw.lock));
    const canvas = document.querySelector('canvas');
    for (const idx of hw.lock.secret.order) {
      const l = hw.lock.view.letters[idx];
      pointer(canvas, 'pointerdown', l.x * 320, l.y * 320);
      await tick(260); // the beam eases onto the letter
      pointer(canvas, 'pointerup', l.x * 320, l.y * 320);
    }
    await tick(30);
    assert.ok(opened());
  });

  test(`ui photo (${level}): drag every piece into its slot and turn it upright`, { skip }, async () => {
    const { hw } = await reachPlay('photo', level);
    await pastMinSolve(hw, minSolveMs(hw.lock));
    const v = hw.lock.view, n = v.cols * v.rows, CELL = 100, BW = 300;
    const fx = (BW - v.cols * CELL) / 2;
    const pieces = () => [...document.querySelectorAll('[aria-label^="Piece"]')];
    const board = pieces()[0].parentElement;
    const slotPos = (s) => ({ x: fx + (s % v.cols) * CELL, y: Math.floor(s / v.cols) * CELL });
    for (let id = 0; id < n; id++) {
      const el = pieces().find((p) => p.getAttribute('aria-label') === `Piece ${id + 1}`);
      const px = parseFloat(el.style.left) - 2, py = parseFloat(el.style.top) - 2;
      const to = slotPos(id);
      pointer(el, 'pointerdown', px + 10, py + 10);
      pointer(board, 'pointermove', to.x + 10, to.y + 10);
      pointer(board, 'pointerup', to.x + 10, to.y + 10);
      assert.equal(Math.round(parseFloat(el.style.left)), Math.round(to.x + 2), `piece ${id} snapped into its slot`);
    }
    for (let id = 0; id < n; id++) {
      const el = pieces().find((p) => p.getAttribute('aria-label') === `Piece ${id + 1}`);
      for (let k = 0; k < (4 - v.turns0[id]) % 4; k++) { pointer(el, 'pointerdown', 150, 50); pointer(board, 'pointerup', 150, 50); }
    }
    const btn = buttonWith('Check the photo');
    assert.equal(btn.disabled, false);
    click(btn);
    await tick(30);
    assert.ok(opened());
  });
}

test('ui: touch only mode keeps every screen usable and records it in the result', { skip }, async () => {
  const { hw } = await reachPlay('musicbox', 'easy');
  click([...document.querySelectorAll('.chip')].find((c) => c.textContent.includes('Touch only')));
  await pastMinSolve(hw, minSolveMs(hw.lock));
  const keys = [...document.querySelectorAll('.key')];
  for (const n of hw.lock.secret.tune) click(keys[n]);
  await tick(30);
  assert.ok(opened());
  const saved = JSON.parse(localStorage.getItem('hw-playtest-results-v1'));
  assert.equal(saved.at(-1).touchOnly, true);
  assert.equal(saved.at(-1).outcome, 'solved');
  void SHELF_ITEMS;
});
