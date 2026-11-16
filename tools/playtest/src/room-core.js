// The device-lab room logic with no Cloudflare types, so it can be tested in Node.
// The Durable Object (lab-room.js) is a thin adapter: it lists its sockets and feeds messages in.
// host:  { now(): ms, rand(): [0,1), list(): Sock[] }
// Sock:  { id, meta, send(obj), setMeta(meta), close(code, reason) }   meta survives hibernation (a socket attachment)
import { MAX_DEVICES, parseMessage, validateFx, planPush, cleanName, cleanCaps, platformOf } from '../js/protocol.js';

const ACK_STATUS = ['played', 'blocked', 'skipped', 'dropped'];
const PUSH_BUCKET = { cap: 10, perSec: 1 }; // ten pushes at once, then one a second
const PING_BUCKET = { cap: 40, perSec: 8 };
const ROSTER_MIN_GAP_MS = 1500;

export class RoomCore {
  constructor(host, { maxDevices = MAX_DEVICES } = {}) {
    this.host = host;
    this.max = maxDevices;
    this.buckets = new Map();
    this.lastRoster = 0;
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
    return this.devices(exceptId).map((s) => ({ id: s.id, name: s.meta.name, platform: s.meta.platform, caps: s.meta.caps || {}, joinedAt: s.meta.joinedAt }));
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
    sock.send({ t: 'welcome', id: sock.id, serverTime: this.now(), roster: this.roster() });
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
}
