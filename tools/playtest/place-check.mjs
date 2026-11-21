// Blank-Place check for Scene clues (puzzles Requirement 22.3, 22.10): a clip must carry no mark at its Place in any frame of the window.
// Usage: node place-check.mjs <shot> [more shots]      check the Place of each shot in js/places.js against its clip
//        node place-check.mjs --all                    check every shot that has a Place (the root script `check-places`)
//        add --write to put the measured brightness back into js/places.js
// Exit code 1 when any frame of any window has a mark.
//
// This is a screen, not a certificate (a person must still look at every frame, 22.10). It reads grey frames with ffmpeg and compares the
// edge energy inside the Place with the clip's own grain: the noise level of its quietest blocks. Letters, digits and lines are sparse hard
// edges and lift the energy well above what grain does; a blank surface, however grainy, does not. Measured on synthetic clips: a dark
// four-bar mark (contrast about 80 of 255) is caught up to grain of about 6 grey levels; heavier grain than that hides it, so look at the frames too.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** A frame is marked when the Place's edge energy passes GRAIN_FACTOR times what the grain explains, plus FLOOR grey levels. */
export const GRAIN_FACTOR = 1.6;
export const FLOOR = 0.8;
/** Frames checked each second of the window. */
export const FPS = 6;
const BLOCK = 16;

/** Mean absolute gradient (grey levels per pixel step) inside `box` ({x, y, w, h} in pixels) of one grey frame. */
export function edgeEnergy(gray, width, box) {
  let sum = 0;
  let n = 0;
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
    const i = y * width + x;
    sum += (Math.abs(gray[i + 1] - gray[i]) + Math.abs(gray[i + width] - gray[i])) / 2;
    n++;
  }
  return n === 0 ? 0 : sum / n;
}

/** Immerkaer's estimate of the noise level (standard deviation, grey levels) of a block, which hard edges barely move. */
function blockSigma(gray, width, x0, y0) {
  let sum = 0;
  let n = 0;
  for (let y = y0 + 1; y < y0 + BLOCK - 1; y++) for (let x = x0 + 1; x < x0 + BLOCK - 1; x++) {
    const i = y * width + x;
    const v = gray[i - width - 1] - 2 * gray[i - width] + gray[i - width + 1] - 2 * gray[i - 1] + 4 * gray[i] - 2 * gray[i + 1] + gray[i + width - 1] - 2 * gray[i + width] + gray[i + width + 1];
    sum += Math.abs(v);
    n++;
  }
  return n === 0 ? 0 : (Math.sqrt(Math.PI / 2) * sum) / (6 * n);
}

/** The clip's own grain in a frame: the noise level of its quietest quarter of blocks. */
export function grainSigma(gray, width, height) {
  const sigmas = [];
  for (let y = 0; y + BLOCK <= height - 1; y += BLOCK) for (let x = 0; x + BLOCK <= width - 1; x += BLOCK) sigmas.push(blockSigma(gray, width, x, y));
  if (sigmas.length === 0) return 0;
  sigmas.sort((a, b) => a - b);
  return sigmas[Math.floor((sigmas.length - 1) * 0.25)];
}

/** What edge energy grain alone gives: neighbour differences of noise with standard deviation `sigma` average about 1.13 sigma. */
export const grainEnergy = (sigma) => 1.128 * sigma;

/** The Place's box in pixels, inside the picture. */
export function boxPixels(corners, width, height) {
  const xs = corners.map((p) => p[0] * width);
  const ys = corners.map((p) => p[1] * height);
  const x = Math.max(0, Math.floor(Math.min(...xs)));
  const y = Math.max(0, Math.floor(Math.min(...ys)));
  return { x, y, w: Math.min(width - 2 - x, Math.ceil(Math.max(...xs)) - x), h: Math.min(height - 2 - y, Math.ceil(Math.max(...ys)) - y) };
}

/**
 * Checks frames of a Place's window.
 * @param {Uint8Array[]} frames grey frames, `width` by `height`
 * @param {{ corners: number[][], from: number }} place
 * @returns {{ ok: boolean, worst: { frame: number, energy: number, limit: number } | null, luma: number, frames: { energy: number, limit: number, marked: boolean }[] }}
 */
export function checkFrames(frames, width, height, place, { grainFactor = GRAIN_FACTOR, floor = FLOOR } = {}) {
  const box = boxPixels(place.corners, width, height);
  const out = frames.map((f) => {
    const energy = edgeEnergy(f, width, box);
    const limit = grainFactor * grainEnergy(grainSigma(f, width, height)) + floor;
    return { energy, limit, marked: energy > limit };
  });
  let worst = null;
  out.forEach((f, i) => { if (f.marked && (worst === null || f.energy - f.limit > worst.energy - worst.limit)) worst = { frame: i, energy: f.energy, limit: f.limit }; });
  let lumaSum = 0;
  let lumaN = 0;
  for (const f of frames) for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) { lumaSum += f[y * width + x]; lumaN++; }
  return { ok: worst === null && out.length > 0, worst, luma: lumaN === 0 ? 0 : Math.round((lumaSum / lumaN / 255) * 100) / 100, frames: out };
}

/** Reads the grey frames of a window from a video with ffmpeg. */
export function readWindow(file, from, to, width, height, fps = FPS) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(from), '-t', String(to - from), '-i', file, '-vf', `fps=${fps},scale=${width}:${height},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg failed on ${file}: ${r.stderr?.toString().slice(0, 200)}`);
  const size = width * height;
  const frames = [];
  for (let o = 0; o + size <= r.stdout.length; o += size) frames.push(new Uint8Array(r.stdout.subarray(o, o + size)));
  return frames;
}

/** The size of a video's picture. */
export function sizeOf(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const [w, h] = r.stdout.trim().split(',').map(Number);
  if (!(w > 0 && h > 0)) throw new Error(`cannot read the size of ${file}`);
  return { width: w, height: h };
}

/** Checks one clip's Place over its window. */
export function checkClip(file, place) {
  const { width, height } = sizeOf(file);
  return { width, height, ...checkFrames(readWindow(file, place.from, place.to, width, height), width, height, place) };
}

/** Puts a measured brightness into the line of `shot` in the text of places.js. */
export function writeLuma(source, shot, luma) {
  const re = new RegExp(`(^\\s*${shot}:\\s*\\{[^\\n]*?luma:\\s*)[0-9.]+`, 'm');
  if (!re.test(source)) throw new Error(`no Place line for ${shot}`);
  return source.replace(re, `$1${luma}`);
}

/**
 * What is missing from the record of a clip that has a Place (22.10): a clip made by a model must have an entry that names the model, the take, the
 * date and the prompt. A film clip needs only its entry. `provenance` is the text of media/PROVENANCE.md.
 */
export function placeRecordProblems(file, provenance) {
  const name = file.replace(/\.[a-z0-9]+$/, '');
  const at = provenance.search(new RegExp(`^#{2,4} ${name}\\s*$`, 'm'));
  if (at < 0) return [`${name} has no entry in PROVENANCE.md`];
  const rest = provenance.slice(provenance.indexOf('\n', at) + 1);
  const next = rest.search(/^#{2,4} /m);
  const entry = next < 0 ? rest : rest.slice(0, next);
  if (!name.startsWith('ai-') && !/^wander-.*-take\d+$/.test(name)) return [];
  const out = [];
  if (!/\|\s*Model\s*\|\s*[^\s|]/.test(entry)) out.push(`${name}: the entry does not name the model`);
  if (!/\|\s*Take\s*\|\s*[^\s|]/.test(entry)) out.push(`${name}: the entry does not name the take`);
  if (!/\d{4}-\d{2}-\d{2}/.test(entry)) out.push(`${name}: the entry has no date`);
  if (!/prompts?,? exactly as submitted/i.test(provenance)) out.push('PROVENANCE.md has no section with the exact prompts');
  return out;
}

async function main(argv) {
  const here = dirname(fileURLToPath(import.meta.url));
  const { PLACES } = await import('./js/places.js');
  const { SHOTS } = await import('./js/scenes.js');
  const write = argv.includes('--write');
  const names = argv.includes('--all') ? Object.keys(PLACES) : argv.filter((a) => !a.startsWith('--'));
  if (names.length === 0) { console.log('place-check: no shot has a Place, nothing to check'); return 0; }
  let failed = 0;
  for (const shot of names) {
    const place = PLACES[shot];
    const file = SHOTS[shot] ? resolve(here, 'media', `${SHOTS[shot]}.mp4`) : null;
    if (!place || !file) { console.error(`place-check: ${shot} has no Place or no clip`); failed++; continue; }
    const record = placeRecordProblems(SHOTS[shot], readFileSync(resolve(here, 'media', 'PROVENANCE.md'), 'utf8'));
    if (record.length > 0) { failed++; for (const p of record) console.error(`RECORD ${shot}: ${p}`); continue; }
    const r = checkClip(file, place);
    if (r.ok) console.log(`OK    ${shot}: ${r.frames.length} frames, no mark at the Place, brightness ${r.luma}`);
    else { failed++; console.error(`MARK  ${shot}: frame ${r.worst?.frame} has edge energy ${r.worst?.energy.toFixed(2)} over the limit ${r.worst?.limit.toFixed(2)}`); }
    if (write && r.ok) {
      const p = resolve(here, 'js/places.js');
      writeFileSync(p, writeLuma(readFileSync(p, 'utf8'), shot, r.luma));
    }
  }
  return failed > 0 ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(await main(process.argv.slice(2)));
