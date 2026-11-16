// Listening reels for tools/prerender-voice.mjs --reel (ghost-voice task 3.11): one MP3 per voice, so the owner can hear every
// rendered line in one sitting before approving it. A spoken label comes first ("Chloe", then "stall one" before each line), every
// clip is brought to the same loudness, and a text index lists each line with its start time so "stall three sounds wrong" can be
// found again. A reel is a throwaway listening aid: it is never uploaded and is rebuilt (overwritten) each time.
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { probeDuration } from './audio-check.mjs';
import { fileNameFor, hashOf } from './prerender-plan.mjs';

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
export const LEVEL = 'loudnorm=I=-18:TP=-2:LRA=11';
export const GAP_MS = 900;

/** "lodger.stall.1" -> "stall one"; "haunt.cold-spot.soft.2" -> "haunt cold spot two"; "reveal.dry.14" -> "reveal fourteen". */
export function labelFor(id) {
  const parts = id.split('.').filter((p) => p !== 'lodger' && p !== 'soft' && p !== 'dry');
  const last = parts[parts.length - 1];
  const n = /^\d+$/.test(last ?? '') ? Number(last) : null;
  const words = (n === null ? parts : parts.slice(0, -1)).map((p) => p.replaceAll('-', ' ')).join(' ');
  if (n === null) return words;
  return `${words} ${n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n)}`.trim();
}

/** "01:07" for 67,000 ms. */
export const fmtTime = (ms) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/**
 * Which files go on which reel. Lines that are not rendered yet are listed, not guessed at; the reel holds what exists, in manifest order.
 * @param {{ manifest: any, voice: string | null, fileState: (file: string) => 'ok' | 'bad' | 'missing' }} i
 */
export function planReel({ manifest, voice, fileState }) {
  const byVoice = new Map();
  for (const e of manifest.entries) {
    if (voice !== null && e.voice !== voice) continue;
    hashOf(e.key);
    const r = byVoice.get(e.voice) ?? { voice: e.voice, entries: [], missing: [], bad: [] };
    byVoice.set(e.voice, r);
    const file = fileNameFor(e.key, 1);
    const item = { key: e.key, file, spoken: e.spoken, sources: e.sources ?? [] };
    const state = fileState(file);
    (state === 'ok' ? r.entries : state === 'bad' ? r.bad : r.missing).push(item);
  }
  return [...byVoice.values()];
}

const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', cwd });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 6).join(' ')} ... failed: ${(r.stderr ?? '').trim().slice(-300)}`);
};

/**
 * Build one reel.
 * @param {object} o
 * @param {string} o.voice            e.g. 'inworld:Chloe'
 * @param {{ file: string, spoken: string, sources: string[] }[]} o.entries   rendered lines, in order
 * @param {string} o.libDir           where the rendered files are
 * @param {string} o.outDir           the reel goes to <outDir>/reels/
 * @param {(text: string, dest: string) => boolean} o.say   writes an audio file of the label; false when it cannot (then there are no labels)
 */
export async function buildReel({ voice, entries, libDir, outDir, say }) {
  if (entries.length === 0) throw new Error(`no rendered files for ${voice}`);
  const name = voice.slice(voice.indexOf(':') + 1).toLowerCase();
  const reels = join(outDir, 'reels');
  await mkdir(reels, { recursive: true });
  const work = await mkdtemp(join(tmpdir(), 'voice-reel-'));
  try {
    const ff = (args) => run('ffmpeg', ['-y', '-v', 'error', ...args], work);
    ff(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(GAP_MS / 1000), '-c:a', 'pcm_s16le', 'gap.wav']);
    const gap = probeDuration(join(work, 'gap.wav'));
    const toWav = (src, dest) => ff(['-i', src, '-ar', '44100', '-ac', '1', '-af', LEVEL, dest]);

    const list = [];
    const index = [];
    let cursor = 0;
    const add = (file, ms) => { list.push(file); cursor += ms; };

    const voiceLabel = voice.slice(voice.indexOf(':') + 1);
    let labelled = say(voiceLabel, join(work, 'v.aud'));
    if (labelled) { toWav(join(work, 'v.aud'), join(work, 'v.wav')); add('v.wav', probeDuration(join(work, 'v.wav'))); add('gap.wav', gap); add('gap.wav', gap); }

    for (const [i, e] of entries.entries()) {
      if (labelled) {
        const id = e.sources[0] ?? `line ${i + 1}`;
        if (say(labelFor(id), join(work, `l${i}.aud`))) { toWav(join(work, `l${i}.aud`), join(work, `l${i}.wav`)); add(`l${i}.wav`, probeDuration(join(work, `l${i}.wav`))); add('gap.wav', gap); }
      }
      toWav(join(libDir, e.file), join(work, `c${i}.wav`));
      const ms = probeDuration(join(work, `c${i}.wav`));
      index.push({ startMs: cursor, id: e.sources.join(','), text: e.spoken, ms });
      add(`c${i}.wav`, ms); add('gap.wav', gap); add('gap.wav', gap); add('gap.wav', gap);
    }

    await writeFile(join(work, 'list.txt'), list.map((f) => `file '${f}'\n`).join(''));
    ff(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c:a', 'libmp3lame', '-b:a', '128k', 'reel.mp3']);

    const path = join(reels, `reel-${name}.mp3`);
    const indexPath = join(reels, `reel-${name}.index.txt`);
    await rename(join(work, 'reel.mp3'), path).catch(async () => { await writeFile(path, await readFile(join(work, 'reel.mp3'))); });
    await writeFile(indexPath, `${voice}: ${entries.length} lines${labelled ? ', spoken labels' : ', no spoken labels'}\n\n${index.map((x) => `${fmtTime(x.startMs)}  ${x.id.padEnd(22)}  ${x.text}`).join('\n')}\n`);
    return { path, indexPath, durationMs: probeDuration(path), lines: entries.length, labelled, index };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** The macOS `say` command as a label maker: a Samantha voice if there is one, else the default; false when `say` is missing. */
export function macSay(text, dest) {
  for (const args of [['-v', 'Samantha', '-o', dest, '--', text], ['-o', dest, '--', text]]) {
    const r = spawnSync('say', args, { encoding: 'utf8' });
    if (r.status === 0) return true;
  }
  return false;
}
