#!/usr/bin/env node
// A fake `wrangler` for the Gallery ingest tests (any content type; `--local` or `--remote`). It keeps "R2" in a folder ($FAKE_R2_DIR),
// knows which buckets exist for `bucket info` ($FAKE_BUCKETS), logs every call as one JSON line ($FAKE_LOG), records the content type of
// each put in `.types.json`, and can be told to misbehave with $FAKE_FAIL:
//   put:N        the N-th put exits 1
//   corrupt-put  every put stores different bytes than it was given (one byte longer)
//   flip-put     every put stores different bytes of the SAME length (the last byte changed)
//   get-auth     every get fails with an authentication error
// It prints the error texts the real Wrangler printed for a missing key and a missing bucket.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const dir = process.env.FAKE_R2_DIR;
const buckets = (process.env.FAKE_BUCKETS ?? '').split(',').filter(Boolean);
const fail = process.env.FAKE_FAIL ?? '';
if (process.env.FAKE_LOG) appendFileSync(process.env.FAKE_LOG, `${JSON.stringify(args)}\n`);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const store = (object) => join(dir, object.replaceAll('/', '__'));
const die = (code, text) => { process.stderr.write(`${text}\n`); process.exit(code); };

const [a, b, c] = args;
if (a === 'r2' && b === 'bucket' && c === 'info') {
  if (!buckets.includes(args[3])) die(1, '✘ [ERROR] A request to the Cloudflare API failed.\n  The specified bucket does not exist. [code: 10006]');
  process.exit(0);
}
if (a === 'r2' && b === 'object' && (c === 'get' || c === 'put')) {
  const local = args.includes('--local');
  const remote = args.includes('--remote');
  if (local === remote) die(3, 'fake: exactly one of --local and --remote is required');
  if (remote && args.includes('--persist-to')) die(3, 'fake: --persist-to with --remote');
  const object = args[3];
  mkdirSync(dir, { recursive: true });
  if (c === 'get') {
    if (fail === 'get-auth') die(1, '✘ [ERROR] Authentication error [code: 10000]');
    if (!existsSync(store(object))) die(1, '✘ [ERROR] The specified key does not exist.');
    copyFileSync(store(object), flag('--file'));
    process.exit(0);
  }
  const puts = existsSync(join(dir, '.puts')) ? Number(readFileSync(join(dir, '.puts'), 'utf8')) : 0;
  writeFileSync(join(dir, '.puts'), String(puts + 1));
  if (fail === `put:${puts + 1}`) die(1, '✘ [ERROR] Upload failed');
  const types = existsSync(join(dir, '.types.json')) ? JSON.parse(readFileSync(join(dir, '.types.json'), 'utf8')) : {};
  types[object] = flag('--content-type') ?? null;
  writeFileSync(join(dir, '.types.json'), JSON.stringify(types));
  if (fail === 'flip-put') { const b = readFileSync(flag('--file')); b[b.length - 1] ^= 0xff; writeFileSync(store(object), b); }
  else if (fail === 'corrupt-put') writeFileSync(store(object), Buffer.concat([readFileSync(flag('--file')), Buffer.from([0])]));
  else copyFileSync(flag('--file'), store(object));
  process.exit(0);
}
die(2, `fake wrangler: unsupported command: ${args.join(' ')}`);
