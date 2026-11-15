// Test helper (not a test file): real MP3 bytes made by ffmpeg.
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

/** A real MP3 made by ffmpeg: a tone or silence, of a length, as bytes. */
export function makeMp3({ kind = 'tone', seconds = 2 } = {}) {
  const src = kind === 'tone' ? `sine=frequency=440:duration=${seconds}` : `anullsrc=r=22050:cl=mono`;
  const args = ['-v', 'error', '-f', 'lavfi', '-i', src, '-t', String(seconds), '-ac', '1', '-b:a', '64k', '-f', 'mp3', 'pipe:1'];
  const r = spawnSync('ffmpeg', args, { maxBuffer: 20 * 1024 * 1024 });
  assert.equal(r.status, 0, String(r.stderr));
  return r.stdout;
}

