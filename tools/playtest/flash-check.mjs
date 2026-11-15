// Flash screening for footage (Requirement 18.6): the most general flashes in any one second of a video.
// Usage: node flash-check.mjs <video> [more videos]     exit code 1 when any video has more than 3 flashes in a second
//
// This is a screen, not a certificate. It reads the average brightness of each whole frame (ffmpeg `signalstats`), turns it into
// relative luminance, and counts swings the way WCAG 2.3.1 counts a general flash: a rise and a fall (or a fall and a rise) of
// at least 0.1 of the maximum luminance, where the darker side is below 0.80. A flash that covers only a small part of the frame
// can hide in the average, so a scene with lightning or a strobe should still be watched by a person.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const LIMIT = 3; // more than this many flashes in any one second fails
const toLinear = (y) => (Math.min(255, Math.max(0, y)) / 255) ** 2.2;

/**
 * @param {number[]} lumas  mean luma (0 to 255) of each frame, in order
 * @param {number} fps
 * @returns {number} the largest number of flashes (pairs of opposing swings) in any one second
 */
export function maxFlashesPerSecond(lumas, fps, { threshold = 0.1, floor = 0.8 } = {}) {
  if (lumas.length < 2 || !(fps > 0)) return 0;
  const lin = lumas.map(toLinear);
  const swings = []; // the time of every counted swing
  let ext = lin[0]; // the extreme the signal is travelling from
  let dir = 0; // 1 rising, -1 falling, 0 not moved yet
  for (let i = 1; i < lin.length; i++) {
    const v = lin[i];
    if (dir === 0) {
      if (Math.abs(v - ext) >= threshold) { dir = v > ext ? 1 : -1; swings.push({ t: i / fps, dark: Math.min(v, ext) }); ext = v; }
    } else if (dir === 1) {
      if (v > ext) ext = v;
      else if (ext - v >= threshold) { dir = -1; swings.push({ t: i / fps, dark: Math.min(v, ext) }); ext = v; }
    } else if (v < ext) ext = v;
    else if (v - ext >= threshold) { dir = 1; swings.push({ t: i / fps, dark: Math.min(v, ext) }); ext = v; }
  }
  const counted = swings.filter((s) => s.dark < floor).map((s) => s.t);
  let best = 0;
  for (let i = 0, j = 0; i < counted.length; i++) {
    while (counted[i] - counted[j] >= 1) j++;
    best = Math.max(best, Math.floor((i - j + 1) / 2));
  }
  return best;
}

/** Reads the mean luma of every frame, and the frame rate, with ffmpeg and ffprobe. */
export function readLumas(file) {
  const p = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  if (p.status !== 0) throw new Error(`ffprobe failed on ${file}: ${p.stderr}`);
  const [n, d] = p.stdout.trim().split('/').map(Number);
  const fps = n / (d || 1);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-an', '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg failed on ${file}: ${r.stderr}`);
  const lumas = [...r.stdout.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
  return { lumas, fps };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: node flash-check.mjs <video> [more videos]'); process.exit(2); }
  let failed = false;
  for (const f of files) {
    const { lumas, fps } = readLumas(f);
    const worst = maxFlashesPerSecond(lumas, fps);
    const ok = worst <= LIMIT;
    if (!ok) failed = true;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${f}: ${lumas.length} frames at ${fps.toFixed(2)} fps, at most ${worst} flash${worst === 1 ? '' : 'es'} in any second (limit ${LIMIT})`);
  }
  process.exit(failed ? 1 : 0);
}
