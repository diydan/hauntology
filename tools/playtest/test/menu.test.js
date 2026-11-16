// Tests for the mtest.hauntology.app main menu (index.js) and character-builder packaging in build.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { JSDOM, KINDS, install, root } from './helpers.js';

const EXPECTED_TOOLS = [
  'character-builder/',
  'ar.html',
  'design/',
  'footage.html',
  'props/viewer.html',
  'props/',
  'puzzles/',
  'controller/',
  'lab.html',
  'check.html',
  'knock.html',
];

test('main menu renders links to character creator, 3D parts viewer, test scenes, demos, lab and all 11 puzzles', { skip: !JSDOM && 'jsdom not installed' }, async () => {
  const dom = install('index');
  try {
    await import(`../js/index.js?t=${Date.now()}`);
    const hrefs = [...document.querySelectorAll('#app .cards a')].map((a) => a.getAttribute('href'));
    for (const target of EXPECTED_TOOLS) assert.ok(hrefs.includes(target), `missing tool link ${target}`);
    for (const kind of KINDS) assert.ok(hrefs.includes(`${kind}.html`), `missing puzzle link ${kind}.html`);
    const navHrefs = [...document.querySelectorAll('#app nav a')].map((a) => a.getAttribute('href'));
    assert.ok(navHrefs.length >= 5, 'section quick-jump links rendered');
    for (const h of navHrefs) assert.ok(document.querySelector(h), `section anchor ${h} exists`);
  } finally {
    dom.window.close();
  }
});

test('build.mjs bundles /character-builder/ without Mixamo clips or faces/selfie* and every built menu route has a target', () => {
  const scratch = mkdtempSync(resolve(tmpdir(), 'playtest-menu-'));
  const dist = resolve(scratch, 'dist');
  const assets = resolve(scratch, 'cb-assets');
  try {
    mkdirSync(resolve(assets, 'faces'), { recursive: true });
    mkdirSync(resolve(assets, 'mediapipe'), { recursive: true });
    mkdirSync(resolve(assets, '.local'), { recursive: true });
    writeFileSync(resolve(assets, 'manifest.json'), '{}');
    writeFileSync(resolve(assets, 'clips_M.glb'), 'mixamo-m');
    writeFileSync(resolve(assets, 'clips_F.glb'), 'mixamo-f');
    writeFileSync(resolve(assets, 'faces', 'cast-whisper.jpg'), 'cast');
    writeFileSync(resolve(assets, 'faces', 'selfie-test.jpg'), 'private-jpg');
    writeFileSync(resolve(assets, 'faces', 'selfie-test.png'), 'private-png');
    writeFileSync(resolve(assets, 'mediapipe', 'selfie_multiclass_256x256.tflite'), 'tflite');
    writeFileSync(resolve(assets, '.local', 'tmp.txt'), 'local');
    writeFileSync(resolve(assets, '.DS_Store'), 'ds');

    const r = spawnSync(process.execPath, [resolve(root, 'build.mjs')], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PLAYTEST_DIST: dist, CHARACTER_BUILDER_ASSETS: assets },
    });
    assert.equal(r.status, 0, r.stderr);

    assert.ok(existsSync(resolve(dist, 'character-builder', 'index.html')), 'character-builder/index.html built');
    assert.ok(existsSync(resolve(dist, 'character-builder', 'media', 'dark-title.mp3')), 'character-builder/media/dark-title.mp3 built');
    assert.ok(existsSync(resolve(dist, 'character-builder', 'assets', 'manifest.json')), 'manifest.json copied');
    assert.ok(existsSync(resolve(dist, 'character-builder', 'assets', 'faces', 'cast-whisper.jpg')), 'cast portrait copied');
    assert.ok(existsSync(resolve(dist, 'character-builder', 'assets', 'mediapipe', 'selfie_multiclass_256x256.tflite')), 'mediapipe tflite kept');

    assert.ok(!existsSync(resolve(dist, 'character-builder', 'assets', 'clips_M.glb')), 'Mixamo clips_M excluded');
    assert.ok(!existsSync(resolve(dist, 'character-builder', 'assets', 'clips_F.glb')), 'Mixamo clips_F excluded');
    assert.ok(!existsSync(resolve(dist, 'character-builder', 'assets', 'faces', 'selfie-test.jpg')), 'personal selfie jpg excluded');
    assert.ok(!existsSync(resolve(dist, 'character-builder', 'assets', 'faces', 'selfie-test.png')), 'personal selfie png excluded');
    assert.ok(!existsSync(resolve(dist, 'character-builder', 'assets', '.local')), '.local excluded');
    assert.ok(!existsSync(resolve(dist, 'character-builder', 'assets', '.DS_Store')), '.DS_Store excluded');

    const indexSrc = readFileSync(resolve(root, 'js', 'index.js'), 'utf8');
    for (const target of [...EXPECTED_TOOLS, ...KINDS.map((k) => `${k}.html`)]) {
      assert.ok(indexSrc.includes(`'${target}'`) || target.endsWith('.html'), `${target} wired`);
      if (target === 'puzzles/' || target === 'controller/') continue; // built by build-apps.mjs
      const builtPath = target.endsWith('/') ? resolve(dist, target, 'index.html') : resolve(dist, target);
      assert.ok(existsSync(builtPath), `built target exists for ${target}`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
