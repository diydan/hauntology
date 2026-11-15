// Tests for tools/lib/audio-check.mjs. The probe tests need ffmpeg and ffprobe, and are skipped without them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { judgeClip, probeClip, toolsAvailable, MAX_MS, MIN_MS, SILENT_BELOW_DB } from '../lib/audio-check.mjs';
import { makeMp3 } from './mp3-helper.mjs';

const have = toolsAvailable();

test('judgeClip: a normal clip has no problems', () => {
  assert.deepEqual(judgeClip({ durationMs: 4200, maxVolumeDb: -3 }), []);
  assert.deepEqual(judgeClip({ durationMs: MIN_MS, maxVolumeDb: SILENT_BELOW_DB }), []);
  assert.deepEqual(judgeClip({ durationMs: MAX_MS, maxVolumeDb: -20 }), []);
});

test('judgeClip: too short, too long, silent, or unreadable', () => {
  assert.match(judgeClip({ durationMs: MIN_MS - 1, maxVolumeDb: -3 }).join(), /too short/);
  assert.match(judgeClip({ durationMs: MAX_MS + 1, maxVolumeDb: -3 }).join(), /too long/);
  assert.match(judgeClip({ durationMs: 3000, maxVolumeDb: SILENT_BELOW_DB - 1 }).join(), /silent/);
  assert.match(judgeClip({ durationMs: null, maxVolumeDb: -3 }).join(), /not a playable MP3/);
  assert.match(judgeClip({ durationMs: 3000, maxVolumeDb: null }).join(), /volume could not be measured/);
  assert.equal(judgeClip({ durationMs: null, maxVolumeDb: null }).length, 2);
});

test('probeClip reads a real tone, a short tone, silence, a long tone and garbage', { skip: !have && 'ffmpeg or ffprobe is missing' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'audio-check-'));
  try {
    const put = (name, bytes) => { const p = join(dir, name); writeFileSync(p, bytes); return p; };
    const ok = probeClip(put('ok.mp3', makeMp3({ seconds: 2 })));
    assert.ok(ok.durationMs >= 1900 && ok.durationMs <= 2300, `duration ${ok.durationMs}`);
    assert.deepEqual(judgeClip(ok), []);
    assert.match(judgeClip(probeClip(put('short.mp3', makeMp3({ seconds: 0.3 })))).join(), /too short/);
    assert.match(judgeClip(probeClip(put('silent.mp3', makeMp3({ kind: 'silence', seconds: 2 })))).join(), /silent/);
    assert.match(judgeClip(probeClip(put('long.mp3', makeMp3({ seconds: 22 })))).join(), /too long/);
    assert.match(judgeClip(probeClip(put('junk.mp3', Buffer.from('{"error":"quota"}'.repeat(100))))).join(), /not a playable MP3|could not be measured/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
