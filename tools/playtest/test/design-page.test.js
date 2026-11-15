// The lab serves the design system catalogue at /design/, so the look can be checked on a phone. The build copies only public files, and a rebuild
// of the lab leaves dist/puzzles (built by vite, see the README) alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './helpers.js';

const dist = resolve(root, 'dist');
const build = () => spawnSync(process.execPath, [resolve(root, 'build.mjs')], { cwd: root, encoding: 'utf8' });

test('the build puts the catalogue at /design/ with its tokens, elements, fonts and licences, and nothing else from design/', () => {
  const r = build();
  assert.equal(r.status, 0, r.stderr);
  const d = resolve(dist, 'design');
  const files = readdirSync(d).sort();
  assert.deepEqual(files, ['catalogue.mjs', 'elements.css', 'fonts', 'fonts.css', 'index.html', 'tokens.css', 'tokens.json']);
  assert.ok(readdirSync(resolve(d, 'fonts')).filter((n) => n.endsWith('.woff2')).length === 4);
  assert.ok(readdirSync(resolve(d, 'fonts')).some((n) => n.startsWith('OFL-')), 'the font licences go with the fonts');
  const html = readFileSync(resolve(d, 'index.html'), 'utf8');
  for (const link of ['/design/tokens.css', '/design/fonts.css', '/design/elements.css', '/design/catalogue.mjs']) assert.ok(html.includes(link), `${link} is where the page looks for it`);
  assert.equal(readFileSync(resolve(d, 'tokens.css'), 'utf8'), readFileSync(resolve(root, '..', '..', 'web/src/styles/tokens.css'), 'utf8'));
  assert.ok(!existsSync(resolve(d, 'README.md')) && !existsSync(resolve(d, 'catalogue.html')), 'no source notes are published');
});

test('a rebuild keeps dist/puzzles and removes anything else that is no longer built', () => {
  mkdirSync(resolve(dist, 'puzzles'), { recursive: true });
  writeFileSync(resolve(dist, 'puzzles', 'marker.txt'), 'keep');
  writeFileSync(resolve(dist, 'old-page.html'), 'stale');
  const had = existsSync(resolve(dist, 'puzzles', 'index.html'));
  assert.equal(build().status, 0);
  assert.equal(readFileSync(resolve(dist, 'puzzles', 'marker.txt'), 'utf8'), 'keep');
  assert.ok(!existsSync(resolve(dist, 'old-page.html')));
  rmSync(resolve(dist, 'puzzles', 'marker.txt'));
  if (!had) rmSync(resolve(dist, 'puzzles'), { recursive: true, force: true }); // it only existed for this test
});

test('the headers keep the lab private: no search indexing, nosniff, and a robots.txt that disallows everything', () => {
  build();
  const h = readFileSync(resolve(dist, '_headers'), 'utf8');
  assert.match(h, /X-Robots-Tag: noindex, nofollow/);
  assert.match(h, /X-Content-Type-Options: nosniff/);
  assert.match(readFileSync(resolve(dist, 'robots.txt'), 'utf8'), /Disallow: \//);
});
