// Builds the two phone pages that vite makes from web/ into dist/: the puzzle page (dist/puzzles/, https://mtest.hauntology.app/puzzles/) and the
// Controller page (dist/controller/, /controller/, with a stand-in Room: the code K7M2 joins as the Master). They are the web app's own code, so
// any session that deploys the lab ships the current screens when it runs this first.
// Usage:  node build.mjs && node build-apps.mjs && wrangler deploy
// `node build.mjs` empties dist/ except puzzles/, so run this AFTER it. PLAYTEST_DIST=/some/folder builds there instead, like build.mjs.
import { createRequire } from 'node:module';
import { renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const web = resolve(root, '..', '..', 'web');
const dist = process.env.PLAYTEST_DIST ? resolve(process.env.PLAYTEST_DIST) : resolve(root, 'dist');
// vite's ESM entry, found from web/ (its node_modules): the CommonJS one that require.resolve gives has no `build`.
const viteDir = dirname(createRequire(resolve(web, 'package.json')).resolve('vite/package.json'));
const { build } = await import(pathToFileURL(resolve(viteDir, 'dist', 'node', 'index.js')).href);

const pages = [
  { html: 'puzzles-demo.html', base: '/puzzles/', out: 'puzzles' },
  { html: 'controller-demo.html', base: '/controller/', out: 'controller' },
];
for (const page of pages) {
  const outDir = resolve(dist, page.out);
  await build({ root: web, base: page.base, logLevel: 'warn', build: { outDir, emptyOutDir: true, rollupOptions: { input: resolve(web, page.html) } } });
  renameSync(resolve(outDir, page.html), resolve(outDir, 'index.html'));
  // vite copies web/public/ too: the lab does not need the demo files or the footage there.
  for (const d of ['demo', 'media']) rmSync(resolve(outDir, d), { recursive: true, force: true });
  console.log(`built ${page.html} into ${outDir}`);
}
