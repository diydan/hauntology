// Tilt is the default on a phone that has it: asked on the Start tap, never on a puzzle that does not use it,
// never after the Player turned it off, and a denial leaves the puzzle playable by touch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, install, tick, click, buttonWith, waitFor, pointer, pastMinSolve, opened } from './helpers.js';
import { minSolveMs } from '../js/core.js';
import { LETTER_POS } from '../js/kinds/board.js';

const skip = !JSDOM && 'jsdom not installed';

/** A phone: touch points, and a motion sensor with or without the iPhone permission call. */
function phone(kind, { permission = null, sensor = true, settings = null } = {}) {
  install(kind);
  const w = window;
  Object.defineProperty(w.navigator, 'maxTouchPoints', { value: 5, configurable: true });
  const calls = { orientation: 0, motion: 0, duringClick: false };
  if (sensor) {
    w.DeviceOrientationEvent = function DeviceOrientationEvent() {};
    w.DeviceMotionEvent = function DeviceMotionEvent() {};
    if (permission) {
      w.DeviceOrientationEvent.requestPermission = () => { calls.orientation++; return Promise.resolve(permission); };
      w.DeviceMotionEvent.requestPermission = () => { calls.motion++; return Promise.resolve(permission); };
    }
  }
  if (settings) localStorage.setItem('hw-playtest-v1', JSON.stringify(settings));
  return calls;
}
/** Feed orientation readings like a real phone held still, until stopped. */
function readings(beta = 45, gamma = 0) {
  const id = setInterval(() => { const ev = new window.Event('deviceorientation'); ev.alpha = 0; ev.beta = beta; ev.gamma = gamma; window.dispatchEvent(ev); }, 20);
  return () => clearInterval(id);
}
async function startPage(kind, { feed = true, memory = false } = {}) {
  const { start } = await import('../js/host.js');
  const mod = (await import(`../js/kinds/${kind}.js`)).default;
  start(mod);
  await tick(10);
  const stop = feed ? readings() : () => {};
  const btn = buttonWith('Start');
  click(btn);
  return { mod, stop, btn };
}
const finish = async (mod) => {
  for (let i = 0; i < 80 && !window.__hw; i++) {
    if (mod.memory && buttonWith('Got it')) click(buttonWith('Got it'));
    await tick(25);
  }
  assert.ok(window.__hw, 'the lock started');
  return window.__hw;
};

test('tilt default: an Android-like phone turns tilt on by itself when Start is tapped', { skip }, async () => {
  phone('lockpick');
  const { mod, stop } = await startPage('lockpick');
  const hw = await finish(mod);
  stop();
  assert.equal(hw.feel.tiltState, 'on');
  assert.equal(hw.feel.tiltOn, true);
  assert.match(document.querySelector('.chip[data-k="tilt"]').dataset.s, /on/);
  assert.match(document.body.textContent, /Tilt is on/);
  assert.equal(document.querySelector('button:not([hidden])') && [...document.querySelectorAll('button')].some((b) => b.textContent === 'Hold level' && !b.hidden), true, 'Hold level is offered');
});

test('tilt default: an iPhone-like phone is asked inside the Start tap itself', { skip }, async () => {
  const calls = phone('words', { permission: 'granted' });
  const { mod, stop } = await startPage('words');
  assert.equal(calls.orientation, 1, 'the orientation permission was requested during the tap, not after it');
  assert.equal(calls.motion, 1);
  const hw = await finish(mod);
  stop();
  assert.equal(hw.feel.tiltState, 'on');
});

test('tilt default: a denial is reported and the puzzle still plays by touch', { skip }, async () => {
  const calls = phone('maze', { permission: 'denied' });
  const { mod, stop } = await startPage('maze', { feed: false });
  const hw = await finish(mod);
  stop();
  assert.equal(calls.orientation, 1);
  assert.equal(hw.feel.tiltState, 'denied');
  assert.equal(hw.feel.tiltOn, false);
  assert.match(document.body.textContent, /Motion was denied/);
  assert.deepEqual(window.__errors, []);
});

test('tilt default: a phone with no motion sensor just plays by touch, without a long wait', { skip }, async () => {
  phone('lockpick', { sensor: false });
  const t0 = Date.now();
  const { mod, stop } = await startPage('lockpick', { feed: false });
  const hw = await finish(mod);
  stop();
  assert.equal(hw.feel.tiltState, 'unsupported');
  assert.ok(Date.now() - t0 < 1500, 'did not wait for a sensor that is not there');
});

test('tilt default: a puzzle that does not use tilt never asks for motion', { skip }, async () => {
  const calls = phone('musicbox', { permission: 'granted' });
  const { mod, stop } = await startPage('musicbox');
  await finish(mod);
  stop();
  assert.deepEqual([calls.orientation, calls.motion], [0, 0]);
});

test('tilt default: once the Player turned tilt off it is not turned on again', { skip }, async () => {
  const calls = phone('lockpick', { permission: 'granted', settings: { tilt: 'off' } });
  const { mod, stop } = await startPage('lockpick');
  await finish(mod);
  stop();
  assert.deepEqual([calls.orientation, calls.motion], [0, 0]);
});

test('tilt default: Touch only means no motion request at all', { skip }, async () => {
  const calls = phone('lockpick', { permission: 'granted', settings: { touchOnly: true } });
  const { mod, stop } = await startPage('lockpick');
  await finish(mod);
  stop();
  assert.deepEqual([calls.orientation, calls.motion], [0, 0]);
});

test('tilt default: turning tilt off with the chip is remembered for the next page', { skip }, async () => {
  phone('lockpick');
  const { mod, stop } = await startPage('lockpick');
  const hw = await finish(mod);
  assert.equal(hw.feel.tiltState, 'on');
  click(document.querySelector('.chip[data-k="tilt"]'));
  await tick(20);
  stop();
  assert.equal(hw.feel.tiltState, 'off');
  assert.equal(JSON.parse(localStorage.getItem('hw-playtest-v1')).tilt, 'off');
});

test('spirit board with tilt: the planchette settles on a letter and a tap anywhere picks it', { skip }, async () => {
  phone('board');
  const { mod, stop } = await startPage('board');
  const hw = await finish(mod);
  assert.equal(hw.feel.tiltOn, true);
  await pastMinSolve(hw, minSolveMs(hw.lock));
  const stage = document.querySelector('.stage'), canvas = document.querySelector('canvas');
  for (const ch of hw.lock.secret.word) {
    const p = LETTER_POS[ch.charCodeAt(0) - 65];
    stage.__ball.x = p.x + 6; stage.__ball.y = p.y - 5; stage.__ball.vx = stage.__ball.vy = 0; // rolled near the letter
    await tick(60);
    pointer(canvas, 'pointerdown', 3, 3); pointer(canvas, 'pointerup', 3, 3); // a tap in empty space
  }
  await tick(30);
  stop();
  assert.ok(opened(), 'the word was spelled with tilt and taps');
});

test('spirit board with tilt: the pull of a letter brings a slow planchette to rest on it', { skip }, async () => {
  phone('board');
  const { mod, stop } = await startPage('board');
  const hw = await finish(mod);
  const stage = document.querySelector('.stage');
  const p = LETTER_POS[4]; // E
  stage.__ball.x = p.x + 11; stage.__ball.y = p.y + 14; stage.__ball.vx = stage.__ball.vy = 0; // nearer to E than to F or to the row below
  await tick(700);
  stop();
  assert.ok(Math.hypot(stage.__ball.x - p.x, stage.__ball.y - p.y) < 6, `rests on the letter (${Math.round(Math.hypot(stage.__ball.x - p.x, stage.__ball.y - p.y))} px away)`);
  void hw;
});
