// The upload half of tools/prerender-voice.mjs (ghost-voice task 3.11): puts approved Library files into R2 with the OWNER's
// Wrangler login (`wrangler r2 object put --remote`), so no token is stored anywhere. Its rules are fixed and tested:
//   - nothing is uploaded unless the caller passes `yes`; without it the plan is only a preview;
//   - an existing object is NEVER overwritten: a key that is already there with the same audio is skipped, one with different
//     audio stops the run and prints the delete command the owner would have to choose to run;
//   - every local file is checked again (MP3 header, 0.8 s to 20 s, not silent) just before it is sent;
//   - every upload is read back and compared (size and SHA-256); a mismatch stops the run;
//   - one request at a time, no retries, stops at the first problem; starting again skips what is done;
//   - only keys of the manifest, under `speech/lib/v1/`, are ever named.
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { judgeClip, probeClip } from './audio-check.mjs';
import { fileNameFor, hashOf, looksLikeMp3 } from './prerender-plan.mjs';

export const DEFAULT_BUCKET = 'hauntology-worlds';
export const BUCKET_PATTERN = /^[a-z0-9][a-z0-9-]{2,62}$/;
/** A bucket made with a jurisdiction (an EU-only bucket, say) is only found by Wrangler when every call names it. */
export const JURISDICTIONS = ['eu', 'fedramp'];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * What an upload of one voice (or all) would send. Take 1 only: one take per line is the decision (docs/VOICE-LIBRARY-PLAN.md).
 * @param {{ manifest: any, voice: string | null, bucket: string, fileState: (file: string) => 'ok' | 'bad' | 'missing' }} i
 */
export function planUpload({ manifest, voice, bucket, fileState }) {
  if (!BUCKET_PATTERN.test(bucket)) throw new Error(`"${bucket}" is not a valid bucket name`);
  const entries = [];
  const missing = [];
  const bad = [];
  for (const e of manifest.entries) {
    if (voice !== null && e.voice !== voice) continue;
    hashOf(e.key); // refuses anything that is not a Library key
    const file = fileNameFor(e.key, 1);
    const state = fileState(file);
    if (state === 'missing') missing.push({ voice: e.voice, file, sources: e.sources ?? [] });
    else if (state === 'bad') bad.push({ voice: e.voice, file, sources: e.sources ?? [] });
    else entries.push({ key: e.key, voice: e.voice, file, object: `${bucket}/${e.key}`, sources: e.sources ?? [] });
  }
  return { entries, missing, bad, bucket };
}

const deleteCommand = (object, jurisdiction = null) => `pnpm --filter api exec wrangler r2 object delete ${object} --remote${jurisdiction === null ? '' : ` --jurisdiction ${jurisdiction}`}`;

/**
 * @param {object} o
 * @param {ReturnType<typeof planUpload>['entries']} o.entries
 * @param {string} o.outDir
 * @param {string} o.bucket
 * @param {string | null} [o.jurisdiction]  'eu' or 'fedramp' when the bucket was created with one; added to every call
 * @param {(args: string[]) => { status: number | null, stdout: string, stderr: string }} o.run  runs `wrangler <args>`
 * @param {(path: string) => { durationMs: number | null, maxVolumeDb: number | null }} [o.probe]
 * @param {() => number} [o.now]
 * @param {(line: string) => void} [o.log]
 */
export async function uploadFiles({ entries, outDir, bucket, jurisdiction = null, run, probe = probeClip, now = Date.now, log = () => {} }) {
  const uploaded = [];
  const already = [];
  let stopped = null;
  if (jurisdiction !== null && !JURISDICTIONS.includes(jurisdiction)) return { uploaded, already, stopped: { kind: 'error', message: `jurisdiction must be one of ${JURISDICTIONS.join(', ')}` } };
  const jur = jurisdiction === null ? [] : ['--jurisdiction', jurisdiction];

  // 0. The bucket must exist. (Read-only.) A missing bucket is the likeliest first problem, so it gets its own message.
  const info = run(['r2', 'bucket', 'info', bucket, ...jur]);
  if (info.status !== 0) {
    const text = `${info.stdout}\n${info.stderr}`;
    const message = /bucket does not exist|10006/i.test(text)
      ? `the bucket "${bucket}" does not exist in this account. Create it first: pnpm --filter api exec wrangler r2 bucket create ${bucket}${jurisdiction === null ? '' : ` --jurisdiction ${jurisdiction}`}  (choose its location or jurisdiction first; neither can be changed afterwards)`
      : `could not check the bucket "${bucket}" (are you logged in? try: pnpm --filter api exec wrangler whoami): ${text.trim().slice(0, 300)}`;
    return { uploaded, already, stopped: { kind: 'error', message } };
  }

  const ledgerPath = join(outDir, 'uploaded.json');
  let ledger = [];
  try { ledger = JSON.parse(await readFile(ledgerPath, 'utf8')); } catch { /* none yet */ }

  const work = await mkdtemp(join(tmpdir(), 'voice-upload-'));
  /** Download an object to a temp file; returns the bytes, null when the key is not there, or throws a Problem. */
  const fetchRemote = async (object, tag) => {
    const dest = join(work, `${tag}.mp3`);
    const r = run(['r2', 'object', 'get', object, '--remote', ...jur, '--file', dest]);
    if (r.status === 0) return readFile(dest);
    if (/specified key does not exist|10007|NoSuchKey/i.test(`${r.stdout}\n${r.stderr}`)) return null;
    throw new Error(`could not check ${object}: ${`${r.stdout}\n${r.stderr}`.trim().slice(0, 300)}`);
  };

  try {
    for (const [i, e] of entries.entries()) {
      const label = `${i + 1}/${entries.length} ${e.voice} ${e.sources.join(',')}`;
      const path = join(outDir, e.file);
      const local = await readFile(path);
      const localHash = sha256(local);

      const problems = looksLikeMp3(local) ? judgeClip(probe(path)) : ['not an MP3'];
      if (problems.length > 0) { stopped = { kind: 'local', entry: e, message: `${e.file} failed its check just before upload: ${problems.join('; ')}` }; break; }

      let remote;
      try { remote = await fetchRemote(e.object, `check-${i}`); } catch (err) { stopped = { kind: 'error', entry: e, message: err.message }; break; }
      if (remote !== null) {
        if (sha256(remote) === localHash) { already.push(e); log(`skip ${label}  already there, identical`); continue; }
        stopped = { kind: 'conflict', entry: e, message: `${e.object} already exists with DIFFERENT audio. Not overwritten. If you mean to replace it, delete it yourself, then run again: ${deleteCommand(e.object, jurisdiction)}` };
        break;
      }

      const put = run(['r2', 'object', 'put', e.object, '--remote', ...jur, '--content-type', 'audio/mpeg', '--file', path]);
      if (put.status !== 0) { stopped = { kind: 'error', entry: e, message: `upload of ${e.object} failed: ${`${put.stdout}\n${put.stderr}`.trim().slice(0, 300)}. It may or may not be there; starting again checks first.` }; break; }

      let back;
      try { back = await fetchRemote(e.object, `verify-${i}`); } catch (err) { stopped = { kind: 'error', entry: e, message: `uploaded, but reading ${e.object} back failed: ${err.message}` }; break; }
      if (back === null || sha256(back) !== localHash || back.length !== local.length) {
        stopped = { kind: 'verify', entry: e, message: `${e.object} was uploaded but reads back different (or missing). Remove it before trusting it: ${deleteCommand(e.object, jurisdiction)}` };
        break;
      }

      const row = { key: e.key, voice: e.voice, file: e.file, bucket, bytes: local.length, sha256: localHash, uploadedAt: new Date(now()).toISOString() };
      ledger.push(row);
      await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
      uploaded.push(row);
      log(`ok   ${label}  ${local.length} bytes  uploaded and read back, identical`);
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  return { uploaded, already, stopped, ledgerPath };
}
