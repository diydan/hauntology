// Copies the public files into dist/ for deployment. Server code (src/), tests and docs stay out.
// Usage: node build.mjs
import { cpSync, rmSync, mkdirSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const dist = resolve(root, 'dist');
// dist/puzzles is built by vite from web/ (see the README) and is not made here, so a rebuild of the rest leaves it alone.
mkdirSync(dist, { recursive: true });
for (const name of readdirSync(dist)) if (name !== 'puzzles') rmSync(resolve(dist, name), { recursive: true, force: true });
for (const f of readdirSync(root).filter((n) => n.endsWith('.html'))) cpSync(resolve(root, f), resolve(dist, f));
cpSync(resolve(root, 'css'), resolve(dist, 'css'), { recursive: true });
cpSync(resolve(root, 'js'), resolve(dist, 'js'), { recursive: true });
cpSync(resolve(root, 'art'), resolve(dist, 'art'), { recursive: true });
// The design system catalogue (every element and token of the look), for checking the look on a phone: /design/.
// Only public files: the catalogue page, its script, the tokens, the elements, the fonts and their licences.
const repo = resolve(root, '..', '..');
const design = resolve(dist, 'design');
mkdirSync(resolve(design, 'fonts'), { recursive: true });
cpSync(resolve(repo, 'design', 'catalogue.html'), resolve(design, 'index.html'));
for (const f of ['catalogue.mjs', 'elements.css', 'fonts.css', 'tokens.json']) cpSync(resolve(repo, 'design', f), resolve(design, f));
cpSync(resolve(repo, 'web', 'src', 'styles', 'tokens.css'), resolve(design, 'tokens.css'));
for (const f of readdirSync(resolve(repo, 'design', 'fonts')).filter((n) => /\.(woff2|txt)$/.test(n))) cpSync(resolve(repo, 'design', 'fonts', f), resolve(design, 'fonts', f));
// The prop mockups (drawings of ESP32 and servo props, for looking at on a phone): /props/.
// Only the gallery page, the standalone mockup pages and the thumbnails they show. Not the 3D brief, the ideas list or the QR stickers.
const props = resolve(repo, 'tools', 'prop-mockups');
if (existsSync(resolve(props, 'index.html'))) {
  mkdirSync(resolve(dist, 'props', 'mockups'), { recursive: true });
  mkdirSync(resolve(dist, 'props', 'shots'), { recursive: true });
  cpSync(resolve(props, 'index.html'), resolve(dist, 'props', 'index.html'));
  for (const f of readdirSync(resolve(props, 'mockups')).filter((n) => n.endsWith('.html'))) cpSync(resolve(props, 'mockups', f), resolve(dist, 'props', 'mockups', f));
  for (const f of readdirSync(resolve(props, 'shots')).filter((n) => /^\d\d-.*\.png$/.test(n))) cpSync(resolve(props, 'shots', f), resolve(dist, 'props', 'shots', f));
}
writeFileSync(resolve(dist, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
writeFileSync(resolve(dist, '_headers'), [
  '/*',
  '  Cache-Control: no-store',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: no-referrer',
  '  X-Robots-Tag: noindex, nofollow',
  '  Permissions-Policy: camera=(self), geolocation=(), payment=(), microphone=(self), accelerometer=(self), gyroscope=(self)',
  '',
].join('\n'));
console.log(`built ${readdirSync(dist).length} entries into dist/`);
