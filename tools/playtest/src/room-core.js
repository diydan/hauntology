// The device-lab room logic with no Cloudflare types, so it can be tested in Node.
// The Durable Object (lab-room.js) is a thin adapter: it lists its sockets and feeds messages in.
// host:  { now(): ms, rand(): [0,1), list(): Sock[], loadState?(): object, saveState?(state): void }   (the room's shared state survives hibernation)
// Sock:  { id, meta, send(obj), setMeta(meta), close(code, reason) }   meta survives hibernation (a socket attachment)
import { ACTIONS, INITIAL_STATE, SPOTS, applyAction, cleanPos, cleanState, feel, makeTogether } from '../js/shake-core.js';
import { MAX_DEVICES, parseMessage, validateFx, planPush, cleanName, cleanCaps, platformOf } from '../js/protocol.js';

const ACK_STATUS = ['played', 'blocked', 'skipped', 'dropped'];
const PUSH_BUCKET = { cap: 10, perSec: 1 }; // ten pushes at once, then one a second
const PING_BUCKET = { cap: 40, perSec: 8 };
const ROSTER_MIN_GAP_MS = 1500;
const ACT_BUCKET = { cap: 6, perSec: 1 };
const POS_BUCKET = { cap: 10, perSec: 4 };
const DEFAULT_POS = { x: 5, y: 7, facing: 270 }; // a phone that has not said where it is stands south of the chair, facing north

export class RoomCore {
  constructor(host, { maxDevices = MAX_DEVICES } = {}) {
    this.host = host;
    this.max = maxDevices;
    this.buckets = new Map();
    this.lastRoster = 0;
    this.state = cleanState(host.loadState?.() ?? INITIAL_STATE);
    this.together = Object.fromEntries(Object.keys(ACTIONS).map((a) => [a, makeTogether(a)]));
  }

  // ---------------------------------------------------------- helpers
  now() { return this.host.now(); }
  rid(n = 6) { return Math.floor(this.host.rand() * 36 ** n).toString(36).padStart(n, '0'); }
  socks() { return this.host.list(); }
  devices(exceptId = null) {
    return this.socks().filter((s) => s.meta?.hello && s.id !== exceptId)
      .sort((a, b) => a.meta.joinedAt - b.meta.joinedAt || (a.id < b.id ? -1 : 1));
  }
  roster(exceptId = null) {
    return this.devices(exceptId).map((s) => ({ id: s.id, name: s.meta.name, platform: s.meta.platform, caps: s.meta.caps || {}, joinedAt: s.meta.joinedAt, pos: s.meta.pos || null }));
  }
  broadcast(msg, exceptId = null) { for (const s of this.socks()) if (s.id !== exceptId) s.send(msg); }
  broadcastRoster(exceptId = null) {
    this.lastRoster = this.now();
    const msg = { t: 'roster', devices: this.roster(exceptId) };
    for (const s of this.socks()) if (s.meta?.hello && s.id !== exceptId) s.send(msg);
  }
  update(sock, patch) { sock.meta = { ...sock.meta, ...patch }; sock.setMeta(sock.meta); }
  take(id, key, { cap, perSec }) {
    const k = `${id}:${key}`, t = this.now();
    const b = this.buckets.get(k) || { tokens: cap, at: t };
    b.tokens = Math.min(cap, b.tokens + ((t - b.at) / 1000) * perSec);
    b.at = t;
    if (b.tokens < 1) { this.buckets.set(k, b); return false; }
    b.tokens -= 1;
    this.buckets.set(k, b);
    return true;
  }

  // ---------------------------------------------------------- lifecycle
  /** A new socket. Returns false (and closes it) when the room is full. */
  onOpen(sock) {
    if (this.devices(sock.id).length >= this.max) {
      sock.send({ t: 'error', code: 'room_full' });
      sock.close(1013, 'room_full');
      return false;
    }
    this.update(sock, { id: sock.id, joinedAt: this.now(), hello: false });
    return true;
  }
  onClose(sock) {
    for (const k of [...this.buckets.keys()]) if (k.startsWith(`${sock.id}:`)) this.buckets.delete(k);
    if (sock.meta?.hello) this.broadcastRoster(sock.id);
  }

  // ---------------------------------------------------------- messages
  onMessage(sock, raw) {
    const m = parseMessage(raw);
    if (!m) return sock.send({ t: 'error', code: 'bad_message' });
    if (m.t !== 'hello' && !sock.meta?.hello) return sock.send({ t: 'error', code: 'say_hello_first' });
    switch (m.t) {
      case 'hello': return this.hello(sock, m);
      case 'caps': return this.capsUpdate(sock, m);
      case 'stats': return this.stats(sock, m);
      case 'ping': return this.ping(sock, m);
      case 'push': return this.push(sock, m);
      case 'ack': return this.ack(sock, m);
      case 'pos': return this.pos(sock, m);
      case 'act': return this.act(sock, m);
      default: return sock.send({ t: 'error', code: 'bad_message' });
    }
  }
  hello(sock, m) {
    this.update(sock, {
      hello: true,
      name: cleanName(m.name, `Device-${sock.id.slice(0, 4)}`),
      platform: platformOf(typeof m.ua === 'string' ? m.ua.slice(0, 300) : ''),
      caps: cleanCaps(m.caps),
    });
    sock.send({ t: 'welcome', id: sock.id, serverTime: this.now(), roster: this.roster(), state: this.state });
    this.broadcastRoster();
  }
  capsUpdate(sock, m) {
    const patch = { caps: { ...sock.meta.caps, ...cleanCaps(m.caps) } };
    if (typeof m.name === 'string') patch.name = cleanName(m.name, sock.meta.name);
    this.update(sock, patch);
    this.broadcastRoster();
  }
  stats(sock, m) {
    this.update(sock, { caps: { ...sock.meta.caps, ...cleanCaps({ rtt: m.rtt, err: m.err }) } });
    if (this.now() - this.lastRoster >= ROSTER_MIN_GAP_MS) this.broadcastRoster();
  }
  ping(sock, m) {
    if (!this.take(sock.id, 'ping', PING_BUCKET)) return;
    sock.send({ t: 'pong', c: Number.isFinite(m.c) ? m.c : 0, s: this.now() });
  }
  push(sock, m) {
    if (!this.take(sock.id, 'push', PUSH_BUCKET)) return sock.send({ t: 'error', code: 'rate_limited' });
    const v = validateFx(m.fx);
    if (!v.ok) return sock.send({ t: 'error', code: v.code });
    const plan = planPush(this.devices().map((s) => ({ id: s.id })), sock.id, m.to ?? 'all', this.now(), m.lead, m.spread);
    if (plan.targets.length === 0) return sock.send({ t: 'error', code: 'no_targets' });
    const fxId = this.rid(6);
    const byId = new Map(this.socks().map((s) => [s.id, s]));
    for (const t of plan.targets) {
      byId.get(t.id)?.send({ t: 'fx', fxId, fx: v.fx, at: t.at, index: t.index, from: sock.id, fromName: sock.meta.name, lead: plan.lead, spread: plan.spread });
    }
    sock.send({ t: 'pushed', fxId, fx: v.fx, at: plan.at0, lead: plan.lead, spread: plan.spread, targets: plan.targets.map((t) => t.id) });
  }
  ack(sock, m) {
    if (!ACK_STATUS.includes(m.status)) return sock.send({ t: 'error', code: 'bad_message' });
    const lateMs = Number.isFinite(m.lateMs) ? Math.round(Math.max(-60000, Math.min(60000, m.lateMs))) : 0;
    this.broadcast({
      t: 'ack', id: sock.id, name: sock.meta.name, fxId: String(m.fxId ?? '').slice(0, 12), status: m.status,
      reason: typeof m.reason === 'string' ? m.reason.slice(0, 24) : '', lateMs,
    });
  }

  // ---------------------------------------------------------- shared actions (puzzles Requirement 25)
  /** A phone says where it is and which way it faces. Others are told, so their floor plans move it. */
  pos(sock, m) {
    if (!this.take(sock.id, 'pos', POS_BUCKET)) return;
    const pos = cleanPos(m);
    if (!pos) return sock.send({ t: 'error', code: 'bad_message' });
    this.update(sock, { pos });
    this.broadcast({ t: 'pos', id: sock.id, pos }, sock.id);
  }
  /**
   * A phone acts (a shake or a tap). The server counts different phones inside the window. When enough have acted, every phone is told
   * what it feels from where it stands; until then everyone is told how many have acted, never who is waiting for whom beyond names.
   */
  act(sock, m) {
    if (!Object.hasOwn(ACTIONS, m.action)) return sock.send({ t: 'error', code: 'bad_action' });
    if (!this.take(sock.id, 'act', ACT_BUCKET)) return sock.send({ t: 'error', code: 'rate_limited' });
    const r = this.together[m.action].add(sock.id, this.now());
    const names = new Map(this.devices().map((s) => [s.id, s.meta.name]));
    const who = r.who.map((id) => names.get(id)).filter(Boolean);
    if (!r.fired) return this.broadcast({ t: 'acted', action: m.action, id: sock.id, name: sock.meta.name, count: r.count, need: r.need });
    const src = SPOTS[m.action];
    this.state = applyAction(this.state, m.action);
    this.host.saveState?.(this.state);
    for (const d of this.devices()) d.send({ t: 'shared', action: m.action, who, src: { x: src.x, y: src.y, name: src.name }, state: this.state, ...feel(src, d.meta.pos || DEFAULT_POS) });
  }
}
