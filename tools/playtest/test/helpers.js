// Shared setup for the jsdom page tests: a fake browser with the few things jsdom lacks.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const here = fileURLToPath(new URL('.', import.meta.url));
export const root = resolve(here, '..');
let JSDOMClass = null;
try { JSDOMClass = createRequire(resolve(root, '../../web/package.json'))('jsdom').JSDOM; } catch { /* the tests skip themselves */ }
export const JSDOM = JSDOMClass;
export const KINDS = ['lockpick', 'wires', 'clock', 'safe', 'musicbox', 'candles', 'moved', 'photo', 'words', 'board', 'maze'];

const noop = () => {};
const ctxStub = () => new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });

export function install(kind, level = 'easy', seed = 4242) {
  const html = readFileSync(resolve(root, `${kind}.html`), 'utf8');
  const dom = new JSDOM(html, { url: `https://playtest.test/${kind}.html#seed=${seed}&level=${level}`, pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  w.__errors = [];
  w.addEventListener('error', (e) => w.__errors.push(String(e.error?.stack || e.message)));
  w.HTMLCanvasElement.prototype.getContext = () => ctxStub();
  w.Element.prototype.animate = () => ({});
  w.HTMLDialogElement.prototype.showModal = noop;
  w.HTMLDialogElement.prototype.close = noop;
  w.Element.prototype.setPointerCapture = noop;
  // geometry: every box sits at 0,0 and is as big as its viewBox, canvas size or style size, so pointer
  // coordinates in a test are the same numbers the screen uses
  w.Element.prototype.getBoundingClientRect = function () {
    const tag = this.tagName.toLowerCase();
    let width = 0, height = 0;
    if (tag === 'svg') { const vb = (this.getAttribute('viewBox') || '0 0 0 0').split(/\s+/).map(Number); width = vb[2]; height = vb[3]; }
    else if (tag === 'canvas') { width = Number(this.getAttribute('width')); height = Number(this.getAttribute('height')); }
    else { width = parseFloat(this.style.width) || 0; height = parseFloat(this.style.height) || 0; }
    return { left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0 };
  };
  w.SVGSVGElement.prototype.getScreenCTM = () => ({ inverse: () => ({}) });
  w.SVGSVGElement.prototype.createSVGPoint = () => { const p = { x: 0, y: 0, matrixTransform: () => ({ x: p.x, y: p.y }) }; return p; };
  w.matchMedia = () => ({ matches: false, addEventListener: noop });
  const set = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  for (const k of ['Node', 'HTMLElement', 'localStorage', 'history', 'location', 'screen']) set(k, w[k]);
  set('window', w); set('document', w.document); set('navigator', w.navigator);
  set('requestAnimationFrame', (fn) => w.requestAnimationFrame(fn));
  set('cancelAnimationFrame', (id) => w.cancelAnimationFrame(id));
  set('matchMedia', w.matchMedia);
  set('innerHeight', 800);
  return dom;
}
export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
export const click = (el) => el.dispatchEvent(new window.Event('click', { bubbles: true }));
export const buttonWith = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(text));
/** A pointer event on an element (a MouseEvent with a pointer name: the screens only read clientX, clientY). */
export const pointer = (el, type, x = 0, y = 0) => el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
export async function waitFor(fn, ms = 6000, label = 'condition') {
  const t0 = Date.now();
  while (!fn()) { if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${label}`); await tick(15); }
}

export async function reachPlay(kind, level = 'easy', seed = 4242) {
  install(kind, level, seed);
  const { start } = await import('../js/host.js');
  const mod = (await import(`../js/kinds/${kind}.js`)).default;
  start(mod);
  await tick(10);
  click(buttonWith('Start'));
  await tick(20);
  if (mod.memory) { click(buttonWith('Got it')); await tick(20); }
  for (let i = 0; i < 40 && !window.__hw; i++) await tick(10);
  assert.ok(window.__hw, `${kind}: the Lock started`);
  assert.equal(window.__hw.lock.kind, kind);
  return { mod, hw: window.__hw };
}
/** Wait until the lock has been open long enough that the minimum solve time has passed. */
export async function pastMinSolve(hw, minSolveMs) {
  await waitFor(() => hw.ctx.elapsed() > minSolveMs + 150, minSolveMs + 4000, 'minimum solve time');
}
export function opened() { return /Opened/.test(document.body.textContent); }
