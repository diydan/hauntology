// The assembly collision checks (tools/lib/print-assembly.mjs). The check tables and the volume reader need no OpenSCAD; one test
// that uses it is skipped when OpenSCAD is not installed.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EPS_MM3, PROPS, binaryStlVolume, buildChecks, findOpenscad, runChecks } from "../lib/print-assembly.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** A binary STL of an axis-aligned box. */
function boxStl([x0, y0, z0], [x1, y1, z1]) {
  const v = [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
  const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]]; // outward-facing
  const buf = Buffer.alloc(84 + f.length * 50);
  buf.writeUInt32LE(f.length, 80);
  f.forEach((t, i) => t.forEach((vi, j) => v[vi].forEach((x, k) => buf.writeFloatLE(x, 84 + i * 50 + 12 + j * 12 + k * 4))));
  return buf;
}

test("the volume reader measures a box, and sums two", () => {
  assert.ok(Math.abs(binaryStlVolume(boxStl([0, 0, 0], [10, 20, 5])) - 1000) < 1e-3);
  assert.equal(binaryStlVolume(Buffer.alloc(10)), 0);
  assert.throws(() => binaryStlVolume(Buffer.concat([Buffer.alloc(80), Buffer.from([5, 0, 0, 0])])), /truncated/);
});

test("every prop has checks, ids are unique, and every check can fail: each prop has controls that must collide", () => {
  const all = buildChecks(root);
  assert.equal(new Set(all.map((c) => c.id)).size, all.length, "duplicate check id");
  for (const p of PROPS) {
    const mine = all.filter((c) => c.prop === p);
    assert.ok(mine.filter((c) => c.expect === "clear").length >= 5, `${p}: too few clear checks`);
    assert.ok(mine.filter((c) => c.expect === "collide").length >= 1, `${p}: no controls, so nothing shows its poses are right`);
    for (const c of mine) assert.ok(c.id.startsWith(`${p}/`) && c.a.trim() && c.b.trim() && c.lib.includes("import"), c.id);
  }
});

test("the curtain checks cover every part and the thread at the closed, half-open and open positions", () => {
  const ids = buildChecks(root, ["p09"]).map((c) => c.id);
  for (const x of [26.2, 32, 38.2, 44, 48.5, 50.2]) for (const n of ["panelR", "panelL", "panels", "bar-panelR", "bar-panelL"]) assert.ok(ids.includes(`p09/${n}-${x}`), `${n}-${x}`);
  for (const x of [26.2, 38.2, 50.2]) for (const k of ["right", "left", "elastic"]) assert.ok(ids.includes(`p09/${k}-${x}`), `${k}-${x}`);
  for (const n of ["servo-frame", "drum-frame", "drum-bar", "wheel-bar", "bar-frame", "horn-drum"]) assert.ok(ids.includes(`p09/${n}`), n);
});

test("runChecks tells an overlap from a clear fit, and a control from a clear check (needs OpenSCAD)", { skip: !findOpenscad() }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "print-assembly-test-"));
  try {
    fs.writeFileSync(path.join(dir, "a.stl"), boxStl([0, 0, 0], [10, 10, 10]));
    const lib = 'module a(dx = 0) { translate([dx, 0, 0]) import(str(S, "a.stl")); }';
    const mk = (id, b, expect) => ({ id, prop: "px", lib, a: "a();", b, expect, note: "" });
    const res = await runChecks(
      [mk("half", "a(5);", "collide"), mk("apart", "a(11);", "clear"), mk("touching", "a(10);", "clear"), mk("wrong-control", "a(11);", "collide"), mk("wrong-clear", "a(5);", "clear"),
        mk("sliver", "a(9.996);", "clear"), mk("thin", "a(9.99);", "clear"), mk("thick", "a(9);", "clear")],
      { openscad: findOpenscad(), stlDir: dir, jobs: 2 },
    );
    const by = Object.fromEntries(res.map((r) => [r.id, r]));
    assert.ok(Math.abs(by.half.volume - 500) < 1, `half overlap ${by.half.volume}`);
    assert.equal(by.apart.volume, 0);
    assert.ok(by.touching.volume < EPS_MM3, "faces touching is not an overlap");
    assert.deepEqual([by.half.ok, by.apart.ok, by.touching.ok], [true, true, true]);
    assert.deepEqual([by["wrong-control"].ok, by["wrong-clear"].ok], [false, false], "a control that does not collide, and a clear check that does, both fail");
    // the threshold sits between a 0.4 mm3 sliver (touching) and a 1 mm3 overlap (a collision), and a 100 mm3 overlap is plainly one
    assert.ok(by.sliver.volume > 0.2 && by.sliver.volume < EPS_MM3 && by.sliver.ok, `sliver ${by.sliver.volume}`);
    assert.ok(by.thin.volume > EPS_MM3 && by.thin.volume < 2 && !by.thin.ok, `thin ${by.thin.volume}`);
    assert.ok(Math.abs(by.thick.volume - 100) < 1 && !by.thick.ok);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
