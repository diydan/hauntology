// The build check for the sound files (party-mode Requirement 20): fails on a file with no credit, over a size limit, or in the wrong format.
// Usage: node tools/check-sounds.mjs [sounds folder] [credits file]      (defaults: web/public/sounds and docs/sounds/CREDITS.md)
//
// The rules (docs/SOUNDS.md): seven files named creak, whisper, bell, laugh, wind, rumble and becoming, and two for the footage scenes
// named knock and scrape (puzzles Requirement 20.6); each mono AAC `.m4a` of at most 50 KB, at most 350 KB in all, at most 3 seconds
// (the becoming 4); levelled to about -16 LUFS and not clipped; one row of credit each.
// The format, length and loudness checks use ffprobe and ffmpeg; without them those checks are skipped with a warning.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NAMES = ['creak', 'whisper', 'bell', 'laugh', 'wind', 'rumble', 'becoming'];
/** The two sounds of the footage scenes: the claw on the rim of the crate (the Reel at Haunt 3) and the hand at the door (Haunt 7 and 8). */
export const SCENE_NAMES = ['knock', 'scrape'];
/** The optional ambient loops of the conditions spec (task 4.3): `<dir>/ambient/<weather>-<day|night>.m4a`, at most twelve, every one credited as `ambient/<name>.m4a`. */
export const AMBIENT_DIR = 'ambient';
export const AMBIENT_WEATHER = ['clear', 'cloud', 'fog', 'rain', 'storm', 'snow'];
export const AMBIENT_LIMITS = { perFile: 150 * 1024, total: 1.5 * 1024 * 1024, minSeconds: 4, maxSeconds: 20, files: 12 };
export const LIMITS = { perFile: 50 * 1024, total: 350 * 1024, seconds: 3, becomingSeconds: 4, lufs: -16, lufsTolerance: 1.5, peakDb: -0.1 };

const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const hasTool = (cmd) => run(cmd, ['-version']).status === 0;

/** The credit rows: file name (first cell) to the other four cells. */
export function readCredits(text) {
  const rows = new Map();
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 5 || cells[0] === 'File' || /^-+$/.test(cells[0])) continue;
    rows.set(cells[0].replace(/`/g, ''), cells.slice(1, 5));
  }
  return rows;
}

function probe(file) {
  const r = run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,channels:format=duration', '-of', 'json', file]);
  if (r.status !== 0) return null;
  const j = JSON.parse(r.stdout);
  return { codec: j.streams?.[0]?.codec_name, channels: j.streams?.[0]?.channels, seconds: Number(j.format?.duration) };
}

function loudness(file) {
  const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=sample', '-f', 'null', '-']);
  const tail = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const i = /I:\s+(-?[\d.]+) LUFS/.exec(tail);
  const p = /Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(tail);
  return i ? { lufs: Number(i[1]), peak: p ? Number(p[1]) : -Infinity } : null;
}

/**
 * @param {{ dir?: string, credits?: string, limits?: Partial<typeof LIMITS>, deep?: boolean }} [opts]
 * @returns {{ errors: string[], warnings: string[], files: string[] }}
 */
export function checkSounds({ dir = 'web/public/sounds', credits = 'docs/sounds/CREDITS.md', limits = {}, deep = true } = {}) {
  const L = { ...LIMITS, ...limits };
  const errors = [];
  const warnings = [];
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => !f.startsWith('.') && f !== AMBIENT_DIR).sort() : [];
  const rows = existsSync(credits) ? readCredits(readFileSync(credits, 'utf8')) : new Map();
  if (!existsSync(credits)) errors.push(`${credits} does not exist`);
  const tools = deep && hasTool('ffprobe') && hasTool('ffmpeg');
  if (deep && !tools) warnings.push('ffprobe or ffmpeg is not installed: the format, length and loudness checks were skipped');
  let total = 0;
  for (const f of files) {
    const path = resolve(dir, f);
    const m = /^([a-z]+)\.m4a$/.exec(f);
    if (!m || ![...NAMES, ...SCENE_NAMES].includes(m[1])) { errors.push(`${f}: not one of the sound files (${[...NAMES, ...SCENE_NAMES].map((n) => `${n}.m4a`).join(', ')}) or not .m4a`); continue; }
    const size = statSync(path).size;
    total += size;
    if (size > L.perFile) errors.push(`${f}: ${size} bytes is over the limit of ${L.perFile}`);
    const row = rows.get(f);
    if (!row) errors.push(`${f}: no row in ${credits}`);
    else if (row.some((c) => !c)) errors.push(`${f}: its row in ${credits} has an empty cell (title and author, source, licence and changes are all needed)`);
    if (!tools) continue;
    const p = probe(path);
    if (!p) { errors.push(`${f}: ffprobe cannot read it`); continue; }
    if (p.codec !== 'aac') errors.push(`${f}: codec is ${p.codec}, not aac`);
    if (p.channels !== 1) errors.push(`${f}: ${p.channels} channels, not mono`);
    const max = m[1] === 'becoming' ? L.becomingSeconds : L.seconds;
    if (!(p.seconds <= max)) errors.push(`${f}: ${p.seconds.toFixed(2)} s is over the limit of ${max} s`);
    const l = loudness(path);
    if (!l) warnings.push(`${f}: loudness could not be measured`);
    else {
      if (Math.abs(l.lufs - L.lufs) > L.lufsTolerance) errors.push(`${f}: ${l.lufs} LUFS is not about ${L.lufs} (within ${L.lufsTolerance})`);
      if (l.peak > L.peakDb) errors.push(`${f}: peak ${l.peak} dBFS clips (limit ${L.peakDb})`);
    }
  }
  // The ambient loops are optional: a missing folder or file is fine (the Viewer skips what it cannot load), a wrong one is not.
  const amb = checkAmbient({ dir: resolve(dir, AMBIENT_DIR), credits, rows, L, tools });
  errors.push(...amb.errors);
  warnings.push(...amb.warnings);
  if (total > L.total) errors.push(`all files together are ${total} bytes, over the limit of ${L.total}`);
  for (const name of rows.keys()) if (!name.startsWith(`${AMBIENT_DIR}/`) && !files.includes(name)) warnings.push(`${credits} has a row for ${name}, which is not in ${dir}`);
  return { errors, warnings, files: [...files, ...amb.files.map((f) => `${AMBIENT_DIR}/${f}`)] };
}

/** The ambient loops: names, count, size, mono AAC, a loop-length duration, the same loudness and peak rules as the clips, and one credit row each (`ambient/<name>.m4a`). */
function checkAmbient({ dir, credits, rows, L, tools }) {
  const errors = [];
  const warnings = [];
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => !f.startsWith('.')).sort() : [];
  const allowed = new Set(AMBIENT_WEATHER.flatMap((w) => [`${w}-day.m4a`, `${w}-night.m4a`]));
  if (files.length > AMBIENT_LIMITS.files) errors.push(`ambient: ${files.length} files, at most ${AMBIENT_LIMITS.files}`);
  let total = 0;
  for (const f of files) {
    const path = resolve(dir, f);
    const key = `${AMBIENT_DIR}/${f}`;
    if (!allowed.has(f)) { errors.push(`${key}: not one of <weather>-<day|night>.m4a for clear, cloud, fog, rain, storm or snow`); continue; }
    const size = statSync(path).size;
    total += size;
    if (size > AMBIENT_LIMITS.perFile) errors.push(`${key}: ${size} bytes is over the limit of ${AMBIENT_LIMITS.perFile}`);
    const row = rows.get(key);
    if (!row) errors.push(`${key}: no row in ${credits}`);
    else if (row.some((c) => !c)) errors.push(`${key}: its row in ${credits} has an empty cell`);
    if (!tools) continue;
    const p = probe(path);
    if (!p) { errors.push(`${key}: ffprobe cannot read it`); continue; }
    if (p.codec !== 'aac') errors.push(`${key}: codec is ${p.codec}, not aac`);
    if (p.channels !== 1) errors.push(`${key}: ${p.channels} channels, not mono`);
    if (!(p.seconds >= AMBIENT_LIMITS.minSeconds && p.seconds <= AMBIENT_LIMITS.maxSeconds)) errors.push(`${key}: ${p.seconds.toFixed(2)} s is not a loop length (${AMBIENT_LIMITS.minSeconds} to ${AMBIENT_LIMITS.maxSeconds} s)`);
    const l = loudness(path);
    if (!l) warnings.push(`${key}: loudness could not be measured`);
    else {
      if (Math.abs(l.lufs - L.lufs) > L.lufsTolerance) errors.push(`${key}: ${l.lufs} LUFS is not about ${L.lufs} (within ${L.lufsTolerance})`);
      if (l.peak > L.peakDb) errors.push(`${key}: peak ${l.peak} dBFS clips (limit ${L.peakDb})`);
    }
  }
  if (total > AMBIENT_LIMITS.total) errors.push(`ambient: the files together are ${total} bytes, over the limit of ${AMBIENT_LIMITS.total}`);
  for (const name of rows.keys()) if (name.startsWith(`${AMBIENT_DIR}/`) && !files.includes(name.slice(AMBIENT_DIR.length + 1))) warnings.push(`${credits} has a row for ${name}, which is not in ${dir}`);
  return { errors, warnings, files };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [dir, credits] = process.argv.slice(2);
  const r = checkSounds({ dir: dir || 'web/public/sounds', credits: credits || 'docs/sounds/CREDITS.md' });
  for (const w of r.warnings) console.warn(`warning: ${w}`);
  for (const e of r.errors) console.error(`error: ${e}`);
  if (r.errors.length) process.exit(1);
  console.log(`OK: ${r.files.length} sound file${r.files.length === 1 ? '' : 's'} checked.`);
}
