// The logic of tools/songs-render.mjs (game-songs task 5.2): plan the Stock Songs that are still missing, and make one song with the Song
// Service (Mureka) over an injected fetch, so tests run over a fake and spend nothing. The flow is the ASYNC one the spike recorded
// (docs/spikes/songs-1.md): POST /generate gives a task id, GET /query/{id} is polled every 5 s (ready in 44 to 51 s), the finished task lists
// two versions and the shorter is kept. UNVERIFIED against the live API: the JSON field names (`prompt`, `id`, `status`, `choices[].url`,
// `choices[].duration`), as in api/src/guarded/songs/mureka.ts; and the route for an instrumental (`/instrumental/generate` and
// `/instrumental/query/{id}`, taking only `prompt` and `model`), which the spike did not try (it made sung songs only). Try one first:
// `--render --max-songs 1 --only lobby`.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const BASE = 'https://api.mureka.ai/v1';
export const POLL_MS = 5000;
export const WAIT_MS = 120_000;
export const REQUEST_MS = 15_000;
export const MIN_MP3_BYTES = 1000;
export const MAX_MP3_BYTES = 8_000_000;
export const MAX_SONGS_PER_RUN = 40;
const FAILED = new Set(['failed', 'timeouted', 'cancelled', 'canceled']);

/** The songs still to make: those with no `<id>.mp3` in `outDir`, in catalogue order, at most `limit`. `only` picks ids. */
export function planSongs(songs, outDir, { limit = MAX_SONGS_PER_RUN, only = null, exists = existsSync } = {}) {
  const wanted = only === null ? songs : songs.filter((s) => only.includes(s.id));
  const missing = wanted.filter((s) => !exists(join(outDir, `${s.id}.mp3`)));
  return { total: wanted.length, have: wanted.length - missing.length, todo: missing.slice(0, limit), left: Math.max(0, missing.length - limit) };
}

/** The lyric lines as captions (section tags like [Verse] are not shown), or none for an instrumental. */
export const captionsOf = (lyrics) => (lyrics === null ? [] : lyrics.split('\n').map((l) => l.trim()).filter((l) => l !== '' && !/^\[[^\]]+\]$/.test(l)));

/** The record kept beside each song: what was asked, with no key and no secret. */
export const recordOf = (song, extra) => ({ id: song.id, kind: song.kind, title: song.title, style: song.style, lyrics: song.lyrics, captions: captionsOf(song.lyrics), ...extra });

const withTimeout = async (fetchFn, url, init, ms) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetchFn(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); }
};

const pickShorter = (data) => {
  const list = (Array.isArray(data?.choices) ? data.choices : []).filter((c) => typeof c?.url === 'string' && c.url.startsWith('https://'));
  if (list.length === 0) return null;
  const dur = (c) => (typeof c.duration === 'number' && c.duration > 0 ? c.duration : Infinity);
  return list.reduce((best, c) => (dur(c) < dur(best) ? c : best));
};

/**
 * Makes one song. One submit, no retry (a paid call), then polls. Returns `{ ok: true, audio, durationMs, taskId }` or `{ ok: false, reason, taskId? }`;
 * never throws. `reason` is one of `invalid`, `rate_limited`, `submit_failed`, `failed`, `no_audio`, `bad_audio`, `slow`.
 */
export async function makeSong({ fetch: fetchFn, apiKey, song, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now }) {
  if (!apiKey || apiKey.trim() === '') return { ok: false, reason: 'invalid' };
  const began = now();
  const route = song.lyrics === null ? 'instrumental' : 'song';
  const auth = { Authorization: `Bearer ${apiKey}` };
  let taskId = null;
  try {
    const res = await withTimeout(fetchFn, `${BASE}/${route}/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...auth },
      // only the words and the style (and the fixed model): never a photo, a name of a Player or a token
      body: JSON.stringify(song.lyrics === null ? { prompt: song.style, model: 'auto' } : { lyrics: song.lyrics, prompt: song.style, model: 'auto' }),
    }, REQUEST_MS);
    if (res.status === 429) return { ok: false, reason: 'rate_limited' };
    if (!res.ok) return { ok: false, reason: 'submit_failed' };
    const data = await res.json().catch(() => null);
    taskId = typeof data?.id === 'string' || typeof data?.id === 'number' ? String(data.id) : null;
    if (taskId === null) return { ok: false, reason: 'submit_failed' };
  } catch { return { ok: false, reason: 'submit_failed' }; }

  let choice = null;
  let errors = 0;
  while (choice === null) {
    if (now() - began >= WAIT_MS) return { ok: false, reason: 'slow', taskId };
    await sleep(POLL_MS);
    try {
      const res = await withTimeout(fetchFn, `${BASE}/${route}/query/${encodeURIComponent(taskId)}`, { method: 'GET', headers: auth }, REQUEST_MS);
      if (!res.ok) { if (++errors >= 3) return { ok: false, reason: 'failed', taskId }; continue; }
      errors = 0;
      const data = await res.json().catch(() => null);
      const status = typeof data?.status === 'string' ? data.status.toLowerCase() : '';
      if (FAILED.has(status)) return { ok: false, reason: 'failed', taskId };
      if (status === 'succeeded') {
        choice = pickShorter(data);
        if (choice === null) return { ok: false, reason: 'no_audio', taskId };
      }
    } catch { if (++errors >= 3) return { ok: false, reason: 'failed', taskId }; }
  }
  try {
    const dl = await withTimeout(fetchFn, choice.url, { method: 'GET' }, REQUEST_MS);
    if (!dl.ok) return { ok: false, reason: 'no_audio', taskId };
    const audio = new Uint8Array(await dl.arrayBuffer());
    if (audio.byteLength < MIN_MP3_BYTES || audio.byteLength > MAX_MP3_BYTES) return { ok: false, reason: 'bad_audio', taskId };
    return { ok: true, audio, taskId, durationMs: now() - began };
  } catch { return { ok: false, reason: 'no_audio', taskId }; }
}
