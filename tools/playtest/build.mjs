// Copies the public files into dist/ for deployment. Server code (src/), tests and docs stay out.
// Usage: node build.mjs
import { cpSync, rmSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const dist = resolve(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const f of readdirSync(root).filter((n) => n.endsWith('.html'))) cpSync(resolve(root, f), resolve(dist, f));
cpSync(resolve(root, 'css'), resolve(dist, 'css'), { recursive: true });
cpSync(resolve(root, 'js'), resolve(dist, 'js'), { recursive: true });
cpSync(resolve(root, 'art'), resolve(dist, 'art'), { recursive: true });
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
