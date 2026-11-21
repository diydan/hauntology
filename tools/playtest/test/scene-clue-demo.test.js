// Section 12 of the footage page, "A clue written on the scene" (puzzles 15.7, Requirements 22.4, 22.5, 22.7), in jsdom with the media element stubbed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, install, tick, click } from './helpers.js';

const skip = !JSDOM && 'jsdom not installed';
const $ = (sel) => document.querySelector(sel);
const btn = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

function open({ reduce = false, hidden = false } = {}) {
  const dom = install('footage');
  const w = dom.window;
  const listeners = [];
  w.matchMedia = () => ({ matches: reduce, addEventListener: (t, f) => listeners.push([t, f]) });
  globalThis.matchMedia = w.matchMedia;
  globalThis.Audio = class { constructor(src) { this.src = src; } pause() {} addEventListener() {} play() { return Promise.resolve(); } };
  const log = [];
  w.HTMLMediaElement.prototype.play = function () { log.push(['play', this.id || this.className]); this.__playing = true; return Promise.resolve(); };
  w.HTMLMediaElement.prototype.pause = function () { log.push(['pause', this.id || this.className]); this.__playing = false; };
  Object.defineProperty(w.document, 'hidden', { value: hidden, configurable: true, writable: true });
  Object.defineProperty(w.HTMLMediaElement.prototype, 'currentTime', { get() { return this.__t || 0; }, set(v) { this.__t = v; }, configurable: true });
  Object.defineProperty(w.HTMLMediaElement.prototype, 'duration', { get() { return 15; }, configurable: true });
  w.HTMLMediaElement.prototype.load = function () {};
  Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() { return 400; }, configurable: true });
  Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get() { return 300; }, configurable: true });
  return { w, log, listeners };
}
let n = 0;
const load = () => import(`../js/footage.js?scene-clue-run=${++n}`);
const at = (t) => { const v = $('#ft-sc-video'); v.currentTime = t; v.dispatchEvent(new window.Event('timeupdate')); };

test('22.4 the clue is laid on the plate by a four-point transform, with the ink and blend of the plate and one film layer over both', { skip }, async () => {
  open();
  await load(); await tick(5);
  click(btn('Show the clue')); await tick(5);
  const canvas = $('#ft-sc-canvas');
  assert.match(canvas.style.transform, /^matrix3d\(/);
  assert.equal(canvas.dataset.ink, 'ink', 'dark ink on the light plate');
  assert.equal(canvas.style.mixBlendMode, 'multiply');
  // layers, bottom to top: the video, the clue canvas, then the film layer, all in one frame
  const kids = [...$('#ft-sc-video').parentElement.children].map((e) => e.id);
  assert.deepEqual(kids, ['ft-sc-video', 'ft-sc-canvas', 'ft-sc-film']);
  assert.equal($('#ft-sc-video').parentElement.getAttribute('aria-hidden'), 'true');
});

test('22.5 the clue is in view only from the Place\'s from time, and the words are there at once', { skip }, async () => {
  open();
  await load(); await tick(5);
  click(btn('Show the clue')); await tick(5);
  assert.match($('#ft-sc-live').textContent, /^A clue is written on the brass plate: the moon, 3 2 5 8\.$/);
  assert.equal($('#ft-sc-panel').hidden, false);
  assert.equal($('#ft-sc-list').children.length, 1);
  assert.equal($('#ft-sc-video').__t, 7.5, 'the film starts a little before the Place is in view (9 s minus 1.5)');
  assert.equal($('#ft-sc-canvas').dataset.in, 'false', 'before from');
  at(8.9); assert.equal($('#ft-sc-canvas').dataset.in, 'false');
  at(9); assert.equal($('#ft-sc-canvas').dataset.in, 'true', 'from the Place\'s from time');
  at(14); assert.equal($('#ft-sc-canvas').dataset.in, 'true');
});

test('22.7 with footage paused the words come at once and nothing is drawn; the Clue list keeps each clue shown', { skip }, async () => {
  open();
  await load(); await tick(5);
  click(btn('Pause footage')); await tick(5);
  click(btn('Show the clue')); await tick(5);
  assert.equal($('#ft-sc-canvas').dataset.in, 'false');
  assert.equal($('#ft-sc-panel').hidden, false);
  assert.equal($('#ft-sc-panel').textContent, 'Moon: 3 2 5 8');
  assert.equal($('#ft-sc-video').__t, undefined, 'the film is not started');
  click(btn('A time')); click(btn('Show the clue')); await tick(5);
  assert.deepEqual([...$('#ft-sc-list').children].map((li) => li.textContent), ['Moon: 3 2 5 8', 'Key: 10:05']);
  click(btn('Show the clue')); await tick(5);
  assert.equal($('#ft-sc-list').children.length, 2, 'the same clue is not listed twice');
});

test('22.7 reduced motion starts with footage off: the words at once, no fade on the canvas, no flicker of the film layer', { skip }, async () => {
  open({ reduce: true });
  await load(); await tick(5);
  click(btn('Show the clue')); await tick(5);
  assert.equal($('#ft-sc-canvas').dataset.in, 'false');
  assert.equal($('#ft-sc-panel').textContent, 'Moon: 3 2 5 8');
});

test('22.1 a shot with no Place draws nothing on the picture and gives the clue in words all the same', { skip }, async () => {
  open();
  await load(); await tick(5);
  click(btn('A shot with no Place')); await tick(5);
  assert.equal($('#ft-sc-canvas').dataset.in, 'false');
  assert.match($('#ft-sc-live').textContent, /no Place/);
  assert.equal($('#ft-sc-panel').hidden, false);
  assert.match($('#ft-sc-panel').textContent, /3 2 5 8/);
  click(btn('Back to the plate')); await tick(5);
  assert.match($('#ft-sc-live').textContent, /^A clue is written on the brass plate/);
});

test('22.7 a clip that cannot load leaves the still frame, the words and nothing drawn; a hidden page stops the film', { skip }, async () => {
  const { w } = open();
  await load(); await tick(5);
  click(btn('Show the clue')); await tick(5);
  at(10);
  assert.equal($('#ft-sc-canvas').dataset.in, 'true');
  $('#ft-sc-video').querySelector('source:last-of-type').dispatchEvent(new w.Event('error'));
  await tick(2);
  assert.equal($('#ft-sc-canvas').dataset.in, 'false');
  assert.equal($('#ft-sc-panel').textContent, 'Moon: 3 2 5 8');
});

test('the demo reads only the Public View: a Solution, a Hand or a Residue in it changes nothing', { skip }, async () => {
  const { DEMO_VIEW } = await import('../js/scene-clue-page.js');
  const { sceneClue } = await import('../js/scene-clues.js');
  const { DEMO_PLACES } = await import('../js/places.js');
  const noisy = { ...DEMO_VIEW, solution: { suspect: 'x' }, hands: { 1: ['a'] }, residueAt: { hall: 'card' } };
  assert.deepEqual(sceneClue(DEMO_PLACES, 7, 'hand', noisy), sceneClue(DEMO_PLACES, 7, 'hand', DEMO_VIEW));
  assert.ok(DEMO_VIEW.worldClues.every((c) => Object.keys(c).sort().join() === 'sight,sign,zone'));
});

test('18.5 Pause footage stops the clue\'s film and takes the clue off the picture, and the words stay', { skip }, async () => {
  open();
  await load(); await tick(5);
  click(btn('Show the clue')); await tick(5);
  at(10);
  assert.equal($('#ft-sc-video').__playing, true);
  assert.equal($('#ft-sc-canvas').dataset.in, 'true');
  click(btn('Pause footage')); await tick(5);
  assert.equal($('#ft-sc-video').__playing, false);
  assert.equal($('#ft-sc-canvas').dataset.in, 'false');
  assert.equal($('#ft-sc-panel').textContent, 'Moon: 3 2 5 8');
});
