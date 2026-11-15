// Smoke test: load every puzzle page in jsdom, press Start, pass the Sight, let the frame loop run, then solve it
// with the reference transcript and fail it three times. Canvas, SVG geometry and Element.animate are stubbed.
// Skips itself when jsdom is not installed (it lives in web/node_modules).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM, KINDS, root, reachPlay, tick } from './helpers.js';

for (const kind of KINDS) {
  test(`page ${kind}: loads, plays, solves`, { skip: !JSDOM && 'jsdom not installed' }, async () => {
    const { hw } = await reachPlay(kind, 'easy');
    await tick(150); // let the frame loop run the kind's tick code
    assert.ok(document.querySelector('.stage').children.length > 0, 'the stage has content');
    assert.match(document.querySelector('.timer').textContent, /\d\.\d s/, 'the frame loop ran and the timer moved');
    assert.deepEqual(window.__errors, [], 'no errors thrown in the frame loop');
    const { referenceSolve } = await import('../js/core.js');
    const v = hw.submit(referenceSolve(hw.lock));
    assert.deepEqual(v, { ok: true });
    await tick(20);
    assert.match(document.body.textContent, /Opened/);
    window.close?.();
    delete window.__hw;
  });

  test(`page ${kind}: three wrong attempts fail the lock`, { skip: !JSDOM && 'jsdom not installed' }, async () => {
    const { hw } = await reachPlay(kind, 'normal');
    for (let i = 0; i < 3; i++) hw.submit({ kind, elapsedMs: 99999 });
    await tick(20);
    assert.match(document.body.textContent, /Nothing came loose/);
    assert.match(document.body.textContent, /attempts/);
    delete window.__hw;
  });
}

test('every page file exists and wires its own kind', () => {
  for (const kind of KINDS) {
    const f = resolve(root, `${kind}.html`);
    assert.ok(existsSync(f), `${kind}.html`);
    assert.match(readFileSync(f, 'utf8'), new RegExp(`kinds/${kind}\\.js`));
  }
  for (const f of ['index.html', 'check.html']) assert.ok(existsSync(resolve(root, f)));
});

test('no network calls and no recording in the playtest code', () => {
  const files = ['host.js', 'feel.js', 'check.js', 'index.js', 'dom.js', 'core.js', ...KINDS.map((k) => `kinds/${k}.js`)];
  for (const f of files) {
    const src = readFileSync(resolve(root, 'js', f), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|MediaRecorder/, f);
  }
});
