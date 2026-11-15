// Guards for the Spirit table mockup (ar.html). There is no WebGL in jsdom, so these check the files, not the picture:
// the trimmed three.js bundle exports every name ar.js uses, the art files exist, and the page is reachable from the menu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './helpers.js';

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
