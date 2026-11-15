// Guards for the Spirit table mockup (ar.html). There is no WebGL in jsdom, so these check the files, not the picture:
// the trimmed three.js bundle exports every name ar.js uses, the art files exist, and the page is reachable from the menu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './helpers.js';
import { placeFor, SLANT, MIN_DROP } from '../js/ar-place.js';

const read = (f) => readFileSync(resolve(root, f), 'utf8');
const js = read('js/ar.js');

test('the vendored three.js exports every name ar.js uses', () => {
  const used = [...new Set([...js.matchAll(/THREE\.([A-Za-z0-9_]+)/g)].map((m) => m[1]))];
  assert.ok(used.length > 10, 'found the names');
  const bundle = read('js/vendor/three.js');
  const exports = bundle.slice(bundle.lastIndexOf('export{'));
  const missing = used.filter((n) => !new RegExp(`as ${n}[,}]`).test(exports));
  assert.deepEqual(missing, [], 'rebuild js/vendor/three.js with these names added');
  assert.ok(existsSync(resolve(root, 'js/vendor/three.LICENSE.txt')), 'the three.js licence ships next to it');
});

test('every art file the page loads exists, and is small enough for a phone', () => {
  const ids = [...js.matchAll(/\{ id: '([a-z]+)', name: '[^']+', room:/g)].map((m) => m[1]);
  assert.ok(ids.length >= 6, 'six Suspects found');
  for (const id of [...ids.filter((i) => !['key', 'candle', 'locket'].includes(i)), 'whisper']) {
    const f = resolve(root, `art/${id}.webp`);
    assert.ok(existsSync(f), `art/${id}.webp`);
    assert.ok(readFileSync(f).length < 120_000, `art/${id}.webp stays under 120 kB`);
  }
});

test('the page wires its script and style, and the menu links to it', () => {
  const html = read('ar.html');
  assert.match(html, /js\/ar\.js/);
  assert.match(html, /css\/ar\.css/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(read('js/index.js'), /href: 'ar\.html'/);
});

test('every button is at least 48 px tall and the buttons share one row', () => {
  const css = read('css/ar.css');
  assert.match(css, /#bar button \{[^}]*min-height: 52px/);
  assert.match(css, /grid-template-columns: repeat\(4, 1fr\)/);
});

test('the build ships the art and lets the page use the camera', () => {
  const build = read('build.mjs');
  assert.match(build, /'art'/);
  assert.match(build, /camera=\(self\)/);
});

test('clues: all four kinds exist, the code has pieces 1 to 4, and every number is made up', () => {
  for (const k of ['pin', 'address', 'phone', 'date']) assert.match(js, new RegExp(`kind: '${k}'`), k);
  assert.equal([...js.matchAll(/kind: 'pin', n: (\d)/g)].map((m) => m[1]).join(''), '1234');
  const phone = js.match(/kind: 'phone', text: '([^']+)'/);
  assert.ok(phone, 'a phone clue');
  assert.match(phone[1], /^555-01\d\d$/, 'the 555-01xx range is reserved for fiction, so it never rings a stranger');
});

test('the clue list, the arrow and the Clues button are in the page, with 48 px buttons and a text way in', () => {
  const html = read('ar.html'), css = read('css/ar.css');
  for (const id of ['sheet', 'clue-list', 'code-line', 'arrow', 'b-clues', 't-list', 't-notes']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(css, /#sheet button \{[^}]*min-height: 48px/);
  assert.match(js, /markFound\(o, true\)/, 'Show all as text reveals every clue without looking around');
  assert.match(css, /\[hidden\] \{ display: none !important; \}/, 'hidden panels stay hidden');
});

// ---- Place: the board must land where the phone points (it once landed behind the Player when Tilt switched on)
const rng = (() => { let a = 12345; return () => ((a = (a * 1664525 + 1013904223) % 4294967296) / 4294967296); })();
const unit = () => { const y = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - y * y); return { x: r * Math.sin(a), y, z: r * Math.cos(a) }; };
const angleBetween = (u, v) => Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / (Math.hypot(u.x, u.y, u.z) * Math.hypot(v.x, v.y, v.z)))));

test('Place: the board is in front of the phone, below it, facing it, and in view unless the phone points up', () => {
  for (let i = 0; i < 2000; i++) {
    const f = unit(), p = placeFor(f);
    assert.ok([p.x, p.y, p.z, p.facing].every(Number.isFinite), 'finite');
    assert.ok(p.y <= -MIN_DROP + 1e-9, 'never higher than a table 28 cm below the phone');
    const slant = Math.hypot(p.x, p.y, p.z);
    assert.ok(slant > SLANT - 0.02 && slant < 0.92, `a sensible distance (${slant})`);
    if (f.y <= 0.1) assert.ok(angleBetween(f, p) < (30 * Math.PI) / 180 + 1e-9, 'in view when the phone is level or points down');
    const across = Math.hypot(p.x, p.z);
    assert.ok((p.x * Math.sin(p.facing) + p.z * Math.cos(p.facing)) / across < -0.999, 'the front edge faces the phone');
  }
});

test('Place: the same view turned to any heading puts the board the same way round, and straight down keeps the last heading', () => {
  for (let i = 0; i < 500; i++) {
    const f = unit(), th = rng() * Math.PI * 2, c = Math.cos(th), s2 = Math.sin(th);
    const g = { x: f.x * c + f.z * s2, y: f.y, z: -f.x * s2 + f.z * c };
    const p = placeFor(f), q = placeFor(g, p.heading);
    assert.ok(Math.abs(p.y - q.y) < 1e-9 && Math.abs(Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z)) < 1e-9, 'heading does not change the height or the distance');
  }
  const down = placeFor({ x: 0, y: -1, z: 0 }, { x: 1, z: 0 });
  assert.ok(down.x > 0.25 && Math.abs(down.z) < 1e-9, 'straight down keeps the last heading');
  assert.ok(Number.isFinite(placeFor({ x: NaN, y: 0, z: 0 }).y), 'a bad reading does not break it');
});

test('Place aims the camera from the phone before it reads the direction (the Tilt bug)', () => {
  assert.match(js, /function place\(\) \{\s*aimCamera\(0\);/, 'place() must aim the camera first');
  assert.match(js, /function aimCamera\(sway\) \{\s*if \(S\.tilt && S\.dev\) deviceQuat/, 'aimCamera uses the phone when Tilt is on');
});

test('the clue hint is a ring with a question mark that shows on any picture, and an arrow points to the board when it is out of view', () => {
  assert.match(js, /const hintTex = canvasTex/);
  assert.doesNotMatch(js, /map: hintTex[^)]*AdditiveBlending/, 'not an additive glow, which vanishes over a camera picture');
  assert.match(read('ar.html'), /id="arrow-board"/);
});
