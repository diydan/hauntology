// The thread route of print prop #9 (the curtain reveal), worked out from the tangent lines between its posts, idler wheel and
// capstan drum, so the route can be drawn, measured and checked instead of described. Pure geometry: no OpenSCAD and no file reads
// except `loadLayout`, which takes its numbers from the SCAD files so this cannot drift from them.
//
// Stage coordinates, millimetres: X right, Y up, Z toward the viewer, the frame's back face on Z = 0. See print/README.md, Prop #9.
//
// The route (all threads lie in one plane, Z about 20):
//   right thread  the right panel's outer carriage, east along its eye line, round the RIGHT post (counter-clockwise), up to the drum
//   left thread   the left panel's outer carriage, west along its eye line, round the LEFT post (clockwise) and the IDLER wheel
//                 (clockwise), east along the top of the stage, down to the drum's bottom (counter-clockwise)
//   elastic       the right panel's inner carriage, over the north side of the CENTRE post, to the left panel's inner carriage
// The drum turning counter-clockwise takes in both threads (opening both panels); the elastic closes them again.
import fs from "node:fs";
import path from "node:path";

// ---- fixed by the printed parts (panel and rail files), not by the layout
const RAIL_Y = 31.5; // the rail bar's middle, stage Y (the socket's Y)
const TRACK_DY = 1.8; // the twin tracks sit this far each side of the rail's middle
const FIN_Y = 80.4; // the panel's guide fin, panel Y
const HOLE_Y = 77.5; // the panel's thread eye (the carriage's tie hole), panel Y
const EYE_OFF = 21; // a carriage's side face is this far from the panel's middle (16 to the carriage, 5 to its face)
const EYE_Z = 2.6; // the eye's height above the panel's back
const PANEL_ABOVE_RAIL = 5.2; // the panel's back sits this far below the rail bar's bottom
export const RIGHT_EYE_Y = RAIL_Y + TRACK_DY - FIN_Y + HOLE_Y; // the right panel hangs from the upper track: 30.4
export const LEFT_EYE_Y = RAIL_Y - TRACK_DY - FIN_Y + HOLE_Y; // the left panel from the lower track: 26.8
export const GROOVE_FLOOR = { drum: 7.8, idler: 6.2 }; // radius at the bottom of the grooves
export const POST_R = { right: 1.6, left: 1.6, centre: 1.5 }; // post radii (3.2, 3.2 and 3.0 mm posts)
export const THREAD_R = 0.4; // the check tube round the thread (a 0.8 mm tube; the real thread is thinner)
export const ELASTIC_R = 0.6; // and round the elastic (a 1.2 mm tube)
export const GROOVE_SPREAD = 1.6; // the drum's two groove floors sit this far each side of the thread plane
const ARC_STEP = (6 * Math.PI) / 180;

const num = (src, name) => {
  const m = src.match(new RegExp(`^\\s*${name}\\s*=\\s*(-?[\\d.]+)\\s*;`, "m"));
  if (!m) throw new Error(`print-route: ${name} not found`);
  return Number(m[1]);
};

/** Read the layout from print/scad: where the servo, idler, posts and rail sit. */
export function loadLayout(root) {
  const dir = path.join(root, "print", "scad");
  const frame = fs.readFileSync(path.join(dir, "prop-09-stage-frame.scad"), "utf8");
  const rail = fs.readFileSync(path.join(dir, "prop-09-rail-and-pulley.scad"), "utf8");
  const lp = frame.match(/left_post\s*=\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/);
  const pp = rail.match(/for\s*\(\s*pp\s*=\s*\[\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]\s*,\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]\s*\]\s*\)/);
  if (!lp || !pp) throw new Error("print-route: a post position was not found in the SCAD files");
  // the rail bar prints upside down against the stage: print Y = 21.5 - stage Y (the bar's middle is at print Y = -10)
  const stageY = (printY) => RAIL_Y + -10 - printY;
  const railZ0 = num(frame, "rail_z0");
  const threadZ = num(frame, "thread_z");
  return {
    threadZ,
    plateT: num(frame, "plate_t"),
    railZ0,
    drum: [num(frame, "servo_x"), num(frame, "servo_y")],
    idler: [num(frame, "idler_x"), num(frame, "idler_y")],
    leftPost: [Number(lp[1]), Number(lp[2])],
    rightPost: [Number(pp[1]), stageY(Number(pp[2]))],
    centrePost: [Number(pp[3]), stageY(Number(pp[4]))],
    z: { eye: railZ0 - PANEL_ABOVE_RAIL + EYE_Z, groove1: threadZ - GROOVE_SPREAD, groove2: threadZ + GROOVE_SPREAD, idler: threadZ },
  };
}

// ---- 2D geometry
const rot90 = (v) => [-v[1], v[0]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const ang = (v) => Math.atan2(v[1], v[0]);
const unit = (a) => [Math.cos(a), Math.sin(a)];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const TAU = 2 * Math.PI;

/**
 * The straight line the thread follows between circle A (travelled counter-clockwise when `sa` is +1, clockwise when -1) and circle
 * B (`sb`). Returns the two tangent points, the direction, and the angle of each tangent point round its own centre.
 */
export function tangent(A, sa, B, sb) {
  const d = sub(B.c, A.c);
  const k = sa / sb;
  const phi = ang(d);
  const cs = (A.r - k * B.r) / len(d);
  if (Math.abs(cs) > 1) throw new Error("print-route: the circles have no such tangent");
  for (const sgn of [1, -1]) {
    const th = phi + sgn * Math.acos(cs);
    const n = unit(th);
    const u = mul(rot90(n), sa);
    const ta = add(A.c, mul(n, A.r));
    const tb = add(B.c, mul(n, k * B.r));
    const dd = sub(tb, ta);
    if (dot(dd, u) > 0 && Math.abs(cross(dd, u)) < 1e-6) return { ta, tb, u, na: th, nb: th + (k < 0 ? Math.PI : 0) };
  }
  throw new Error("print-route: no tangent found");
}

/** The tangent from a point P to circle B travelled with sign `sb`. */
function fromPoint(P, B, sb) {
  const d = sub(P, B.c);
  if (len(d) <= B.r) throw new Error("print-route: the point is inside the circle");
  for (const sgn of [1, -1]) {
    const th = ang(d) + sgn * Math.acos(B.r / len(d));
    const n = unit(th);
    const t = add(B.c, mul(n, B.r));
    const u = mul(rot90(n), sb);
    if (dot(sub(t, P), u) > 0) return { t, u, n: th };
  }
  throw new Error("print-route: no tangent from the point");
}

/** The tangent from circle A (sign `sa`) to a point Q: the one from Q to A, travelled backwards. */
function toPoint(A, sa, Q) {
  const r = fromPoint(Q, A, -sa);
  return { t: r.t, u: mul(r.u, -1), n: r.n };
}

/** Points round circle C from angle a0 to a1, counter-clockwise when s is +1; and how many degrees that is. */
function arc(C, a0, a1, s) {
  let d = a1 - a0;
  if (s > 0) while (d < 0) d += TAU;
  else while (d > 0) d -= TAU;
  const n = Math.max(2, Math.ceil(Math.abs(d) / ARC_STEP));
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(add(C.c, mul(unit(a0 + (d * i) / n), C.r)));
  return { pts, deg: (Math.abs(d) * 180) / Math.PI };
}

const pathLength = (pts) => pts.reduce((s, p, i) => (i ? s + len(sub(p, pts[i - 1])) : 0), 0);

/**
 * The three routes with the right panel's middle at X = `xc` and the left panel's at -xc (xc = 26.2 closed to 50.2 open).
 * Each route is {pts: [[x, y]...], zs: [z...], length, ...wraps in degrees}. The thread's Z runs from the eye to its groove.
 */
export function routes(layout, xc) {
  const D = { c: layout.drum, r: GROOVE_FLOOR.drum + THREAD_R };
  const I = { c: layout.idler, r: GROOVE_FLOOR.idler + THREAD_R };
  const PR = { c: layout.rightPost, r: POST_R.right + THREAD_R };
  const PL = { c: layout.leftPost, r: POST_R.left + THREAD_R };
  const PC = { c: layout.centrePost, r: POST_R.centre + ELASTIC_R };
  const { eye, groove1, groove2, idler } = layout.z;
  const out = {};

  { // right thread: east face of the right panel's outer carriage -> east -> right post (CCW) -> drum (CCW), anchor hole's north exit
    const p0 = [xc + EYE_OFF, RIGHT_EYE_Y];
    const tg = tangent(PR, +1, D, +1);
    const onPost = arc(PR, -Math.PI / 2, tg.na, +1);
    const onDrum = arc(D, tg.nb, Math.PI / 2, +1);
    const pts = [p0, [PR.c[0], RIGHT_EYE_Y], ...onPost.pts, ...onDrum.pts];
    const iDrum = 2 + onPost.pts.length;
    const along = cumulative(pts);
    const zs = pts.map((_, i) => (i < iDrum ? eye + ((groove1 - eye) * along[i]) / along[iDrum] : groove1));
    out.right = { pts, zs, length: pathLength(pts), postDeg: onPost.deg, drumDeg: onDrum.deg, drumTangentDeg: deg(tg.nb) };
  }
  { // left thread: west face of the left panel's outer carriage -> west -> left post (CW) -> idler (CW) -> east along the top -> drum (CCW)
    const p0 = [-(xc + EYE_OFF), LEFT_EYE_Y];
    const t1 = tangent(PL, -1, I, -1);
    const onPost = arc(PL, -Math.PI / 2, t1.na, -1);
    const t2 = tangent(I, -1, D, +1);
    const onIdler = arc(I, t1.nb, t2.na, -1);
    const onDrum = arc(D, t2.nb, 0, +1); // anchor hole's east exit
    const pts = [p0, [PL.c[0], LEFT_EYE_Y], ...onPost.pts, ...onIdler.pts, ...onDrum.pts];
    const iIdler = 2 + onPost.pts.length;
    const iDrum = iIdler + onIdler.pts.length;
    const along = cumulative(pts);
    // eye -> the idler's groove height by the idler, level round it, then up to groove 2 along the run to the drum
    const zs = pts.map((_, i) => (i < iIdler ? eye + ((idler - eye) * along[i]) / along[iIdler] : i < iDrum ? idler : groove2));
    out.left = { pts, zs, length: pathLength(pts), postDeg: onPost.deg, idlerDeg: onIdler.deg, drumDeg: onDrum.deg, drumTangentDeg: deg(t2.nb) };
  }
  { // elastic: right panel's inner carriage -> over the centre post's north side (CCW) -> left panel's inner carriage
    const pr = [xc - EYE_OFF, RIGHT_EYE_Y];
    const pl = [-(xc - EYE_OFF), LEFT_EYE_Y];
    const f = fromPoint(pr, PC, +1);
    const g = toPoint(PC, +1, pl);
    const onPost = arc(PC, f.n, g.n, +1);
    const pts = [pr, f.t, ...onPost.pts, g.t, pl];
    out.elastic = { pts, zs: pts.map(() => eye), length: pathLength(pts), postDeg: onPost.deg,
      leaveDeg: deg(ang(sub(f.t, pr))) }; // direction it leaves the right inner carriage, degrees from +X (180 = straight to the centre)
  }
  return out;
}

const deg = (r) => (r * 180) / Math.PI;
function cumulative(pts) {
  let acc = 0;
  return pts.map((p, i) => (i ? (acc += len(sub(p, pts[i - 1]))) : 0));
}

/** The drum's turn, in degrees, that takes in `travelMm` of thread laid at the groove floor plus the thread's own radius. */
export const drumTurnDeg = (travelMm) => deg(travelMm / (GROOVE_FLOOR.drum + THREAD_R));

/**
 * OpenSCAD for the three routes as thin tubes, one module per route and position, named cord_<right|left|elastic>_<xc>
 * (the dot in xc becomes "p": cord_right_26p2). Each segment is a hull of two small spheres.
 */
export function routeScad(layout, positions) {
  const name = (k, xc) => `cord_${k}_${String(xc).replace(".", "p")}`;
  let scad = "";
  for (const xc of positions) {
    const r = routes(layout, xc);
    for (const k of ["right", "left", "elastic"]) {
      const rad = k === "elastic" ? ELASTIC_R : THREAD_R;
      scad += `module ${name(k, xc)}() {\n`;
      r[k].pts.forEach((p, i) => {
        if (!i) return;
        const q = r[k].pts[i - 1];
        scad += `  hull() { translate([${q[0].toFixed(3)}, ${q[1].toFixed(3)}, ${r[k].zs[i - 1].toFixed(3)}]) sphere(r = ${rad}, $fn = 6);` +
          ` translate([${p[0].toFixed(3)}, ${p[1].toFixed(3)}, ${r[k].zs[i].toFixed(3)}]) sphere(r = ${rad}, $fn = 6); }\n`;
      });
      scad += "}\n";
    }
  }
  return scad;
}
export const cordName = (k, xc) => `cord_${k}_${String(xc).replace(".", "p")}`;
