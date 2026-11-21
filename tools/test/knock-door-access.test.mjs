// Knock-door 9.2 and 9.3 (fairness and access): the door screens are touch only, never flash, and say each change in words.
// Run: node --test tools/test/knock-door-access.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const DOOR_FILES = ['web/src/party/controller/DoorControls.tsx', 'web/src/party/display/DoorDiorama.tsx', 'shared/src/party/door-markers.ts'];

test('9.2: no door screen needs a key, a motion sensor, a microphone, a camera, a long press or a drag', () => {
  for (const f of DOOR_FILES) {
    const c = code(f);
    for (const bad of [/devicemotion|DeviceMotionEvent|DeviceOrientation/i, /getUserMedia|MediaRecorder/, /onKey(Down|Up|Press)|keydown|keyup/i, /onPointer(Down|Up|Move)|onTouch(Start|End|Move)|onDrag|draggable|onContextMenu|onDoubleClick/]) {
      assert.ok(!bad.test(c), `${f} uses ${bad}`);
    }
  }
});

test('9.2: every control on the phone is a plain button that a tap fires (onClick)', () => {
  const c = code('web/src/party/controller/DoorControls.tsx');
  const buttons = [...c.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(buttons.length >= 5, `${buttons.length} buttons`);
  // a button may span lines, so read up to the first `>` that is not inside an arrow
  for (const m of c.matchAll(/<button\b([\s\S]*?)>\s*[\w{(]/g)) assert.match(m[1], /type="button"/, 'a button without type="button"');
  assert.equal([...c.matchAll(/<button\b/g)].length, [...c.matchAll(/onClick=/g)].length, 'every button has an onClick and nothing else has one');
});

test('9.3: no door style flashes or loops: no animation, no keyframes, and the swing uses only the one slow fade and the one easing', () => {
  const css = read('web/src/party/host/host.css');
  const doorRules = [...css.matchAll(/([^{}]*\.pd-door[^{}]*)\{([^{}]*)\}/g)];
  assert.ok(doorRules.length >= 5, `${doorRules.length} door rules`);
  for (const [, sel, body] of doorRules) {
    assert.ok(!/animation|@keyframes|blink|opacity\s*:/.test(body), `${sel.trim()} animates or fades`);
    for (const m of body.matchAll(/transition\s*:\s*([^;]*)/g)) {
      if (m[1].trim() === 'none') continue;
      assert.match(m[1], /^transform var\(--fade-slow\) var\(--ease\)$/, `${sel.trim()} transition: ${m[1]}`);
    }
  }
  assert.ok(/\[data-motion="none"\][^{]*\{[^}]*transition:\s*none/.test(css), 'reduced motion removes the swing');
  assert.ok(!/@keyframes[^{]*door/i.test(css), 'a door keyframe');
});

test('9.3: the Display tells its door changes in a polite live region, and the phone does too', () => {
  assert.match(code('web/src/party/display/DisplayPage.tsx'), /aria-live="polite" data-door-live/);
  assert.match(code('web/src/party/controller/DoorControls.tsx'), /role="status" aria-live="polite"/);
});
