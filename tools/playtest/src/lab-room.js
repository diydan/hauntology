// The Durable Object: one per room code. Uses the WebSocket Hibernation API, so an idle room costs nothing.
// Device state (name, capabilities, join time) lives in each socket's attachment and survives hibernation.
import { DurableObject } from 'cloudflare:workers';
import { RoomCore } from './room-core.js';
import { cleanState } from '../js/shake-core.js';

function wrap(ws) {
  const sock = {
    meta: ws.deserializeAttachment() || {},
    get id() { return this.meta.id; },
    send(obj) { try { ws.send(JSON.stringify(obj)); } catch { /* socket already gone */ } },
    setMeta(m) { try { ws.serializeAttachment(m); } catch { /* attachment too big: keep going */ } },
    close(code, reason) { try { ws.close(code, reason); } catch { /* already closed */ } },
  };
  return sock;
}

export class LabRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = new RoomCore({
      now: () => Date.now(),
      rand: () => Math.random(),
      list: () => this.ctx.getWebSockets().map(wrap),
      saveState: (st) => { this.ctx.waitUntil(this.ctx.storage.put('state', st)); },
    });
    // the room's shared state (a door open, a chair moved) outlives hibernation: read it before any message is handled
    ctx.blockConcurrencyWhile(async () => { this.core.state = cleanState(await ctx.storage.get('state')); });
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const id = this.core.rid(8);
    server.serializeAttachment({ id, joinedAt: Date.now(), hello: false });
    this.core.onOpen(wrap(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    this.core.onMessage(wrap(ws), typeof message === 'string' ? message : '');
  }
  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'closing'); } catch { /* already closed */ }
    this.core.onClose(wrap(ws));
  }
  async webSocketError(ws) {
    this.core.onClose(wrap(ws));
  }
}
