// The lab room's shared actions (puzzles Requirement 25): the server counts phones, and tells each phone what it feels from where it stands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomCore } from '../src/room-core.js';
import { cleanPos } from '../js/shake-core.js';

function makeRoom(start = 1_000_000, hostExtra = {}) {
  let now = start;
  const socks = [];
  const host = { now: () => now, rand: () => 0.5, list: () => socks.filter((s) => !s.gone), ...hostExtra };
  const core = new RoomCore(host);
  let n = 0;
  const join = (name, pos) => {
    const sock = { id: `d${++n}`, meta: {}, out: [], send(o) { this.out.push(o); }, setMeta() {}, close() {} };
    socks.push(sock);
    core.onOpen(sock);
    core.onMessage(sock, JSON.stringify({ t: 'hello', name, ua: 'Mozilla/5.0 (iPhone)' }));
    if (pos) core.onMessage(sock, JSON.stringify({ t: 'pos', ...pos }));
    now += 10;
    return sock;
  };
  const say = (sock, msg) => core.onMessage(sock, JSON.stringify(msg));
  const kinds = (sock, t) => sock.out.filter((o) => o.t === t);
  return { core, join, say, kinds, advance: (ms) => { now += ms; } };
}

test('one phone knocks and every phone is told at once, each with what it feels from its own place', () => {
  const r = makeRoom();
  const near = r.join('Near', { x: 5, y: 2, facing: 270 }); // 1.6 m from the door, looking north at it
  const far = r.join('Far', { x: 5, y: 6.5, facing: 270 }); // 6.1 m, looking at it
  const back = r.join('Back', { x: 5, y: 1, facing: 90 }); // close, but looking away
  r.say(near, { t: 'act', action: 'knock' });
  const f = (s) => r.kinds(s, 'shared')[0];
  assert.deepEqual([f(near).level, f(near).buzz], ['strong', true]);
  assert.equal(f(far).level, 'none');
  assert.deepEqual([f(back).level, f(back).buzz, f(back).picture], ['faint', false, false]);
  assert.deepEqual(f(near).who, ['Near']);
});

test('the chair needs two different phones inside the window; one phone twice does nothing', () => {
  const r = makeRoom();
  const a = r.join('A'), b = r.join('B');
  r.say(a, { t: 'act', action: 'chair' });
  r.advance(1000);
  r.say(a, { t: 'act', action: 'chair' });
  assert.equal(r.kinds(b, 'shared').length, 0);
  const acted = r.kinds(b, 'acted').at(-1);
  assert.deepEqual([acted.count, acted.need, acted.name], [1, 2, 'A']);
  r.advance(500);
  r.say(b, { t: 'act', action: 'chair' });
  assert.equal(r.kinds(a, 'shared').length, 1);
  assert.deepEqual(r.kinds(a, 'shared')[0].who, ['A', 'B']);
});

test('acts further apart than two seconds do not count together', () => {
  const r = makeRoom();
  const a = r.join('A'), b = r.join('B');
  r.say(a, { t: 'act', action: 'wind' });
  r.advance(2500);
  r.say(b, { t: 'act', action: 'wind' });
  assert.equal(r.kinds(a, 'shared').length, 0);
});

test('a phone can say where it is; it is clamped and shared; bad numbers are refused', () => {
  const r = makeRoom();
  const a = r.join('A'), b = r.join('B');
  r.say(a, { t: 'pos', x: 99, y: -5, facing: 450 });
  assert.deepEqual(r.kinds(b, 'pos').at(-1).pos, { x: 10, y: 0, facing: 90 });
  assert.equal(r.kinds(a, 'pos').length, 0, 'not echoed to the sender');
  r.say(a, { t: 'pos', x: 'a', y: 1, facing: 0 });
  assert.equal(r.kinds(a, 'error').at(-1).code, 'bad_message');
  assert.equal(cleanPos(null), null);
  assert.equal(cleanPos({ x: NaN, y: 1, facing: 0 }), null);
});

test('an unknown action is refused, including names that are only on Object.prototype', () => {
  const r = makeRoom();
  const a = r.join('A');
  for (const action of ['nope', 'toString', '__proto__', 5, undefined]) r.say(a, { t: 'act', action });
  assert.deepEqual(r.kinds(a, 'error').map((e) => e.code), ['bad_action', 'bad_action', 'bad_action', 'bad_action', 'bad_action']);
});

test('a phone that acts too fast is rate limited and a phone that has not said hello cannot act', () => {
  const r = makeRoom();
  const a = r.join('A');
  r.join('B');
  for (let i = 0; i < 12; i++) r.say(a, { t: 'act', action: 'chair' });
  assert.ok(r.kinds(a, 'error').some((e) => e.code === 'rate_limited'));
  const lurker = r.join('L', null);
  lurker.meta.hello = false;
  r.say(lurker, { t: 'act', action: 'knock' });
  assert.equal(r.kinds(lurker, 'error').at(-1).code, 'say_hello_first');
});

test('the roster carries each phone\'s place', () => {
  const r = makeRoom();
  const a = r.join('A', { x: 2, y: 3, facing: 10 });
  const b = r.join('B');
  assert.deepEqual(r.core.roster().find((d) => d.name === 'A').pos, { x: 2, y: 3, facing: 10 });
  assert.equal(r.core.roster().find((d) => d.name === 'B').pos, null);
  void a; void b;
});

test('the room remembers: the big door and the chair stay changed, are sent with every shared message, and are saved', () => {
  const saved = [];
  const r = makeRoom(1_000_000, { saveState: (st) => saved.push(st) });
  const a = r.join('A'), b = r.join('B'), c = r.join('C');
  for (const who of [a, b, c]) r.say(who, { t: 'act', action: 'bigDoor' });
  assert.equal(r.kinds(a, 'shared').at(-1).state.bigDoor, 'open');
  r.advance(3000);
  r.say(a, { t: 'act', action: 'chair' });
  r.say(b, { t: 'act', action: 'chair' });
  assert.deepEqual(r.kinds(c, 'shared').at(-1).state, { bigDoor: 'open', chair: 1 });
  assert.deepEqual(saved.at(-1), { bigDoor: 'open', chair: 1 });
  assert.equal(saved.length, 2, 'saved once for each action that fired, not for the counts');
  const late = r.join('Late');
  assert.deepEqual(r.kinds(late, 'welcome')[0].state, { bigDoor: 'open', chair: 1 }, 'a phone that joins late is told what the room looks like');
});

test('the knock and the wind change nothing in the room, and a room starts from what was stored', () => {
  const saved = [];
  const r = makeRoom(1_000_000, { loadState: () => ({ bigDoor: 'open', chair: 3, junk: 1 }), saveState: (st) => saved.push(st) });
  const a = r.join('A');
  r.say(a, { t: 'act', action: 'knock' });
  assert.deepEqual(r.kinds(a, 'shared')[0].state, { bigDoor: 'open', chair: 3 });
  assert.deepEqual(r.kinds(a, 'welcome')[0].state, { bigDoor: 'open', chair: 3 });
});
