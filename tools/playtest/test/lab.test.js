// Device lab: clock sync, light plans, the protocol, the room logic and the Worker routing. Node only, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateOffset, sampleOffset, serverNow, deviceTimeFor } from '../js/sync.js';
import { lightPlan, lightPlanOk, lightKeyframes, LIGHT_NAMES, LIGHT_MAX_MS } from '../js/light.js';
import * as P from '../js/protocol.js';
import { rngFrom } from '../js/core.js';
import { RoomCore } from '../src/room-core.js';
import { handle } from '../src/route.js';

// ------------------------------------------------------------ clock sync
test('sync: symmetric trips give the exact offset, and the smallest round trip wins', () => {
  const offset = 4321; // server clock is 4321 ms ahead
  const mk = (t0, up, down) => ({ t0, ts: t0 + up + offset, t1: t0 + up + down });
  const best = estimateOffset([mk(0, 90, 90), mk(1000, 20, 20), mk(2000, 150, 150)]);
  assert.equal(best.rtt, 40);
  assert.equal(best.offset, offset);
  assert.equal(best.err, 20);
});

test('sync: the error is never more than half the round trip, however lopsided the trip', () => {
  const r = rngFrom(7);
  for (let i = 0; i < 500; i++) {
    const offset = Math.round((r() - 0.5) * 20000), up = 5 + r() * 300, down = 5 + r() * 300, t0 = r() * 1e6;
    const s = { t0, ts: t0 + up + offset, t1: t0 + up + down };
    const o = sampleOffset(s);
    assert.ok(Math.abs(o.offset - offset) <= o.err + 1e-6);
  }
});

test('sync: bad samples are ignored, none gives null, and the mapping round-trips', () => {
  assert.equal(estimateOffset([]), null);
  assert.equal(estimateOffset([{ t0: NaN, ts: 1, t1: 2 }, { t0: 5, ts: 1, t1: 2 }]), null);
  assert.equal(serverNow(1000, 250), 1250);
  assert.equal(deviceTimeFor(serverNow(1000, 250), 250), 1000);
});

// ------------------------------------------------------------ light
test('light: every named plan obeys the rules, and a broken plan does not', () => {
  for (const n of LIGHT_NAMES) assert.ok(lightPlanOk(lightPlan(n)), n);
  for (const ms of [0, 1000, 3000, 99999, NaN]) assert.ok(lightPlanOk(lightPlan('steady', ms)), `steady ${ms}`);
  assert.equal(lightPlan('nope'), null);
  assert.ok(!lightPlanOk([{ t: 0, lum: 0 }, { t: 100, lum: 0.5 }]), 'a jump faster than a ramp');
  assert.ok(!lightPlanOk([{ t: 0, lum: 0 }, { t: 1000, lum: 1 }]), 'full white');
  assert.ok(!lightPlanOk([{ t: 0, lum: 0 }, { t: LIGHT_MAX_MS + 1, lum: 0 }]), 'longer than six seconds');
  assert.ok(!lightPlanOk([{ t: 0, lum: 0 }, { t: 300, lum: 0.5 }, { t: 600, lum: 0.1 }, { t: 900, lum: 0.5 }, { t: 1200, lum: 0 }]), 'a flicker');
  assert.ok(!lightPlanOk([{ t: 0, lum: 0.2 }, { t: 1000, lum: 0 }]), 'starts from black');
  for (const n of LIGHT_NAMES) {
    const k = lightKeyframes(lightPlan(n));
    assert.equal(k.frames[0].offset, 0);
    assert.equal(k.frames.at(-1).offset, 1);
    for (const f of k.frames) assert.match(f.backgroundColor, /^rgb\((\d+),\1,\1\)$/, 'greys only');
  }
});

// ------------------------------------------------------------ protocol
test('protocol: the catalogue is whitelisted and numbers are clamped', () => {
  for (const name of P.SOUND_NAMES) assert.ok(P.validateFx({ kind: 'sound', name }).ok, name);
  for (const name of P.BUZZ_NAMES) assert.ok(P.validateFx({ kind: 'buzz', name }).ok, name);
  for (const name of P.LIGHT_NAMES) assert.ok(P.validateFx({ kind: 'light', name }).ok, name);
  for (const name of P.COMBO_NAMES) assert.ok(P.validateFx({ kind: 'combo', name }).ok, name);
  for (const bad of [null, 0, 'x', {}, { kind: 'sound' }, { kind: 'sound', name: 'rm -rf' }, { kind: 'light', name: 'strobe' }, { kind: 'combo', name: 'tick' }, { kind: 'evil', name: 'tick' }, { kind: 'sound', name: ['tick'] }]) {
    assert.equal(P.validateFx(bad).ok, false, JSON.stringify(bad));
  }
  assert.equal(P.validateFx({ kind: 'light', name: 'steady', ms: 1e9 }).fx.ms, 6000);
  assert.equal(P.validateFx({ kind: 'light', name: 'steady', ms: -5 }).fx.ms, 1500);
  assert.equal(P.validateFx({ kind: 'identify', ms: 1e9 }).fx.ms, 6000);
  assert.deepEqual(Object.keys(P.validateFx({ kind: 'sound', name: 'tick', extra: 1, __proto__: { x: 1 } }).fx), ['kind', 'name']);
});

test('protocol: combos expand to parts that are all valid effects', () => {
  for (const name of P.COMBO_NAMES) {
    const parts = P.expandFx({ kind: 'combo', name });
    assert.ok(parts.length >= 2);
    for (const part of parts) {
      assert.ok(['sound', 'buzz', 'light'].includes(part.kind));
      assert.ok(P.validateFx(part).ok, `${name}: ${JSON.stringify(part)}`);
      assert.ok(part.delayMs >= 0 && part.delayMs <= 3000);
    }
  }
  assert.equal(P.expandFx({ kind: 'sound', name: 'tick' }).length, 1);
  assert.equal(P.COMBOS.sync_probe.filter((p) => p.kind === 'sound').length, 3);
});

test('protocol: names and capabilities are cleaned', () => {
  assert.equal(P.cleanName('  <b>Phone\n A</b>  '), 'bPhone A/b');
  assert.equal(P.cleanName('x'.repeat(99)).length, P.NAME_MAX);
  assert.equal(P.cleanName('', 'Fallback'), 'Fallback');
  assert.equal(P.cleanName(null, 'F'), 'F');
  assert.deepEqual(P.cleanCaps({ vibrate: true, sound: 'on', rtt: 12.4, evil: 'x', screen: 5, haptic: 'y'.repeat(99) }), { vibrate: true, sound: 'on', rtt: 12, haptic: 'y'.repeat(24) });
  assert.deepEqual(P.cleanCaps(null), {});
  assert.equal(P.platformOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4)'), 'iOS');
  assert.equal(P.platformOf('Mozilla/5.0 (Linux; Android 14; Pixel 8)'), 'Android');
  assert.equal(P.platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'Desktop');
});

test('protocol: room codes avoid look-alikes', () => {
  const r = rngFrom(3);
  for (let i = 0; i < 200; i++) { const c = P.newRoomCode(r); assert.match(c, P.ROOM_RE); assert.doesNotMatch(c, /[01OI]/); }
});

test('protocol: a push is planned in join order, with lead and spread clamped', () => {
  const devs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const all = P.planPush(devs, 'a', 'all', 10000, 500, 400);
  assert.deepEqual(all.targets.map((t) => [t.id, t.at]), [['a', 10500], ['b', 10900], ['c', 11300]]);
  assert.deepEqual(P.planPush(devs, 'a', 'others', 0).targets.map((t) => t.id), ['b', 'c']);
  assert.deepEqual(P.planPush(devs, 'a', ['c', 'zz'], 0).targets.map((t) => t.id), ['c']);
  assert.equal(P.planPush(devs, 'a', 'all', 0, 1, 0).lead, P.LEAD_MIN_MS);
  assert.equal(P.planPush(devs, 'a', 'all', 0, 1e9, 0).lead, P.LEAD_MAX_MS);
  assert.equal(P.planPush(devs, 'a', 'all', 0, 500, 1e9).spread, P.SPREAD_MAX_MS);
  assert.equal(P.planPush(devs, 'a', 'all', 0, 'x', 'y').lead, P.LEAD_DEFAULT_MS);
  assert.deepEqual(P.planPush([], 'a', 'all', 0).targets, []);
});

test('protocol: a device drops an effect that would start more than 150 ms late', () => {
  assert.deepEqual(P.decideStart(1000, 1500), { action: 'schedule', waitMs: 500 });
  assert.deepEqual(P.decideStart(1500, 1500), { action: 'schedule', waitMs: 0 });
  assert.deepEqual(P.decideStart(1600, 1500), { action: 'schedule', waitMs: 0 });
  assert.equal(P.decideStart(1651, 1500).action, 'drop');
  assert.equal(P.decideStart(9999, 1500).reason, 'late');
});

test('protocol: parseMessage never throws and enforces the size cap', () => {
  assert.deepEqual(P.parseMessage('{"t":"ping","c":1}'), { t: 'ping', c: 1 });
  for (const bad of [undefined, null, 5, '', '{', '[]', '{"x":1}', '{"t":5}', 'null', '{"t":"a"}'.padEnd(P.MAX_MESSAGE_CHARS + 1, ' ')]) assert.equal(P.parseMessage(bad), null);
});

// ------------------------------------------------------------ room logic with fake sockets
function makeRoom(max = 16, start = 1_000_000) {
  let now = start;
  const socks = [];
  const rng = rngFrom(99);
  const host = { now: () => now, rand: rng, list: () => socks.filter((s) => !s.gone) };
  const core = new RoomCore(host, { maxDevices: max });
  let n = 0;
  const join = (name, { hello = true } = {}) => {
    const sock = { id: `d${++n}`, meta: {}, out: [], closed: null, gone: false, send(o) { this.out.push(o); }, setMeta(m) { this.stored = m; }, close(c, r) { this.closed = [c, r]; } };
    socks.push(sock);
    const ok = core.onOpen(sock);
    if (ok && hello) core.onMessage(sock, JSON.stringify({ t: 'hello', name, ua: 'Mozilla/5.0 (iPhone)', caps: { vibrate: false, sound: 'locked' } }));
    now += 10; // join order is by time
    return sock;
  };
  const send = (sock, msg) => core.onMessage(sock, JSON.stringify(msg));
  const last = (sock, t) => [...sock.out].reverse().find((m) => m.t === t);
  const all = (sock, t) => sock.out.filter((m) => m.t === t);
  return { core, join, send, last, all, socks, advance: (ms) => { now += ms; }, now: () => now };
}

test('room: hello gets a welcome with the roster, and everyone else sees the new device', () => {
  const r = makeRoom();
  const a = r.join('Phone A');
  const b = r.join('Phone B');
  const w = r.last(b, 'welcome');
  assert.equal(w.id, b.id);
  assert.deepEqual(w.roster.map((d) => d.name), ['Phone A', 'Phone B']);
  assert.equal(w.roster[0].platform, 'iOS');
  assert.deepEqual(r.last(a, 'roster').devices.map((d) => d.name), ['Phone A', 'Phone B']);
  assert.ok(b.stored.hello && b.stored.name === 'Phone B', 'meta is stored for hibernation');
});

test('room: nothing works before hello, and garbage is answered, never thrown', () => {
  const r = makeRoom();
  const x = r.join('x', { hello: false });
  r.send(x, { t: 'push', fx: { kind: 'sound', name: 'tick' } });
  assert.equal(r.last(x, 'error').code, 'say_hello_first');
  const g = rngFrom(5);
  const junk = ['', '{', '[]', 'null', '{"t":1}', '{"t":"nope"}', '{"t":"push"}', '{"t":"ack","status":"x"}', 'x'.repeat(5000), '{"t":"hello","name":{"a":1},"caps":[1]}', '{"t":"push","fx":{"kind":"sound","name":"tick"},"to":{"a":1}}'];
  for (let i = 0; i < 300; i++) {
    const raw = junk[Math.floor(g() * junk.length)];
    assert.doesNotThrow(() => r.core.onMessage(x, raw));
  }
});

test('room: a full room refuses the next device', () => {
  const r = makeRoom(3);
  r.join('A'); r.join('B'); r.join('C');
  const d = r.join('D');
  assert.equal(r.last(d, 'error').code, 'room_full');
  assert.deepEqual(d.closed, [1013, 'room_full']);
});

test('room: push to all stamps each device in join order with lead and spread', () => {
  const r = makeRoom();
  const a = r.join('A'), b = r.join('B'), c = r.join('C');
  const t0 = r.now();
  r.send(a, { t: 'push', fx: { kind: 'light', name: 'wave' }, to: 'all', lead: 600, spread: 400 });
  const fa = r.last(a, 'fx'), fb = r.last(b, 'fx'), fc = r.last(c, 'fx');
  assert.deepEqual([fa.at, fb.at, fc.at], [t0 + 600, t0 + 1000, t0 + 1400]);
  assert.equal(fa.fxId, fb.fxId);
  assert.equal(fb.fromName, 'A');
  assert.deepEqual(r.last(a, 'pushed').targets, [a.id, b.id, c.id]);
});

test('room: push to others and to chosen ids; nobody else gets it', () => {
  const r = makeRoom();
  const a = r.join('A'), b = r.join('B'), c = r.join('C');
  r.send(a, { t: 'push', fx: { kind: 'sound', name: 'bell' }, to: 'others' });
  assert.equal(r.all(a, 'fx').length, 0);
  assert.equal(r.all(b, 'fx').length, 1);
  assert.equal(r.all(c, 'fx').length, 1);
  r.send(a, { t: 'push', fx: { kind: 'buzz', name: 'thunk' }, to: [c.id] });
  assert.equal(r.all(b, 'fx').length, 1, 'B was not a target');
  assert.equal(r.all(c, 'fx').length, 2);
  r.send(a, { t: 'push', fx: { kind: 'buzz', name: 'thunk' }, to: ['nobody'] });
  assert.equal(r.last(a, 'error').code, 'no_targets');
});

test('room: an effect outside the catalogue is refused and reaches no device', () => {
  const r = makeRoom();
  const a = r.join('A'), b = r.join('B');
  for (const fx of [{ kind: 'sound', name: 'x' }, { kind: 'light', name: 'strobe' }, { kind: 'js', name: 'alert(1)' }, null]) {
    r.send(a, { t: 'push', fx, to: 'all' });
    assert.equal(r.last(a, 'error').code, 'bad_fx');
  }
  assert.equal(r.all(b, 'fx').length, 0);
});

test('room: pushes are rate limited per device and recover', () => {
  const r = makeRoom();
  const a = r.join('A'); r.join('B');
  for (let i = 0; i < 10; i++) r.send(a, { t: 'push', fx: { kind: 'sound', name: 'tick' }, to: 'others' });
  assert.equal(r.all(a, 'error').length, 0);
  r.send(a, { t: 'push', fx: { kind: 'sound', name: 'tick' }, to: 'others' });
  assert.equal(r.last(a, 'error').code, 'rate_limited');
  r.advance(1100);
  r.send(a, { t: 'push', fx: { kind: 'sound', name: 'tick' }, to: 'others' });
  assert.equal(r.all(a, 'pushed').length, 11);
});

test('room: an ack goes to everyone with the device that sent it', () => {
  const r = makeRoom();
  const a = r.join('A'), b = r.join('B');
  r.send(b, { t: 'ack', fxId: 'abc123', status: 'played', lateMs: 12.6 });
  for (const s of [a, b]) {
    const k = r.last(s, 'ack');
    assert.deepEqual([k.id, k.name, k.fxId, k.status, k.lateMs], [b.id, 'B', 'abc123', 'played', 13]);
  }
  r.send(b, { t: 'ack', fxId: 'abc123', status: 'exploded' });
  assert.equal(r.last(b, 'error').code, 'bad_message');
  r.send(b, { t: 'ack', fxId: 'x', status: 'blocked', reason: 'sound_locked'.repeat(9), lateMs: 1e12 });
  assert.equal(r.last(a, 'ack').reason.length, 24);
  assert.equal(r.last(a, 'ack').lateMs, 60000);
});

test('room: leaving updates everyone and drops the rate-limit state', () => {
  const r = makeRoom();
  const a = r.join('A'), b = r.join('B');
  r.send(b, { t: 'push', fx: { kind: 'sound', name: 'tick' }, to: 'others' });
  assert.ok([...r.core.buckets.keys()].some((k) => k.startsWith(b.id)));
  b.gone = true;
  r.core.onClose(b);
  assert.deepEqual(r.last(a, 'roster').devices.map((d) => d.name), ['A']);
  assert.ok(![...r.core.buckets.keys()].some((k) => k.startsWith(b.id)));
});

test('room: ping answers with the server clock and a flood is dropped', () => {
  const r = makeRoom();
  const a = r.join('A');
  r.send(a, { t: 'ping', c: 77 });
  assert.deepEqual(r.last(a, 'pong'), { t: 'pong', c: 77, s: r.now() });
  for (let i = 0; i < 200; i++) r.send(a, { t: 'ping', c: i });
  assert.ok(r.all(a, 'pong').length < 60);
});

test('room: caps updates and stats reach the roster, stats at most every 1.5 s', () => {
  const r = makeRoom();
  const a = r.join('A'), b = r.join('B');
  r.send(b, { t: 'caps', caps: { sound: 'on', vibrate: true }, name: 'Pixel' });
  const dev = r.last(a, 'roster').devices.find((d) => d.id === b.id);
  assert.equal(dev.name, 'Pixel');
  assert.equal(dev.caps.sound, 'on');
  const before = r.all(a, 'roster').length;
  r.send(b, { t: 'stats', rtt: 40, err: 20 });
  assert.equal(r.all(a, 'roster').length, before, 'too soon: no broadcast');
  r.advance(1600);
  r.send(b, { t: 'stats', rtt: 41, err: 20 });
  assert.equal(r.all(a, 'roster').length, before + 1);
  assert.equal(r.last(a, 'roster').devices.find((d) => d.id === b.id).caps.rtt, 41);
});

// ------------------------------------------------------------ Worker routing
test('route: health, bad rooms, upgrade, origin and the kill switch', async () => {
  const calls = [];
  const env = { LAB_ROOM: { idFromName: (n) => (calls.push(['id', n]), n), get: (id) => ({ fetch: async (req) => (calls.push(['fetch', id]), new Response('ok')) }) } };
  const req = (path, headers = {}) => new Request(`https://mtest.hauntology.app${path}`, { headers });
  assert.equal((await handle(req('/api/lab/health'), env)).status, 200);
  assert.equal((await handle(req('/api/lab/health'), { ...env, LAB_ENABLED: 'false' })).status, 200);
  assert.equal((await handle(req('/api/other'), env)).status, 404);
  assert.equal((await handle(req('/api/lab/!!/ws', { Upgrade: 'websocket' }), env)).status, 400);
  assert.equal((await handle(req('/api/lab/AB0O1/ws', { Upgrade: 'websocket' }), env)).status, 400, 'look-alike letters are not in room codes');
  assert.equal((await handle(req('/api/lab/ABCDE/ws'), env)).status, 426);
  assert.equal((await handle(req('/api/lab/ABCDE/ws', { Upgrade: 'websocket', Origin: 'https://evil.example' }), env)).status, 403);
  assert.equal((await handle(req('/api/lab/ABCDE/ws', { Upgrade: 'websocket' }), { ...env, LAB_ENABLED: 'false' })).status, 503);
  assert.equal(calls.length, 0, 'nothing reached the Durable Object so far');
  const ok = await handle(req('/api/lab/abcde/ws', { Upgrade: 'websocket', Origin: 'https://mtest.hauntology.app' }), env);
  assert.equal(ok.status, 200);
  assert.deepEqual(calls, [['id', 'ABCDE'], ['fetch', 'ABCDE']]);
});
