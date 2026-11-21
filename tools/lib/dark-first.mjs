// Spike 1.3, arm C ("dark first"): the logic of tools/worldlabs-spike/dark-first.mjs, with no I/O of its own beyond what is passed in, so a test can run it over fakes.
// A photo is stripped of EXIF/GPS/XMP with the app's own `prepareUpload` BEFORE it goes anywhere; the stripped copy is what is sent, and it is checked for the
// markers of the metadata it should no longer have. The only place a photo can go is a loopback Worker (api/dev/dark-edit-worker.ts), whose own cap is the hard stop.
import { loadSharedFiles } from './load-shared.mjs';

export const MAX_IMAGES = 3;
// The personal ones. The ICC colour profile is kept on purpose by the app's stripper (`stripJpegMetadata`): it is not personal data and the colours need it.
const MARKERS = ['Exif\0\0', 'http://ns.adobe.com/xap/1.0/', 'Photoshop 3.0'];

/** Only this machine: a loopback address, never a name that could lead off it. */
export function isLoopbackUrl(text) {
  try {
    const u = new URL(text);
    return (u.protocol === 'http:' || u.protocol === 'https:') && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

const has = (bytes, text) => Buffer.from(bytes).includes(Buffer.from(text, 'latin1'));

/** The photo with its metadata removed, or why not. Never returns the original bytes. */
export async function stripPhoto(bytes, declaredType, prepare) {
  const prepareUpload = prepare ?? (await loadSharedFiles(['world/upload.ts']))[0].prepareUpload;
  const out = prepareUpload(new Uint8Array(bytes), declaredType);
  if (!out.ok) return { ok: false, code: out.code };
  const left = MARKERS.filter((m) => has(out.bytes, m));
  if (left.length > 0) return { ok: false, code: 'metadata_left', left };
  return { ok: true, type: out.type, width: out.width, height: out.height, bytes: out.bytes, removed: bytes.length - out.bytes.length };
}

export const typeOfName = (name) => (/\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : 'image/jpeg');
export const extOf = (type) => (type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg');

/**
 * The plan, and (with `spend`) the call. `io` = { read(path), write(path, bytes), fetch, count(), bump() }. Returns a result; it throws only on a bug.
 * Refuses, in this order: no photo, a photo that cannot be stripped, a worker that is not loopback, no token, the cap, a worker that cannot call the model.
 */
export async function darkFirst({ photo, name, outDir, worker, token, spend, max = MAX_IMAGES }, io) {
  const strip = await stripPhoto(await io.read(photo), typeOfName(name));
  if (!strip.ok) return { ok: false, stage: 'strip', code: strip.code };
  const base = name.replace(/\.[^.]+$/, '');
  const strippedPath = `${outDir}/stripped/${base}.${extOf(strip.type)}`;
  await io.write(strippedPath, strip.bytes);
  const plan = { photo: name, stripped: strippedPath, removedBytes: strip.removed, width: strip.width, height: strip.height, route: 'Workers AI google/nano-banana-2 (local Worker, loopback only)', estimateUsd: 0.03, imagesSoFar: await io.count(), max };
  if (!spend) return { ok: true, sent: false, plan };
  if (!isLoopbackUrl(worker)) return { ok: false, stage: 'worker', code: 'not_loopback', plan };
  if (typeof token !== 'string' || token.length < 16) return { ok: false, stage: 'token', code: 'no_token', plan };
  if (plan.imagesSoFar >= max || max > MAX_IMAGES) return { ok: false, stage: 'cap', code: 'cap_reached', plan };
  const headers = { 'x-run-token': token };
  const status = await io.fetch(`${worker}/dev/status`, { headers });
  const info = status.ok ? await status.json() : null;
  if (info === null || info.aiBinding !== true || !(info.remaining >= 1)) return { ok: false, stage: 'worker', code: info === null ? 'worker_unreachable' : info.aiBinding !== true ? 'no_ai_binding' : 'worker_cap', plan };
  await io.bump(); // counted BEFORE the call: a crash mid-call cannot give the call back for free
  const res = await io.fetch(`${worker}/dev/dark-edit`, { method: 'POST', headers: { ...headers, 'content-type': strip.type }, body: strip.bytes });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, stage: 'edit', code: body.error ?? `http_${res.status}`, keys: body.keys, charged: body.charged === true, plan };
  }
  const type = res.headers.get('content-type') ?? 'image/png';
  const darkPath = `${outDir}/dark/${base}-dark.${extOf(type)}`;
  const bytes = new Uint8Array(await res.arrayBuffer());
  await io.write(darkPath, bytes);
  return { ok: true, sent: true, plan, dark: darkPath, bytes: bytes.length };
}
