// Request routing for the lab Worker, kept free of Cloudflare imports so it can be tested in Node.
import { ROOM_RE } from '../js/protocol.js';
import { parseRange } from './range.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// The footage clips (media/*.mp4, .webm, .jpg) and the two Reel sounds (.m4a). Cloudflare's static assets answer a Range request with the whole file, and Safari
// will not play or seek a video that way, so the Worker serves these itself: the file from the assets binding, cut to the range.
// Fine for clips of a few MB; a long scene (Requirement 18.6 allows 40 MB) belongs in R2, which answers ranges natively.
const MEDIA_RE = /^\/media\/[\w.-]+\.(mp4|webm|jpg|m4a)$/;

async function media(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
  const asset = await env.ASSETS.fetch(new Request(request.url, { method: 'GET' })); // without the Range header
  if (!asset.ok) return asset;
  const body = await asset.arrayBuffer();
  const headers = new Headers(asset.headers);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'public, max-age=300');
  const send = (status, bytes) => new Response(request.method === 'HEAD' ? null : bytes, { status, headers });
  const wanted = request.headers.get('range');
  if (!wanted) { headers.set('content-length', String(body.byteLength)); return send(200, body); }
  const r = parseRange(wanted, body.byteLength);
  if (!r) { headers.set('content-range', `bytes */${body.byteLength}`); return send(416, null); }
  headers.set('content-range', `bytes ${r[0]}-${r[1]}/${body.byteLength}`);
  headers.set('content-length', String(r[1] - r[0] + 1));
  return send(206, body.slice(r[0], r[1] + 1));
}

export async function handle(request, env) {
  const url = new URL(request.url);
  if (MEDIA_RE.test(url.pathname)) return media(request, env);
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
