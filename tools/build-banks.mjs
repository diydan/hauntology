#!/usr/bin/env node
// Generates the typed story banks in shared/src/voice/banks/ from the markdown in docs/story/.
// Usage: node tools/build-banks.mjs           write the files
//        node tools/build-banks.mjs --check   exit 1 if a file is out of date (writes nothing)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEAKER_BANK_TARGETS, parseLodgerLines, renderLodgerBankTs, renderSpeakerTarget } from './lib/story-banks.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const targets = [
  {
    source: join(root, 'docs/story/lodger-lines.md'),
    out: join(root, 'shared/src/voice/banks/lodger.ts'),
    render: (md) => renderLodgerBankTs(parseLodgerLines(md)),
  },
  ...SPEAKER_BANK_TARGETS.map((t) => ({ source: join(root, t.source), out: join(root, t.out), render: (md) => renderSpeakerTarget(t, md) })),
];

let stale = 0;
for (const t of targets) {
  const next = t.render(readFileSync(t.source, 'utf8'));
  const current = existsSync(t.out) ? readFileSync(t.out, 'utf8') : null;
  if (current === next) {
    console.log(`up to date  ${t.out.replace(root + '/', '')}`);
    continue;
  }
  if (check) {
    stale++;
    console.log(`OUT OF DATE ${t.out.replace(root + '/', '')} (run: node tools/build-banks.mjs)`);
  } else {
    mkdirSync(dirname(t.out), { recursive: true });
    writeFileSync(t.out, next);
    console.log(`wrote       ${t.out.replace(root + '/', '')}`);
  }
}
process.exit(stale > 0 ? 1 : 0);
