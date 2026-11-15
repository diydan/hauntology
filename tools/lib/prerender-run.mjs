// The rendering half of tools/prerender-voice.mjs (ghost-voice task 3.11). It spends money, so its rules are fixed and tested:
//   - one request at a time, in the plan's order;
//   - NO retries: a failure of any kind stops the run and names the file (a retry would be billed again);
//   - the budget is checked before every call, and a call counts as spent before it is made (a failed call may still be billed);
//   - a clip is checked (MP3 header, 0.8 s to 20 s, not silent) before it gets its final name; a failed clip is kept as
//     `<file>.rejected` and never counts as done;
//   - an existing file is never overwritten.
import { link, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { judgeClip, probeClip } from './audio-check.mjs';
import { PRICE_USD_PER_MILLION_CHARS, looksLikeMp3, settingsForVoice, usdFor } from './prerender-plan.mjs';

export const REQUEST_TIMEOUT_MS = 120_000;

/**
 * @param {object} o
 * @param {{ key: string, voice: string, take: number, file: string, spoken: string, chars: number, sources?: string[] }[]} o.jobs
 * @param {object} o.manifest
 * @param {string} o.outDir
 * @param {string} o.workerUrl
 * @param {string} o.token
 * @param {number} o.budgetUsd
 * @param {typeof fetch} [o.fetchFn]
 * @param {(path: string) => { durationMs: number | null, maxVolumeDb: number | null }} [o.probe]
 * @param {() => number} [o.now]
 * @param {(line: string) => void} [o.log]
 */
export async function renderJobs({ jobs, manifest, outDir, workerUrl, token, budgetUsd, fetchFn = fetch, probe = probeClip, now = Date.now, log = () => {} }) {
  const budgetMicro = Math.round(budgetUsd * 1_000_000);
  await mkdir(outDir, { recursive: true });
  const reportPath = join(outDir, 'report.json');
  let report = [];
  try { report = JSON.parse(await readFile(reportPath, 'utf8')); } catch { /* no report yet */ }

  const rendered = [];
  let spentChars = 0;
  let stopped = null;

  for (const [i, job] of jobs.entries()) {
    if ((spentChars + job.chars) * PRICE_USD_PER_MILLION_CHARS > budgetMicro) {
      stopped = { kind: 'budget', message: `stopped before ${job.file}: the next file would pass the budget` };
      break;
    }
    const s = settingsForVoice(job.voice, manifest);
    spentChars += job.chars; // counted before the call
    const label = `${i + 1}/${jobs.length} ${job.voice} take ${job.take} ${(job.sources ?? []).join(',')}`;
    const t0 = now();

    let bytes;
    try {
      const res = await fetchFn(workerUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-render-token': token },
        body: JSON.stringify({ voice_id: job.voice.slice('inworld:'.length), tag: s.tag, text: job.spoken, temperature: s.temperature, speaking_rate: s.rate }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        let detail = '';
        try { detail = (await res.text()).slice(0, 300); } catch { /* keep empty */ }
        stopped = { kind: 'error', job, message: `the render Worker answered ${res.status}: ${detail}` };
        break;
      }
      bytes = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      stopped = { kind: 'error', job, message: `the request failed: ${String(e).slice(0, 300)} (it may still have been billed)` };
      break;
    }

    const finalPath = join(outDir, job.file);
    const partPath = `${finalPath}.part`;
    const rejectedPath = `${finalPath}.rejected`;
    await writeFile(partPath, bytes);

    const problems = looksLikeMp3(bytes) ? judgeClip(probe(partPath)) : ['the answer is not an MP3 (no header, or smaller than 800 bytes)'];
    if (problems.length > 0) {
      await rename(partPath, rejectedPath);
      stopped = { kind: 'rejected', job, message: `${problems.join('; ')}. Kept as ${rejectedPath}` };
      break;
    }
    try {
      await link(partPath, finalPath); // fails if the name is taken: never overwrite
    } catch (e) {
      await unlink(partPath).catch(() => {});
      stopped = { kind: 'error', job, message: `${finalPath} already exists; not overwritten (${e.code ?? e})` };
      break;
    }
    await unlink(partPath);

    const measured = probe(finalPath);
    const entry = { key: job.key, voice: job.voice, take: job.take, file: job.file, sources: job.sources ?? [], bytes: bytes.length, durationMs: measured.durationMs, chars: job.chars, renderedAt: new Date(now()).toISOString(), tookMs: now() - t0 };
    report.push(entry);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    rendered.push(entry);
    log(`ok   ${label}  ${bytes.length} bytes  ${entry.durationMs} ms of audio  ${entry.tookMs} ms to render`);
  }

  return { rendered, stopped, spentChars, spentUsd: usdFor(spentChars), reportPath };
}
