// Levels sound clips to about -16 LUFS (two passes, so a short clip lands on the target) and encodes them as mono AAC `.m4a`.
// Usage: node tools/sounds/encode-sounds.mjs <folder with the seven .wav files> <destination folder>
//        node tools/sounds/encode-sounds.mjs --one <in.wav> <out.m4a>          one file (a candidate, a sound for the footage scenes)
// Needs ffmpeg. The files it writes are the ones `tools/check-sounds.mjs` checks (about -16 LUFS, not clipped).
//
// A peaky clip (a bell strike, a knock, a click) cannot reach -16 LUFS by gain alone: the peak hits the ceiling first and the body stays
// quiet (a single knock is about -26 LUFS at the same peak). So the chain tries the lightest treatment that lands within a LU of the
// target, and only then steps up: more gain into a soft clipper, which flattens the peak and thickens the sound a little more each step.
// (A compressor was tried first and made these clips quieter, not louder.) A clip that is already steady, like the synthesised ones,
// takes the lightest chain and is left exactly as it was.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const NAMES = ['creak', 'whisper', 'bell', 'laugh', 'wind', 'rumble', 'becoming'];
export const TARGET = { I: -16, TP: -1.5, LRA: 11 };
/** The loudness a treatment must reach for the lighter ones to be enough (the check allows 1.5 LU either way). */
export const MIN_LUFS = -17;
/** No decoded sample above this (the sound check refuses -0.1 dBFS and over). */
export const MAX_PEAK_DB = -0.5;

/** From the lightest to the heaviest. Index 0 is a limiter alone; each later one drives the clip harder into a soft clipper. */
export const DRIVES_DB = [4, 8, 12, 16, 20];
export const PRESETS = [
  'alimiter=limit=0.5:attack=3:release=50:level=0',
  ...DRIVES_DB.map((d) => `volume=${d}dB,asoftclip=type=tanh,alimiter=limit=0.85:attack=1:release=30:level=0`),
];
const MIN_CEILING = 0.0625; // the lowest `limit` ffmpeg's alimiter accepts
const SAFETY = (ceiling) => `lowpass=f=11000,alimiter=limit=${ceiling.toFixed(3)}:attack=1:release=20:level=0`;
const PAD = 'apad=whole_dur=0.8'; // loudness is measured in 400 ms blocks, so a clip shorter than that needs silence after it (silence is not counted)

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${r.stderr}`);
  return r.stderr;
}

const norm = (chain) => `${chain},loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}`;

/** The loudnorm measurement of a file after a chain: the numbers the second pass needs. */
export function measure(file, chain) {
  const log = ffmpeg(['-i', file, '-af', `${norm(chain)}:print_format=json`, '-f', 'null', '-']);
  const m = JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
  return { ...m, I: parseFloat(m.input_i), TP: parseFloat(m.input_tp) };
}

/** Where the second pass will land: gain only, and never past the true peak ceiling. */
export function predicted(m) {
  return m.I + Math.min(TARGET.I - m.I, TARGET.TP - m.TP);
}

/**
 * Levels and encodes one file.
 * @param {string} wav
 * @param {string} out
 * @param {{ preset?: number, maxPeakDb?: number }} [opts]  preset: force a treatment (0 is the lightest), by default the lightest that is enough; maxPeakDb: the decoded peak above which the safety re-encode runs
 * @returns {{ preset: number, lufs: number, peak: number, padded: boolean, safe: boolean, ok: boolean }}  the treatment used, the loudness and decoded peak of the file written, whether it had to be re-encoded under a lower ceiling, and whether it meets both rules (within 1.5 LU of -16 and not clipped); a clip that cannot is written as well as it can be, and `ok` says so
 */
export function encode(wav, out, { preset, maxPeakDb = MAX_PEAK_DB } = {}) {
  if (preset !== undefined && !PRESETS[preset]) throw new RangeError(`no treatment ${preset}: 0 to ${PRESETS.length - 1}`);
  const order = preset === undefined ? PRESETS.map((_, i) => i) : [preset];
  let chosen = null;
  for (const i of order) {
    let chain = PRESETS[i];
    let padded = false;
    let m = measure(wav, chain);
    if (!Number.isFinite(m.I)) { chain = `${PAD},${chain}`; padded = true; m = measure(wav, chain); } // too short to measure
    const tried = { i, chain, padded, m, lufs: predicted(m) };
    if (!chosen || tried.lufs > chosen.lufs) chosen = tried; // when none is enough, the loudest one it could get
    if (tried.lufs >= MIN_LUFS) break;
  }
  const { chain, m } = chosen;
  const filter = `${chain},loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  const write = (af, kbps) => ffmpeg(['-i', wav, '-ac', '1', '-af', af, '-ar', '44100', '-c:a', 'aac', '-b:a', `${kbps}k`, '-movflags', '+faststart', out]);
  write(filter, 64);
  // AAC can overshoot a flattened peak and clip when it is decoded (+2 to +6 dB, seen on sparse transients). If it did: band-limit the signal
  // first so the encoder has nothing to cut, hold it under a ceiling, give the encoder more bits (128 kbps is 46 KB for 2.9 s, under the
  // 50 KB limit) and, while it still clips, lower the ceiling by what the decoded file overshot.
  let safe = false;
  let stats = fileStats(out);
  if (stats.peak > maxPeakDb) {
    safe = true;
    let ceiling = 0.8;
    for (let attempt = 0; attempt < 4; attempt++) {
      write(`${filter},${SAFETY(ceiling)}`, attempt === 0 ? 96 : 128);
      stats = fileStats(out);
      if (stats.peak <= maxPeakDb) break;
      if (ceiling <= MIN_CEILING) break; // alimiter cannot go lower: write what we have
      ceiling = Math.max(MIN_CEILING, ceiling * 10 ** (-(stats.peak - maxPeakDb + 0.3) / 20));
    }
  }
  return { preset: chosen.i, lufs: stats.lufs, peak: stats.peak, padded: chosen.padded, safe, ok: meetsRules(stats, maxPeakDb) };
}

/** Both rules of the sound check: within 1.5 LU of -16 LUFS, and no decoded sample above the ceiling. */
export const meetsRules = (stats, maxPeakDb = MAX_PEAK_DB) => Math.abs(stats.lufs - TARGET.I) <= 1.5 && stats.peak <= maxPeakDb;

/** The integrated loudness (LUFS) and the highest sample (dBFS) of a file, as a player will decode it. */
export function fileStats(file) {
  const log = ffmpeg(['-i', file, '-af', 'ebur128=peak=sample', '-f', 'null', '-']);
  const tail = log.slice(log.lastIndexOf('Summary:'));
  const i = /I:\s+(-?[\d.]+) LUFS/.exec(tail);
  const p = /Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(tail);
  return { lufs: i ? parseFloat(i[1]) : -Infinity, peak: p ? parseFloat(p[1]) : -Infinity };
}

export const samplePeak = (file) => fileStats(file).peak;

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const args = process.argv.slice(2);
  if (args[0] === '--one') {
    if (args.length !== 3) { console.error('usage: node tools/sounds/encode-sounds.mjs --one <in.wav> <out.m4a>'); process.exit(2); }
    const r = encode(resolve(args[1]), resolve(args[2]));
    console.log(`${args[2]}: treatment ${r.preset}, ${r.lufs} LUFS, peak ${r.peak} dBFS${r.padded ? ' (padded to measure)' : ''}${r.safe ? ' (re-encoded under a lower ceiling)' : ''}`);
    if (!r.ok) console.warn('warning: this clip cannot meet both -16 LUFS (within 1.5) and no clipping with this encoder; it was written as well as it could be');
  } else {
    const [from, to] = args;
    if (!from || !to) { console.error('usage: node tools/sounds/encode-sounds.mjs <wav folder> <destination folder>'); process.exit(2); }
    mkdirSync(resolve(to), { recursive: true });
    for (const n of NAMES) { const r = encode(resolve(from, `${n}.wav`), resolve(to, `${n}.m4a`)); console.log(`${n}.m4a (treatment ${r.preset}, ${r.lufs} LUFS, peak ${r.peak} dBFS${r.ok ? '' : ' - OUT OF RANGE'})`); }
  }
}
