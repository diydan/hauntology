// The lab connection: one WebSocket to the room, clock sync, roster, pushes and acks. No DOM.
// events: { type: 'status'|'roster'|'sync'|'pushed'|'ack'|'error'|'joined'|'left', ... } through onEvent.
import { estimateOffset, serverNow } from './sync.js';
import { decideStart } from './protocol.js';

export const labUrl = (loc, room) => `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/api/lab/${encodeURIComponent(room)}/ws`;

export class LabClient {
  /**
   * opts: { url, name, getCaps(), onEvent(e), onFx(msg, { lateMs }) -> { status, reason? },
   *         makeSocket(url), clock(), setTimer, clearTimer, ua }
   */
  constructor(opts) {
    this.o = { onEvent: () => {}, onFx: async () => ({ status: 'skipped', reason: 'no_player' }), getCaps: () => ({}),
      makeSocket: (u) => new WebSocket(u), clock: () => performance.timeOrigin + performance.now(),
      setTimer: (f, ms) => setTimeout(f, ms), clearTimer: (t) => clearTimeout(t), ua: typeof navigator !== 'undefined' ? navigator.userAgent : '', ...opts };
    this.status = 'offline'; this.id = null; this.roster = []; this.samples = []; this.offset = 0; this.err = null; this.rtt = null;
    this.ws = null; this.retry = 0; this.closed = false; this.timers = new Set(); this.pings = 0;
  }
  emit(e) { this.o.onEvent(e); }
  now() { return serverNow(this.o.clock(), this.offset); }
  setStatus(s) { if (s !== this.status) { this.status = s; this.emit({ type: 'status', status: s }); } }
  later(fn, ms) { const t = this.o.setTimer(() => { this.timers.delete(t); fn(); }, ms); this.timers.add(t); return t; }

  connect() {
    this.closed = false;
    this.setStatus('connecting');
    const ws = this.o.makeSocket(this.o.url);
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.retry = 0;
      this.samples = []; this.pings = 0;
      this.send({ t: 'hello', name: this.o.name, ua: this.o.ua, caps: this.o.getCaps() });
      this.pingBurst();
    });
    ws.addEventListener('message', (ev) => this.onMessage(ev.data));
    const lost = () => {
      if (this.ws !== ws) return;
      this.ws = null; this.id = null;
      this.setStatus('offline');
      if (!this.closed) { const wait = Math.min(8000, 1000 * 2 ** this.retry++); this.later(() => this.connect(), wait); }
    };
    ws.addEventListener('close', lost);
    ws.addEventListener('error', () => {});
  }
  close() { this.closed = true; for (const t of this.timers) this.o.clearTimer(t); this.timers.clear(); try { this.ws?.close(1000, 'bye'); } catch { /* ignore */ } this.ws = null; this.setStatus('offline'); }
  send(obj) { try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); } catch { /* socket closing */ } }

  // clock sync: eight quick pings to settle, then one every 3 seconds, each followed by a stats report
  pingBurst() {
    const ws = this.ws;
    const tick = () => {
      if (this.ws !== ws || this.closed) return;
      this.send({ t: 'ping', c: this.o.clock() });
      this.pings++;
      this.later(tick, this.pings < 8 ? 150 : 3000);
    };
    tick();
  }
  onMessage(raw) {
    let m; try { m = JSON.parse(raw); } catch { return; }
    switch (m.t) {
      case 'welcome': this.id = m.id; this.roster = m.roster; this.setStatus('online'); this.emit({ type: 'roster', devices: this.roster, welcome: true }); break;
      case 'roster': {
        const before = new Set(this.roster.map((d) => d.id));
        const after = new Set(m.devices.map((d) => d.id));
        for (const d of m.devices) if (!before.has(d.id) && d.id !== this.id) this.emit({ type: 'joined', device: d });
        for (const d of this.roster) if (!after.has(d.id)) this.emit({ type: 'left', device: d });
        this.roster = m.devices; this.emit({ type: 'roster', devices: this.roster });
        break;
      }
      case 'pong': {
        this.samples.push({ t0: m.c, ts: m.s, t1: this.o.clock() });
        if (this.samples.length > 12) this.samples.shift();
        const est = estimateOffset(this.samples);
        if (est) {
          this.offset = est.offset; this.err = est.err; this.rtt = est.rtt;
          this.emit({ type: 'sync', offset: this.offset, err: this.err, rtt: this.rtt });
          if (this.pings % 2 === 0 || this.pings === 8) this.send({ t: 'stats', rtt: est.rtt, err: est.err });
        }
        break;
      }
      case 'fx': this.handleFx(m); break;
      case 'pushed': case 'ack': case 'error': this.emit({ ...m, type: m.t }); break;
      default: break;
    }
  }
  handleFx(m) {
    const d = decideStart(this.now(), m.at);
    if (d.action === 'drop') { this.send({ t: 'ack', fxId: m.fxId, status: 'dropped', reason: 'late', lateMs: d.lateMs }); this.emit({ type: 'dropped', fx: m, lateMs: d.lateMs }); return; }
    this.later(async () => {
      const lateMs = Math.round(this.now() - m.at);
      let r;
      try { r = await this.o.onFx(m, { lateMs }); } catch { r = { status: 'skipped', reason: 'error' }; }
      this.send({ t: 'ack', fxId: m.fxId, status: r.status, reason: r.reason || '', lateMs });
      this.emit({ type: 'played', fx: m, lateMs, result: r });
    }, d.waitMs);
  }

  push(fx, { to = 'all', lead, spread } = {}) { this.send({ t: 'push', fx, to, lead, spread }); }
  updateCaps(extra = {}) { this.send({ t: 'caps', caps: { ...this.o.getCaps(), ...extra }, name: this.o.name }); }
  rename(name) { this.o.name = name; this.updateCaps(); }
}
