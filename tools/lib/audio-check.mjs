// The checks on a rendered clip (docs/VOICE-LIBRARY-PLAN.md, "Checks on every file"): a real MP3, between 0.8 s and 20 s,
// and not silent. `judgeClip` is pure; `probeClip` asks ffprobe and ffmpeg (no shell, arguments as an array).
import { spawnSync } from 'node:child_process';

export const MIN_MS = 800;
/** Measured: Mark's longest clip is 11.9 s (rate 1.1) and Pippa's 11.4 s (rate 0.9). 20 s leaves room for a slower voice or a longer line; a runaway clip is far longer. */
export const MAX_MS = 20_000;
/** A clip whose loudest sample is below this is silence (speech peaks far above it). */
export const SILENT_BELOW_DB = -50;

/** @param {{ durationMs: number | null, maxVolumeDb: number | null }} m @returns {string[]} the problems, empty when the clip is fine */
export function judgeClip(m) {
  const problems = [];
  if (m.durationMs === null || !Number.isFinite(m.durationMs)) problems.push('the length could not be read; the file is not a playable MP3');
  else {
    if (m.durationMs < MIN_MS) problems.push(`too short: ${m.durationMs} ms (the minimum is ${MIN_MS} ms)`);
    if (m.durationMs > MAX_MS) problems.push(`too long: ${m.durationMs} ms (the maximum is ${MAX_MS} ms)`);
  }
  if (m.maxVolumeDb === null || !Number.isFinite(m.maxVolumeDb)) problems.push('the volume could not be measured');
  else if (m.maxVolumeDb < SILENT_BELOW_DB) problems.push(`silent: the loudest part is ${m.maxVolumeDb} dB`);
  return problems;
}

/** True when both tools can be run. */
export function toolsAvailable() {
  return ['ffprobe', 'ffmpeg'].every((t) => spawnSync(t, ['-version'], { encoding: 'utf8' }).status === 0);
}

/** Measure one file. Returns nulls for what could not be read, so `judgeClip` can name the problem. */
export function probeClip(path) {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path], { encoding: 'utf8' });
  const seconds = probe.status === 0 ? Number.parseFloat(probe.stdout.trim()) : Number.NaN;
  const vol = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /max_volume:\s*(-?[\d.]+|-inf)\s*dB/.exec(vol.stderr ?? '');
  const max = m === null ? null : m[1] === '-inf' ? -200 : Number.parseFloat(m[1]);
  return { durationMs: Number.isFinite(seconds) ? Math.round(seconds * 1000) : null, maxVolumeDb: max };
}

/** The length of a file in milliseconds (ffprobe only; cheaper than probeClip), or null when it cannot be read. */
export function probeDuration(path) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path], { encoding: 'utf8' });
  const seconds = r.status === 0 ? Number.parseFloat(r.stdout.trim()) : Number.NaN;
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
}
