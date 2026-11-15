import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const script = readFileSync(resolve(root, 'build-apps.mjs'), 'utf8');
const readme = readFileSync(resolve(root, 'README.md'), 'utf8');

test('build-apps builds the puzzle page and the Controller page from web/, each under its own base, and names each one index.html', () => {
  assert.match(script, /html: 'puzzles-demo\.html', base: '\/puzzles\/', out: 'puzzles'/);
  assert.match(script, /html: 'controller-demo\.html', base: '\/controller\/', out: 'controller'/);
  assert.match(script, /renameSync\(resolve\(outDir, page\.html\), resolve\(outDir, 'index\.html'\)\)/);
  assert.match(script, /emptyOutDir: true/);
  for (const html of ['puzzles-demo.html', 'controller-demo.html']) assert.ok(existsSync(resolve(root, '..', '..', 'web', html)), `web/${html} exists`);
});

test('build.mjs keeps only puzzles/, so the apps are built after it, and the README says the order', () => {
  assert.match(readFileSync(resolve(root, 'build.mjs'), 'utf8'), /name !== 'puzzles'/);
  assert.match(script, /node build\.mjs && node build-apps\.mjs && wrangler deploy/);
  assert.match(readme, /node build\.mjs && node build-apps\.mjs && wrangler deploy/);
  assert.match(readme, /\/controller\//);
});
