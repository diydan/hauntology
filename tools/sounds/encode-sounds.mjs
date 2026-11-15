// Levels the seven clips to about -16 LUFS (two passes, so a short clip lands on the target) and encodes them as mono AAC `.m4a`.
// Usage: node tools/sounds/encode-sounds.mjs <folder with the .wav files> <destination folder>
// Needs ffmpeg. The files it writes are the ones `tools/check-sounds.mjs` checks.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const NAMES = ['creak', 'whisper', 'bell', 'laugh', 'wind', 'rumble', 'becoming'];
const TARGET = { I: -16, TP: -1.5, LRA: 11 };
// A gentle limiter first: a peaky clip (a laugh, a creak) cannot reach -16 LUFS without clipping unless its peaks are brought down.
const LIMIT = 'alimiter=limit=0.5:attack=3:release=50:level=0';

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${r.stderr}`);
  return r.stderr;
}

/** The loudnorm measurement of a file: the numbers the second pass needs. */
function measure(file) {
  const log = ffmpeg(['-i', file, '-af', `${LIMIT},loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json`, '-f', 'null', '-']);
  const json = log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1);
  return JSON.parse(json);
}

export function encode(wav, out) {
  const m = measure(wav);
  const filter = `${LIMIT},loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  ffmpeg(['-i', wav, '-ac', '1', '-af', filter, '-ar', '44100', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', out]);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const [from, to] = process.argv.slice(2);
  if (!from || !to) { console.error('usage: node tools/sounds/encode-sounds.mjs <wav folder> <destination folder>'); process.exit(2); }
  mkdirSync(resolve(to), { recursive: true });
  for (const n of NAMES) { encode(resolve(from, `${n}.wav`), resolve(to, `${n}.m4a`)); console.log(`${n}.m4a`); }
}
