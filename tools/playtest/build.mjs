// Copies the public files into dist/ for deployment. Server code (src/), tests and docs stay out.
// Usage: node build.mjs        (PLAYTEST_DIST=/some/folder node build.mjs builds there instead, which the tests use so they do not rebuild dist/ under each other)
import { cpSync, rmSync, mkdirSync, readdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOT_LINE, WANDER, WANDER_SCENES } from './js/scenes.js';
import { LIPSYNC } from './js/lipsync-data.js';
import { planVoiceFiles } from './voice-files.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const dist = process.env.PLAYTEST_DIST ? resolve(process.env.PLAYTEST_DIST) : resolve(root, 'dist');
// dist/puzzles is built by vite from web/ (see the README) and is not made here, so a rebuild of the rest leaves it alone.
mkdirSync(dist, { recursive: true });
for (const name of readdirSync(dist)) if (name !== 'puzzles') rmSync(resolve(dist, name), { recursive: true, force: true });
for (const f of readdirSync(root).filter((n) => n.endsWith('.html'))) cpSync(resolve(root, f), resolve(dist, f));
cpSync(resolve(root, 'css'), resolve(dist, 'css'), { recursive: true });
cpSync(resolve(root, 'js'), resolve(dist, 'js'), { recursive: true });
cpSync(resolve(root, 'art'), resolve(dist, 'art'), { recursive: true });
cpSync(resolve(root, 'models'), resolve(dist, 'models'), { recursive: true });
// The print-kit viewer (tools/prop-mockups/viewer.html) at /print/: it finds the STL files in stl/ and reference/ next to it.
mkdirSync(resolve(dist, 'print'), { recursive: true });
cpSync(resolve(root, '..', 'prop-mockups', 'viewer.html'), resolve(dist, 'print', 'index.html'));
cpSync(resolve(root, '..', '..', 'print', 'stl'), resolve(dist, 'print', 'stl'), { recursive: true });
cpSync(resolve(root, '..', '..', 'print', 'reference'), resolve(dist, 'print', 'reference'), { recursive: true });
// Public-domain footage (see media/PROVENANCE.md): only the clip files go out, not the provenance note.
mkdirSync(resolve(dist, 'media'), { recursive: true });
for (const f of readdirSync(resolve(root, 'media')).filter((n) => /\.(mp4|webm|jpg)$/.test(n))) cpSync(resolve(root, 'media', f), resolve(dist, 'media', f));
// Our own two sounds for the Reel (puzzles Requirement 20.6) come from the game's own folder, so there is one copy to credit and to check.
// They go in media/ so the Worker's range handler (src/route.js) serves them too: Safari asks for audio in ranges as well.
for (const name of ['knock', 'scrape', 'creak']) cpSync(resolve(root, '..', '..', 'web', 'public', 'sounds', `${name}.m4a`), resolve(dist, 'media', `${name}.m4a`));
// The narration of the scene lines (the Whisper's and the Keeper's Library audio) and the lip-synced talking clips, for the footage page's Voice switch and section 8.
// Both come from folders that are not in git (.voice-library, docs/story/art/clips). When a folder is not there, nothing is copied and the page falls back to the words
// (the Voice switch finds no file; the lip-sync section says its clips are not on this build).
{
  const repoRoot = resolve(root, '..', '..');
  const libDir = process.env.VOICE_LIBRARY_DIR ? resolve(process.env.VOICE_LIBRARY_DIR) : resolve(repoRoot, '.voice-library');
  const ids = [...Object.values(SHOT_LINE), ...Object.values(WANDER_SCENES).map((w) => w.line)].filter(Boolean).map((l) => l.id).concat(WANDER.revealId);
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, 'shared', 'fixtures', 'voice-library.json'), 'utf8'));
  const plan = planVoiceFiles(ids, manifest, (f) => existsSync(resolve(libDir, f)));
  for (const c of plan.copy) cpSync(resolve(libDir, c.from), resolve(dist, 'media', c.to));
  const clipDir = resolve(repoRoot, 'docs', 'story', 'art', 'clips');
  let clips = 0;
  for (const c of LIPSYNC) if (existsSync(resolve(clipDir, `${c.name}.mp4`))) { cpSync(resolve(clipDir, `${c.name}.mp4`), resolve(dist, 'media', `lip-${c.name}.mp4`)); clips += 1; }
  console.log(`narration: ${plan.copy.length} of ${plan.copy.length + plan.missing.length} lines copied${plan.missing.length ? ` (missing: ${plan.missing.join(', ')})` : ''}; lip-synced clips: ${clips} of ${LIPSYNC.length}`);
}
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
// Only the gallery page, the standalone mockup pages and the thumbnails they show, plus the 3D parts viewer and the STLs it reads
// (/props/viewer and /props/stl/). Not the 3D brief, the ideas list or the QR stickers.
const props = resolve(repo, 'tools', 'prop-mockups');
if (existsSync(resolve(props, 'index.html'))) {
  mkdirSync(resolve(dist, 'props', 'mockups'), { recursive: true });
  mkdirSync(resolve(dist, 'props', 'shots'), { recursive: true });
  cpSync(resolve(props, 'index.html'), resolve(dist, 'props', 'index.html'));
  for (const f of readdirSync(resolve(props, 'mockups')).filter((n) => n.endsWith('.html'))) cpSync(resolve(props, 'mockups', f), resolve(dist, 'props', 'mockups', f));
  for (const f of readdirSync(resolve(props, 'shots')).filter((n) => /^\d\d-.*\.png$/.test(n))) cpSync(resolve(props, 'shots', f), resolve(dist, 'props', 'shots', f));
  const stlSrc = resolve(repo, 'print', 'stl');
  if (existsSync(resolve(props, 'viewer.html')) && existsSync(stlSrc)) {
    mkdirSync(resolve(dist, 'props', 'stl'), { recursive: true });
    cpSync(resolve(props, 'viewer.html'), resolve(dist, 'props', 'viewer.html'));
    for (const f of readdirSync(stlSrc).filter((n) => n.endsWith('.stl'))) cpSync(resolve(stlSrc, f), resolve(dist, 'props', 'stl', f));
    if (existsSync(resolve(stlSrc, 'old'))) {
      mkdirSync(resolve(dist, 'props', 'stl', 'old'), { recursive: true });
      for (const f of readdirSync(resolve(stlSrc, 'old')).filter((n) => n.endsWith('.stl'))) cpSync(resolve(stlSrc, 'old', f), resolve(dist, 'props', 'stl', 'old', f));
    }
    // Reference models the viewer shows for comparison and that are not printed (print/reference/*.stl): /props/reference/.
    const refSrc = resolve(repo, 'print', 'reference');
    if (existsSync(refSrc)) {
      mkdirSync(resolve(dist, 'props', 'reference'), { recursive: true });
      for (const f of readdirSync(refSrc).filter((n) => n.endsWith('.stl'))) cpSync(resolve(refSrc, f), resolve(dist, 'props', 'reference', f));
    }
  }
}
// Character Creator (tools/character-builder/character-builder/): /character-builder/.
// Copy the static viewer, audio, and local git-ignored pack assets when present, never Mixamo animation GLBs (cannot be redistributed)
// or personal selfie-test photos under assets/faces/ (while keeping assets/mediapipe/selfie_multiclass_256x256.tflite).
const cbSrc = resolve(repo, 'tools', 'character-builder', 'character-builder');
if (existsSync(resolve(cbSrc, 'index.html'))) {
  const cbDest = resolve(dist, 'character-builder');
  mkdirSync(cbDest, { recursive: true });
  cpSync(resolve(cbSrc, 'index.html'), resolve(cbDest, 'index.html'));
  if (existsSync(resolve(cbSrc, 'media'))) cpSync(resolve(cbSrc, 'media'), resolve(cbDest, 'media'), { recursive: true });
  const cbAssetsEnv = process.env.CHARACTER_BUILDER_ASSETS;
  const cbAssets = cbAssetsEnv === 'none' ? '' : cbAssetsEnv ? resolve(cbAssetsEnv) : resolve(cbSrc, 'assets');
  if (cbAssets && existsSync(cbAssets)) {
    cpSync(cbAssets, resolve(cbDest, 'assets'), {
      recursive: true,
      filter: (src) => {
        const rel = relative(cbAssets, src).replaceAll('\\', '/');
        if (!rel) return true;
        const name = basename(rel);
        if (name === '.DS_Store' || name === '.local') return false;
        if (/^clips_.*\.glb$/i.test(name) && process.env.INCLUDE_MIXAMO_CLIPS !== '1') return false; // opt-in only: set INCLUDE_MIXAMO_CLIPS=1 to ship the animations to a test build
        if (/^faces\/selfie/i.test(rel)) return false;
        return true;
      },
    });
  }
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
