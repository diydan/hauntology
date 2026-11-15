// Request routing for the lab Worker, kept free of Cloudflare imports so it can be tested in Node.
import { ROOM_RE } from '../js/protocol.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function handle(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/lab/health') return json({ ok: true, lab: env.LAB_ENABLED !== 'false' });
  const m = url.pathname.match(/^\/api\/lab\/([^/]+)\/ws$/);
  if (!m) return json({ ok: false, code: 'not_found' }, 404);
  if (env.LAB_ENABLED === 'false') return json({ ok: false, code: 'lab_disabled' }, 503);
  const room = decodeURIComponent(m[1]).toUpperCase();
  if (!ROOM_RE.test(room)) return json({ ok: false, code: 'bad_room' }, 400);
  if (request.headers.get('Upgrade') !== 'websocket') return json({ ok: false, code: 'expected_websocket' }, 426);
  const origin = request.headers.get('Origin');
  if (origin) { let host = ''; try { host = new URL(origin).host; } catch { /* bad origin */ } if (host !== url.host) return json({ ok: false, code: 'bad_origin' }, 403); }
  const stub = env.LAB_ROOM.get(env.LAB_ROOM.idFromName(room));
  return stub.fetch(request);
}
