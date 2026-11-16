// The curtain's thread route (tools/lib/print-route.mjs): pure geometry, so these tests need no OpenSCAD.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GROOVE_FLOOR, POST_R, THREAD_R, ELASTIC_R, drumTurnDeg, loadLayout, routes, tangent } from "../lib/print-route.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const L = loadLayout(root);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const deg = (r) => (r * 180) / Math.PI;

test("the layout is read from the SCAD files, and is the one the README documents", () => {
  assert.equal(L.threadZ, 20.2);
  assert.deepEqual(L.drum, [67, 46]);
  assert.deepEqual(L.idler, [-66, 44.5]);
  assert.deepEqual(L.leftPost, [-73.45, 28.8]);
  assert.equal(L.rightPost[0], 74);
  assert.ok(Math.abs(L.rightPost[1] - 32.4) < 1e-9, `right post Y ${L.rightPost[1]}`); // hangs from the bar: print Y -10.9 -> stage Y 32.4
  assert.equal(L.centrePost[0], 0);
  assert.ok(Math.abs(L.centrePost[1] - 36.5) < 1e-9, `centre post Y ${L.centrePost[1]}`);
  assert.ok(Math.abs(L.z.eye - 19.9) < 1e-9 && Math.abs(L.z.groove1 - 18.6) < 1e-9 && Math.abs(L.z.groove2 - 21.8) < 1e-9);
});

test("a tangent line touches both circles square on, whichever way the circles are travelled", () => {
  const A = { c: [0, 0], r: 3 }, B = { c: [20, 10], r: 5 };
  for (const [sa, sb] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const t = tangent(A, sa, B, sb);
    assert.ok(Math.abs(dist(t.ta, A.c) - A.r) < 1e-9 && Math.abs(dist(t.tb, B.c) - B.r) < 1e-9, "tangent points lie on the circles");
    const along = [t.tb[0] - t.ta[0], t.tb[1] - t.ta[1]];
    assert.ok(Math.abs(along[0] * (t.ta[0] - A.c[0]) + along[1] * (t.ta[1] - A.c[1])) < 1e-6, "the line is square to A's radius");
    assert.ok(Math.abs(along[0] * (t.tb[0] - B.c[0]) + along[1] * (t.tb[1] - B.c[1])) < 1e-6, "and to B's radius");
    assert.ok(along[0] * t.u[0] + along[1] * t.u[1] > 0, "and runs the way the thread travels");
  }
});

test("opening the curtain takes in exactly the panels' 24 mm of each thread, which is under 180 degrees of servo turn", () => {
  const closed = routes(L, 26.2), open = routes(L, 50.2);
  assert.ok(Math.abs(closed.right.length - open.right.length - 24) < 1e-9);
  assert.ok(Math.abs(closed.left.length - open.left.length - 24) < 1e-9);
  assert.ok(drumTurnDeg(24) < 180, `${drumTurnDeg(24)} degrees`);
  // both threads leave the drum at their groove, and end on it
  assert.equal(open.right.zs.at(-1), L.z.groove1);
  assert.equal(open.left.zs.at(-1), L.z.groove2);
});

test("the wraps are the documented ones: right 93 post / 87 drum, left 100 post / 86 idler / 96 drum", () => {
  const r = routes(L, 26.2);
  const near = (got, want) => assert.ok(Math.abs(got - want) < 1, `${got} vs ${want}`);
  near(r.right.postDeg, 93); near(r.right.drumDeg, 87);
  near(r.left.postDeg, 100); near(r.left.idlerDeg, 86); near(r.left.drumDeg, 96);
});

test("every wrap lies on its circle and the route has no corner: a thread under tension cannot turn sharply in free air", () => {
  const r = routes(L, 38.2);
  const circles = { post: { c: L.rightPost, r: POST_R.right + THREAD_R }, drum: { c: L.drum, r: GROOVE_FLOOR.drum + THREAD_R } };
  // the right thread: from its post's bottom tangent point to the end, every point is on the post's circle or the drum's
  const pts = r.right.pts;
  let corner = 0;
  for (let i = 2; i < pts.length - 1; i++) {
    const onPost = Math.abs(dist(pts[i], circles.post.c) - circles.post.r) < 1e-6;
    const onDrum = Math.abs(dist(pts[i], circles.drum.c) - circles.drum.r) < 1e-6;
    assert.ok(onPost || onDrum, `point ${i} ${pts[i]} is on neither the post nor the drum`);
  }
  for (const k of ["right", "left", "elastic"]) {
    const p = r[k].pts;
    for (let i = 1; i < p.length - 1; i++) {
      const a = [p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]], b = [p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]];
      if (Math.hypot(...a) < 1e-9 || Math.hypot(...b) < 1e-9) continue;
      const turn = deg(Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b))))));
      corner = Math.max(corner, turn);
      // the eye (point 1) is the one place a thread starts straight and meets its first post square on
    }
    assert.ok(corner < 12, `${k}: a ${corner.toFixed(1)} degree corner`);
  }
});

test("the elastic stretches under 3x and pulls the panels closed at no worse than the angle the README states", () => {
  const closed = routes(L, 26.2).elastic, open = routes(L, 50.2).elastic;
  const stretch = open.length / closed.length;
  assert.ok(stretch > 2 && stretch < 3, `stretch ${stretch}`);
  const off = (r) => 180 - r.leaveDeg; // degrees off the rail, 0 = straight along it
  assert.ok(off(closed) < 66 && off(closed) > 64, `closed ${off(closed)}`); // 65
  assert.ok(off(open) < off(closed), "the pull straightens out as the panels open");
  assert.ok(ELASTIC_R > THREAD_R);
});

test("the left thread clears the centre post and the right panel's carriages along the top of the stage", () => {
  const left = routes(L, 26.2).left;
  // the run from the idler to the drum is the last stretch before the drum's arc: find where it crosses X = 0
  let y0 = null;
  for (let i = 1; i < left.pts.length; i++) {
    const [x0, ya] = left.pts[i - 1], [x1, yb] = left.pts[i];
    if (x0 < 0 && x1 >= 0 && Math.abs(x1 - x0) > 20) y0 = ya + ((yb - ya) * (0 - x0)) / (x1 - x0);
  }
  assert.ok(y0 !== null, "the run along the top crosses the middle");
  const postTop = L.centrePost[1] + POST_R.centre;
  assert.ok(y0 - postTop > 6, `thread ${y0.toFixed(2)} vs post top ${postTop}`);
  assert.ok(y0 > 34.4 + 2, "and stays above the carriages' top edge (Y = 34.4)");
});
