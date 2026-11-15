// Verification for the full 3D Spirit Table asset kit (`models/spirit-table.glb`), `js/ar-gltf.js` and `js/ar.js` wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as THREE from '../js/vendor/three.js';
import { parseGlb } from '../js/ar-gltf.js';
import { root } from './helpers.js';

const EXPECTED_MESHES = [
  // 1. Gothic Cutaway Dollhouse Chassis (with front line-up sockets & side Relic curio shelf)
  'dollhouse_chassis',
  // 2. Six Canonical Sculpted Relics + Relic Token Plinth
  'relic_token',
  'relic_music_box',
  'relic_wax_hand',
  'relic_locket',
  'relic_planchette',
  'relic_silver_key',
  'relic_bell',
  // 3. Whisper 3D Draped Shroud & Nursery Cold Spot Frost
  'whisper_shroud',
  'cold_spot_frost',
  // 4. Turned Suspect Plinth, Living & Poltergeist Player Pawns & Brass Turn Ring
  'suspect_plinth',
  'pawn_living',
  'pawn_poltergeist',
  'pawn_turn_ring',
  // 5. Séance Hatpins & Inspected Brass Magnifying Lens
  'mark_hatpin',
  'inspected_lens',
  // 6. Six Sculpted Room Furniture Vignettes + Animatable Rocking Horse & Clock Pendulum
  'room_library',
  'room_study',
  'room_nursery',
  'nursery_horse',
  'room_kitchen',
  'room_hall',
  'hall_pendulum',
  'room_cellar',
  // 7. Four Floating 3D Spirit Clue Frames
  'clue_shard',
  'clue_plate',
  'clue_slip',
  'clue_calendar',
];

const read = (f) => readFileSync(resolve(root, f), 'utf8');

test('models/spirit-table.glb parses cleanly with vendored three.js and contains all 28 meshes across all 7 asset groups', () => {
  const glbPath = resolve(root, 'models/spirit-table.glb');
  assert.ok(existsSync(glbPath), 'models/spirit-table.glb exists');
  const raw = readFileSync(glbPath);
  assert.ok(raw.byteLength > 100_000 && raw.byteLength < 3_000_000, `sensible mobile binary size (${raw.byteLength} bytes)`);

  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const kit = parseGlb(ab, THREE);
  assert.equal(kit.gltf.asset.version, '2.0');
  assert.equal(kit.materials.length, 8, 'eight Hauntology PBR materials');

  for (const name of EXPECTED_MESHES) {
    assert.ok(kit.has(name), `kit includes mesh "${name}"`);
    const inst = kit.instantiate(name, true);
    assert.ok(inst instanceof THREE.Group, `${name} instantiates as a THREE.Group`);

    let meshCount = 0, triCount = 0;
    inst.traverse((obj) => {
      if (!obj.isMesh) return;
      meshCount++;
      assert.ok(obj.material instanceof THREE.MeshStandardMaterial, `${name} uses PBR MeshStandardMaterial`);
      const pos = obj.geometry.getAttribute('position');
      const nrm = obj.geometry.getAttribute('normal');
      const col = obj.geometry.getAttribute('color');
      const idx = obj.geometry.getIndex();
      assert.ok(pos && pos.count >= 3, `${name} has vertex positions`);
      assert.ok(nrm && nrm.count === pos.count, `${name} has matching vertex normals`);
      assert.ok(col && col.count === pos.count, `${name} has baked AO + linear RGBA vertex colors`);
      assert.ok(idx && idx.count >= 3 && idx.count % 3 === 0, `${name} has triangle indices`);

      for (let i = 0; i < pos.count; i++) {
        assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)), `${name} finite position`);
        const nl = Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
        assert.ok(Math.abs(nl - 1) < 0.05, `${name} unit normal (${nl})`);
      }
      for (let i = 0; i < idx.count; i++) {
        const vi = idx.array[i];
        assert.ok(vi >= 0 && vi < pos.count, `${name} index in bounds`);
      }
      triCount += idx.count / 3;
    });
    assert.ok(meshCount >= 1 && triCount >= 12, `${name} has non-trivial geometry (${triCount} tris)`);
  }
});

test('ar-gltf.js only uses THREE exports present in the trimmed vendor/three.js bundle', () => {
  const gltfJs = read('js/ar-gltf.js');
  const used = [...new Set([...gltfJs.matchAll(/THREE\.([A-Za-z0-9_]+)/g)].map((m) => m[1]))];
  const bundle = read('js/vendor/three.js');
  const exports = bundle.slice(bundle.lastIndexOf('export{'));
  const missing = used.filter((n) => !new RegExp(`as ${n}[,}]`).test(exports));
  assert.deepEqual(missing, []);
});

test('ar.js wires all seven 3D asset groups and halts ambient prop motion under prefers-reduced-motion', () => {
  const js = read('js/ar.js');
  assert.match(js, /import \{ loadGlb \} from '\.\/ar-gltf\.js'/);
  for (const token of [
    'dollhouse_chassis',
    'relic_token',
    'relic_music_box', 'relic_wax_hand', 'relic_locket', 'relic_planchette', 'relic_silver_key', 'relic_bell',
    'whisper_shroud', 'cold_spot_frost',
    'suspect_plinth', 'pawn_living', 'pawn_poltergeist', 'pawn_turn_ring',
    'mark_hatpin', 'inspected_lens',
    'nursery_horse', 'hall_pendulum',
    'clue_shard', 'clue_plate', 'clue_slip', 'clue_calendar',
  ]) {
    assert.ok(js.includes(token), `ar.js references 3D asset "${token}"`);
  }
  assert.match(js, /animProps\.horse\.rotation\.z = reduced \? 0/);
  assert.match(js, /animProps\.pendulum\.rotation\.z = reduced \? 0/);
});

test('build.mjs ships models/spirit-table.glb and serve.mjs declares model/gltf-binary', () => {
  assert.match(read('serve.mjs'), /'\.glb':\s*'model\/gltf-binary'/);
  const tmp = mkdtempSync(join(tmpdir(), 'hauntology-ar-dist-'));
  try {
    const r = spawnSync(process.execPath, [resolve(root, 'build.mjs')], {
      cwd: root,
      env: { ...process.env, PLAYTEST_DIST: tmp },
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(join(tmp, 'models', 'spirit-table.glb')), 'dist/models/spirit-table.glb is copied by build.mjs');
    assert.ok(existsSync(join(tmp, 'js', 'ar-gltf.js')), 'dist/js/ar-gltf.js is copied by build.mjs');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
