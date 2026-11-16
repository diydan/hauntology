#!/usr/bin/env node
// Writes the generated design token files from design/tokens.json, or (--check) fails when they are out of date.
//   node tools/build-tokens.mjs            write web/src/styles/tokens.css and shared/src/design/tokens.ts
//   node tools/build-tokens.mjs --check    exit 1 if a file differs, if the token file is unsound, or if a contrast rule fails
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastFailures, toCss, toTs, validate } from './lib/design-tokens.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = join(root, 'design', 'tokens.json');
export const OUTPUTS = { css: join(root, 'web', 'src', 'styles', 'tokens.css'), ts: join(root, 'shared', 'src', 'design', 'tokens.ts') };

const tokens = JSON.parse(readFileSync(SOURCE, 'utf8'));
const problems = [...validate(tokens)];
if (!problems.length) problems.push(...contrastFailures(tokens));
if (problems.length) { console.error(`design/tokens.json has ${problems.length} problem(s):`); for (const p of problems) console.error(` - ${p}`); process.exit(1); }

const wanted = { css: toCss(tokens), ts: toTs(tokens) };
const check = process.argv.includes('--check');
let stale = 0;
for (const [kind, path] of Object.entries(OUTPUTS)) {
  const have = existsSync(path) ? readFileSync(path, 'utf8') : null;
  const rel = relative(root, path);
  if (have === wanted[kind]) { console.log(`ok       ${rel}`); continue; }
  stale += 1;
  if (check) { console.error(`STALE    ${rel}: run \`pnpm build-tokens\``); continue; }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, wanted[kind]);
  console.log(`wrote    ${rel}`);
}
if (check && stale) process.exit(1);
