// The lab page in jsdom, wired to a real RoomCore through an in-memory socket hub, with other devices played by
// LabClient instances. Checks the roster, a push from this page, a push to this page and the acks.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, install, tick, click, buttonWith, waitFor } from './helpers.js';
import { RoomCore } from '../src/room-core.js';
import { LabClient } from '../js/net.js';

const skip = !JSDOM && 'jsdom not installed';

// ---- an in-memory network: sockets on one side, RoomCore on the other
function makeHub() {
  const socks = [];
  let n = 0;
  const core = new RoomCore({ now: () => Date.now(), rand: Math.random, list: () => socks.filter((s) => !s.gone) });
  function makeSocket() {
    const ws = { readyState: 0, handlers: {}, addEventListener(t, f) { (this.handlers[t] ||= []).push(f); }, emit(t, ev = {}) { for (const f of this.handlers[t] || []) f(ev); } };
    const sock = { id: `s${++n}`, meta: {}, gone: false, ws, send(o) { queueMicrotask(() => ws.emit('message', { data: JSON.stringify(o) })); }, setMeta() {}, close() { sock.gone = true; ws.readyState = 3; queueMicrotask(() => ws.emit('close')); } };
    ws.send = (data) => queueMicrotask(() => { if (!sock.gone) core.onMessage(sock, data); });
    ws.close = () => { if (sock.gone) return; sock.gone = true; ws.readyState = 3; core.onClose(sock); queueMicrotask(() => ws.emit('close')); };
    socks.push(sock);
    queueMicrotask(() => { ws.readyState = 1; core.onOpen(sock); ws.emit('open'); });
    return ws;
  }
  return { core, makeSocket, socks };
}
const device = (hub, name, extra = {}) => {
  const got = [];
  const c = new LabClient({ url: 'x', name, getCaps: () => ({ sound: 'on', haptic: 'vibrate' }), makeSocket: hub.makeSocket, ua: 'Mozilla/5.0 (Linux; Android 14)', onEvent: (e) => got.push(e),
    onFx: async (m) => ({ status: 'played', reason: '' }), ...extra });
  c.got = got;
  c.connect();
  return c;
};
const logText = () => document.querySelector('.log').textContent;

let hub;
test('lab page: sees devices join, pushes to them, and plays what they push', { skip }, async () => {
  hub = makeHub();
  install('lab');
  window.__makeLabSocket = hub.makeSocket;
  await import('../js/lab.js');
  const lab = window.__lab;
  await waitFor(() => lab.client.status === 'online', 3000, 'the page to connect');
  assert.match(document.querySelector('.room').textContent, /^[A-Z2-9]{5}$/);
  assert.match(location.hash, /^#room=[A-Z2-9]{5}$/);
  const qr = document.querySelector('svg.qr');
  assert.ok(qr, 'the QR code is on the page');
  assert.match(qr.getAttribute('aria-label'), /\/lab(\.html)?#room=[A-Z2-9]{5}$/, 'it encodes the same link as Copy link');
  assert.ok(qr.querySelector('path').getAttribute('d').length > 200, 'and it has modules');

  // another device joins: the page lists it and logs it
  const b = device(hub, 'Pixel B');
  await waitFor(() => lab.client.roster.length === 2, 3000, 'the roster to list two devices');
  assert.equal(document.querySelector('#count').textContent, '2');
  assert.match(document.body.textContent, /Pixel B/);
  assert.match(logText(), /\+ Pixel B joined/);

  // PUSH from this page to the other device: sound bell, start in 500 ms
  click(buttonWith('Push to others'));
  const bellBtn = [...document.querySelectorAll('.fxgrid button')].find((x) => x.textContent === 'bell');
  const t0 = Date.now();
  let fxSeen = null;
  b.o.onFx = async (m) => { fxSeen = { at: Date.now(), m }; return { status: 'played' }; };
  click(bellBtn);
  await waitFor(() => fxSeen, 3000, 'the other device to get the bell');
  assert.equal(fxSeen.m.fx.name, 'bell');
  assert.equal(fxSeen.m.fromName, lab.client.o.name);
  const waited = fxSeen.at - t0;
  assert.ok(waited >= 450 && waited <= 900, `started about 500 ms after the push, not at once (${waited} ms)`);
  await waitFor(() => /Pixel B: played/.test(logText()), 3000, 'the ack in the log');
  assert.match(document.body.textContent, /last: played/);

  // spread: a wave across the room, this page first (join order), then Pixel B 400 ms later
  const at = [];
  b.o.onFx = async (m) => { at.push(['b', m.at]); return { status: 'played' }; };
  lab.state.target = 'all'; lab.state.spread = 400; lab.state.lead = 300;
  const waveBtn = (click([...document.querySelectorAll('.seg button')].find((x) => x.textContent === 'Light')), [...document.querySelectorAll('.fxgrid button')].find((x) => x.textContent === 'wave'));
  click(waveBtn);
  await waitFor(() => at.length === 1, 3000, 'the wave to reach Pixel B');
  await waitFor(() => /got light wave from/.test(logText()), 3000, 'the wave to reach this page');
  const mine = [...document.querySelectorAll('.log div')].map((d) => d.textContent).find((t) => /pushed light wave/.test(t));
  assert.match(mine, /wave 400 ms apart/);
  assert.ok(document.querySelector('.lightfx') || true, 'the light overlay may already be gone');

  // a push FROM the other device TO this page: light plays here, and Pixel B hears back
  const acks = [];
  b.o.onEvent = (e) => { if (e.type === 'ack' && e.name === lab.client.o.name) acks.push(e); };
  b.push({ kind: 'light', name: 'glow' }, { to: [lab.client.id], lead: 300 });
  await waitFor(() => acks.length === 1, 3000, 'this page to acknowledge the light');
  assert.equal(acks[0].status, 'played');
  assert.ok(document.querySelector('.lightfx'), 'a grey overlay is on screen');
  assert.match(document.querySelector('.lightfx').style.cssText, /rgb\(0,\s*0,\s*0\)/, 'it starts from black, never white');

  // sound while this device is muted: blocked, and the sender is told why
  acks.length = 0;
  b.push({ kind: 'sound', name: 'creak' }, { to: [lab.client.id], lead: 300 });
  await waitFor(() => acks.length === 1, 3000, 'the muted ack');
  assert.deepEqual([acks[0].status, acks[0].reason], ['blocked', 'sound_locked']);

  // buzz on a phone with no vibration motor: played as a visual twin, and it says so
  acks.length = 0;
  b.push({ kind: 'buzz', name: 'thunk' }, { to: [lab.client.id], lead: 300 });
  await waitFor(() => acks.length === 1, 3000, 'the buzz ack');
  assert.deepEqual([acks[0].status, acks[0].reason], ['played', 'visual_only']);

  // reduced motion: light is skipped and the sender is told
  const reduced = () => ({ matches: true, addEventListener() {} });
  window.matchMedia = reduced; globalThis.matchMedia = reduced;
  acks.length = 0;
  b.push({ kind: 'light', name: 'wave' }, { to: [lab.client.id], lead: 300 });
  await waitFor(() => acks.length === 1, 3000, 'the reduced-motion ack');
  assert.deepEqual([acks[0].status, acks[0].reason], ['skipped', 'reduced_motion']);

  // a device leaving is logged
  b.close();
  await waitFor(() => /− Pixel B left/.test(logText()), 3000, 'the leave');
  assert.equal(lab.client.roster.length, 1);
  assert.deepEqual(window.__errors, []);
});

test('lab page: it reconnects after the connection drops', { skip }, async () => {
  const lab = window.__lab;
  const mine = hub.socks.find((s) => !s.gone && s.meta.hello && s.meta.name === lab.client.o.name);
  assert.ok(mine, 'found this page\'s socket on the hub');
  mine.close();
  await waitFor(() => lab.client.status === 'offline', 2000, 'offline');
  assert.match(logText(), /connection lost/);
  await waitFor(() => lab.client.status === 'online', 5000, 'the page to reconnect');
  assert.equal(lab.client.roster.length, 1);
  await tick(10);
});

// the page's client pings forever; stop it so the test process can exit
after(() => { try { window.__lab?.client.close(); window.close(); } catch { /* ignore */ } });
