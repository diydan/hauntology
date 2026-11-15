// The support-free check (tools/lib/stl-overhang.mjs): which downward faces would need supports.
// Every case builds a small solid in memory, so each one can be reasoned about by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findOverhangs, OVERHANG_DEG, BRIDGE_MAX_MM } from "../lib/stl-overhang.mjs";

/** A rectangular frustum from (w0 x d0 at z0) to (w1 x d1 at z1), centred on (cx, cy): 12 outward-facing triangles. */
function frustum(cx, cy, z0, z1, w0, d0, w1, d1) {
  const ring = (z, w, d) => [[cx - w / 2, cy - d / 2, z], [cx + w / 2, cy - d / 2, z], [cx + w / 2, cy + d / 2, z], [cx - w / 2, cy + d / 2, z]];
  const b = ring(z0, w0, d0), t = ring(z1, w1, d1), tris = [];
  tris.push([b[0], b[2], b[1]], [b[0], b[3], b[2]]); // bottom, facing down
  tris.push([t[0], t[1], t[2]], [t[0], t[2], t[3]]); // top, facing up
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    tris.push([b[i], b[j], t[j]], [b[i], t[j], t[i]]);
  }
  return tris;
}
const box = (cx, cy, z0, z1, w, d) => frustum(cx, cy, z0, z1, w, d, w, d);

function stl(tris) {
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.writeUInt32LE(tris.length, 80);
  tris.forEach((tri, i) => tri.forEach((v, j) => v.forEach((x, k) => buf.writeFloatLE(x, 84 + i * 50 + 12 + j * 12 + k * 4))));
  return buf;
}

/** A slab on four short legs: its underside is a flat roof of the slab's size. */
const table = (w, d) => [
  ...box(0, 0, 10, 12, w, d),
  ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([sx, sy]) => box(sx * (w / 2 - 2.5), sy * (d / 2 - 2.5), 0, 10, 5, 5)),
];

test("a plain block on the bed has no overhang", () => {
  assert.deepEqual(findOverhangs(stl(box(0, 0, 0, 20, 30, 30))), []);
});

test("a wide flat roof is found, and its span is the span of the roof", () => {
  const found = findOverhangs(stl(table(40, 40)));
  assert.equal(found.length, 1);
  const o = found[0];
  assert.ok(o.widthMm > 30 && o.widthMm <= 41, `span ${o.widthMm}`);
  assert.ok(Math.abs(o.zMm - 10) < 0.01);
  assert.ok(o.areaMm2 > 1000);
});

test("a flat roof narrower than the bridge limit is fine, however long", () => {
  assert.deepEqual(findOverhangs(stl(table(60, BRIDGE_MAX_MM - 3))), []);
  assert.equal(findOverhangs(stl(table(60, BRIDGE_MAX_MM + 6))).length, 1);
});

test("a 45 degree slope under a wide part is fine; 63 degrees is not", () => {
  // bottom 10 x 10, top 30 x 30 over 10 mm: 10 mm out for 10 mm up = 45 degrees from vertical
  assert.deepEqual(findOverhangs(stl(frustum(0, 0, 0, 10, 10, 10, 30, 30))), []);
  // top 50 x 50 over 10 mm: 20 mm out for 10 mm up = 63 degrees
  const steep = findOverhangs(stl(frustum(0, 0, 0, 10, 10, 10, 50, 50)));
  assert.equal(steep.length, 1);
  assert.ok(steep[0].widthMm > BRIDGE_MAX_MM, `span ${steep[0].widthMm}`);
});

test("the limit sits at 50.5 degrees: a 49 degree slope passes, a 52 degree slope fails", () => {
  const rise = 10, out = (deg) => rise * Math.tan((deg * Math.PI) / 180);
  const slope = (deg) => frustum(0, 0, 0, rise, 10, 10, 10 + 2 * out(deg), 10 + 2 * out(deg));
  assert.deepEqual(findOverhangs(stl(slope(49))), []);
  assert.equal(findOverhangs(stl(slope(52))).length, 1);
});

test("two touching solids are not a roof: a face resting on another body is a seam, not an overhang", () => {
  assert.deepEqual(findOverhangs(stl([...box(0, 0, 0, 10, 40, 40), ...box(0, 0, 10, 20, 40, 40)])), []);
  // lift the upper body 1 mm off the lower one and it really is a roof
  assert.equal(findOverhangs(stl([...box(0, 0, 0, 10, 40, 40), ...box(0, 0, 11, 21, 40, 40)])).length, 1);
});

test("the first-layer bevels at the bed are ignored", () => {
  // a 60 x 60 block whose bottom 0.5 mm flares out at 75 degrees: it touches the bed, so it is fine
  assert.deepEqual(findOverhangs(stl([...frustum(0, 0, 0, 0.5, 58, 58, 60, 60), ...box(0, 0, 0.5, 20, 60, 60)])), []);
});

test("a narrow strip set at 45 degrees is judged by its width, not by its bounding box", () => {
  const turn = (tris, deg) => tris.map((tri) => tri.map(([x, y, z]) => {
    const c = Math.cos((deg * Math.PI) / 180), n = Math.sin((deg * Math.PI) / 180);
    return [x * c - y * n, x * n + y * c, z];
  }));
  // a 60 x 5 mm slab turned 45 degrees: the bounding box is about 46 x 46 mm, but it is only 5 mm wide, so it bridges
  assert.deepEqual(findOverhangs(stl(turn(table(60, 5), 45))), []);
  // the same slab 25 mm wide is a real roof, turned or not
  assert.equal(findOverhangs(stl(turn(table(60, 25), 45))).length, 1);
});

test("a hair of rounding between touching bodies (0.01 mm) is still a seam", () => {
  assert.deepEqual(findOverhangs(stl([...box(0, 0, 0, 10, 40, 40), ...box(0, 0, 10.01, 20, 40, 40)])), []);
});

test("every part in the print kit is checked against the real files", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const dir = new URL("../../print/stl/", import.meta.url).pathname;
  if (!fs.existsSync(dir)) return;
  const flagged = fs.readdirSync(dir).filter((f) => f.endsWith(".stl")).filter((f) => findOverhangs(fs.readFileSync(path.join(dir, f))).length > 0);
  assert.deepEqual(flagged, ["prop-03-dial-plate.stl"]); // the one part whose README row says "Supports needed"
});
