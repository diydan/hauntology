// Assembly collision checks for the print kit: put the compiled STLs in the poses they take in the finished props, intersect pairs
// with OpenSCAD, and report how many mm3 overlap. `clear` checks must overlap nothing; `collide` checks are controls (a part moved
// on purpose) and must overlap something, which proves the clear checks can fail: a pose that is wrong shows up as a control that
// no longer collides.
//
// The poses are the designer's real assemblies, worked out from the SCAD files (hinge axes, servo seats, the curtain's thread plane).
// Servo and horn sizes are an SG90 from memory: body 22.8 x 12.2 x 22.5, ears 32.5 long at 16.0 above the case's bottom, 2.5 thick,
// round boss 11.8 across and 4.0 tall, spline 4.8 across and 3.5 tall. Measure your own servo.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { loadLayout, routeScad, cordName, RIGHT_EYE_Y, LEFT_EYE_Y } from "./print-route.mjs";

/** Overlap below this (mm3) counts as touching, not colliding: tangent contact leaves slivers of a fraction of a mm3. */
export const EPS_MM3 = 0.5;

/** Total volume (mm3) of a binary STL; an intersection that is empty has none. */
export function binaryStlVolume(buf) {
  if (buf.length < 84) return 0;
  const n = buf.readUInt32LE(80);
  if (buf.length < 84 + n * 50) throw new Error("print-assembly: truncated STL");
  let v6 = 0;
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    const f = (k) => buf.readFloatLE(o + k * 4);
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(f);
    v6 += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return Math.abs(v6 / 6);
}

export function findOpenscad() {
  for (const p of ["/opt/homebrew/bin/openscad", "/usr/local/bin/openscad", "openscad"]) {
    if (spawnSync(p, ["--version"], { stdio: "ignore" }).status === 0) return p;
  }
  return null;
}

const imp = (file) => `import(str(S, "${file}.stl"))`;

// ---------------------------------------------------------------- #1 ghost in the box (standalone or Master 3-in-1 Left Bay)
function lib01(cd, ch, lh, xg, yg, xl) {
  const lidZ = ch + 0.3 + lh;
  const hy = cd / 2 + 6.2;
  const hz = ch - 1.0;
  return `
module body() { ${imp("prop-01-chest-body")}; }
// lid turned right way up onto the chest: ${lidZ} puts the hinge axes together with 0.3 mm of rim clearance
module lid(dz = ${lidZ}) { translate([${xl}, 0, dz]) rotate([180, 0, 0]) ${imp("prop-01-chest-lid")}; }
// the same lid opened th degrees (negative) about the hinge axis at Y = +${hy}, Z = ${hz}
module lidopen(th) { translate([0, ${hy}, ${hz}]) rotate([th, 0, 0]) translate([0, -${hy}, -${hz}]) lid(); }
// servo shaft along -Y at X = ${xg - 48.5}, Z = 32; the lever sweeps in the XZ plane, th degrees up from level
module lever(a) { translate([${xg - 48.5}, ${yg - 11.0}, 32]) rotate([0, a, 0]) rotate([-90, 0, 0]) ${imp("prop-01-lever-arm")}; }
module ghost(zo) { translate([${xg}, ${yg + 1.0}, zo]) rotate([90, 0, 0]) ${imp("prop-01-ghost-figure")}; }
`;
}
function checks01(root) {
  const bSrc = fs.readFileSync(path.join(root, "print", "scad", "prop-01-chest-body.scad"), "utf8");
  const lSrc = fs.readFileSync(path.join(root, "print", "scad", "prop-01-chest-lid.scad"), "utf8");
  const optN = (s, k, def) => { const m = s.match(new RegExp(`^\\s*${k}\\s*=\\s*(-?[\\d.]+)\\s*;`, "m")); return m ? Number(m[1]) : def; };
  const cd = optN(bSrc, "chest_d", 90.0), ch = optN(bSrc, "chest_h", 70.0), lh = optN(lSrc, "lid_h", 20.0);
  const xg = optN(bSrc, "xg_01", 0.0), yg = optN(bSrc, "yg_01", 0.0), xl = optN(bSrc, "xl_01", 0.0);
  const lidZ = ch + 0.3 + lh;
  const lib = lib01(cd, ch, lh, xg, yg, xl);
  const c = [
    ["lid-body", "lid();", "body();", "clear", "the closed lid on the chest"],
    ["ghost-rest-body", "ghost(9.1);", "body();", "clear", "the ghost at rest"],
    ["ghost-rest-lid", "ghost(9.1);", "lid();", "clear", "the ghost under the closed lid"],
    ["ghost-lift-body", "ghost(39.1);", "body();", "clear", "the ghost lifted 30 mm"],
    ["lever-rest-ghost", "lever(18);", "ghost(9.1);", "clear", "the lever at its lowest, round the ghost's pin"],
  ];
  for (const [name, a, th] of [["m18", 18, -18], ["m10", 10, -10], ["0", 0, 0], ["20", -20, 20], ["45", -45, 45]]) c.push([`lever-${name}-body`, `lever(${a});`, "body();", "clear", `the lever ${th} degrees from level`]);
  // The lever's nose pushes the lid ramp; the ghost's pin sits 48.5 mm from the servo shaft, so the fork angle sets both: ghost Z = 32 + 48.5 tan(a) - 7.5.
  // Rest (a = -18): lid shut. a = 0: ghost 24.5, lid at 20. a = 15: ghost 37.5, lid at 30. a = 22: ghost 44.1 (full 35 mm lift), lid at 30.
  for (const [a, th] of [[0, -20], [15, -30], [22, -30]]) c.push([`lever-${a}-lid-${-th}`, `lever(${-a});`, `lidopen(${th});`, "clear", `the lever at ${a} degrees up with the lid pushed open ${-th} degrees`]);
  c.push(["control-lever-15-lid-20", "lever(-15);", "lidopen(-20);", "collide", "control: the lid only 20 degrees open at 15 degrees of lever, so the nose would be inside it"]);
  for (const [lift, th] of [[24.5, -20], [37.5, -30], [44.1, -30]]) c.push([`ghost-${lift}-lid-${-th}`, `ghost(${lift});`, `lidopen(${th});`, "clear", `the ghost lifted to Z = ${lift} under the lid pushed open ${-th} degrees`]);
  for (const [a, lift] of [[0, 24.5], [15, 37.5], [22, 44.1]]) c.push([`lever-${a}-ghost-${lift}`, `lever(${-a});`, `ghost(${lift});`, "clear", `the lever at ${a} degrees with the ghost it has lifted to Z = ${lift}`]);
  c.push(["control-ghost-lift-lid-closed", "ghost(34.1);", "lid();", "collide", "control: the ghost lifted with the lid still shut"]);
  c.push(["control-lid-low", `lid(${(lidZ - 2.3).toFixed(1)});`, "body();", "collide", "control: the lid 2.3 mm too low"]);
  return c.map(([id, a, b, expect, note]) => ({ id: `p01/${id}`, prop: "p01", lib, a, b, expect, note }));
}

// ---------------------------------------------------------------- #3 Haunt needle
const lib03 = (plateH) => `
PH = ${plateH};
module plate() { ${imp("prop-03-dial-plate")}; }
module bezel(z = PH) { translate([0, 0, z]) ${imp("prop-03-bezel-ring")}; }
module needle(a) { translate([0, 0, PH]) rotate([0, 0, a]) ${imp("prop-03-needle")}; }
module maxtab(ang, r0 = 98.0, z0 = 14.4) { rotate([0, 0, ang]) translate([r0, 0, z0]) rotate([0, -90, 0]) ${imp("prop-03-max-tab")}; }
`;
function checks03(root) {
  const src = fs.readFileSync(path.join(root, "print", "scad", "prop-03-dial-plate.scad"), "utf8");
  const plateH = Number(src.match(/^\s*plate_h\s*=\s*(-?[\d.]+)\s*;/m)[1]);
  const lib = lib03(plateH);
  const c = [["bezel-plate", "bezel();", "plate();", "clear", "the bezel ring on the dial plate"]];
  for (const a of [15, 40, 65, 90, 130, 165]) c.push([`needle-${a}-plate`, `needle(${a});`, "plate();", "clear", `the needle at ${a} degrees`], [`needle-${a}-bezel`, `needle(${a});`, "bezel();", "clear", `the needle at ${a} degrees, inside the bezel`]);
  for (const [lv, ang] of [[8, 65], [10, 40], [12, 15]]) {
    c.push([`maxtab-${lv}-plate`, `maxtab(${ang});`, "plate();", "clear", `MAX tab clipped at ${lv} against plate`],
      [`maxtab-${lv}-bezel`, `maxtab(${ang});`, "bezel();", "clear", `MAX tab clipped at ${lv} stepping over bezel`],
      [`maxtab-${lv}-needle`, `maxtab(${ang});`, `needle(${ang});`, "clear", `MAX tab clipped at ${lv} clearing needle`]);
  }
  c.push(["control-bezel-low", `bezel(${plateH - 4.4});`, "plate();", "collide", "control: the bezel sunk 4.4 mm into the plate"],
    ["control-maxtab-low", "maxtab(40, 98.0, 11.0);", "bezel();", "collide", "control: MAX tab 3.4 mm too low, hitting bezel"]);
  return c.map(([id, a, b, expect, note]) => ({ id: `p03/${id}`, prop: "p03", lib, a, b, expect, note }));
}

// ---------------------------------------------------------------- #5 flipper
const lib05 = `
module plinth(dx = 0) { translate([dx, 0, 0]) ${imp("prop-05-plinth-2seat")}; }
// a flap turned th degrees about its servo's axis (Z = 5 in the file), placed dx along
module pw(dx, th) { translate([dx, 0, 5]) rotate([0, th, 0]) translate([0, 0, -5]) ${imp("prop-05-flap-pawn")}; }
// a flap stood up on the plinth's centered SG90 boss (X = sx, Y = 3.0, stem bottom at Z = 47.2)
module pw_on_plinth(sx, th, zbot = 47.2) { translate([sx, 3.0, zbot + 13.3]) rotate([0, 0, th]) translate([0, 5.0, 0]) rotate([90, 0, 0]) ${imp("prop-05-flap-pawn")}; }
`;
function checks05() {
  const c = [
    ["plinth-pitch-100", "plinth();", "plinth(100);", "clear", "two plinths at the 100 mm pitch"],
    ["plinth-pitch-100.3", "plinth();", "plinth(100.3);", "clear", "and 0.3 mm apart"],
    ["plinth-three", "plinth();", "plinth(100); plinth(-100);", "clear", "three plinths in a row"],
    ["control-plinth-pitch-99.7", "plinth();", "plinth(99.7);", "collide", "control: 0.3 mm too close"],
    ["control-plinth-pitch-99", "plinth();", "plinth(99);", "collide", "control: 1 mm too close"],
  ];
  for (const a of [0, 60, 120, 180]) for (const b of [0, 90]) c.push([`flaps-${a}-${b}`, `pw(0, ${a});`, `pw(50, ${b});`, "clear", `neighbouring flaps at ${a} and ${b} degrees, 50 mm apart`]);
  for (const th of [0, 45, 90, 135, 180]) c.push([`flap-plinth-${th}`, `pw_on_plinth(-25, ${th});`, "plinth();", "clear", `seated flap at ${th} degrees clearing plinth`]);
  c.push(["control-flaps-30", "pw(0, 0);", "pw(30, 0);", "collide", "control: flaps 30 mm apart"],
    ["control-flap-sunk", "pw_on_plinth(-25, 0, 30.0);", "plinth();", "collide", "control: flap sunk into plinth"]);
  return c.map(([id, a, b, expect, note]) => ({ id: `p05/${id}`, prop: "p05", lib: lib05, a, b, expect, note }));
}

// ---------------------------------------------------------------- #9 curtain reveal
function lib09(L) {
  return `
THREAD = ${L.threadZ}; PLATE = ${L.plateT}; SX = ${L.drum[0]}; SY = ${L.drum[1]}; IX = ${L.idler[0]}; IY = ${L.idler[1]}; RZ = ${L.railZ0};
module frame() { ${imp("prop-09-stage-frame")}; }
// the screen bezel turned round, its front face at Z = 10, middle at Y = -6
module bezel() { translate([0, -6, 10]) rotate([0, 180, 0]) ${imp("prop-09-screen-bezel")}; }
module railpart() { ${imp("prop-09-rail-and-pulley")}; }
module bar0() { intersection() { railpart(); translate([-80, -26, -1]) cube([160, 21, 12]); } }
module wheel0() { intersection() { railpart(); translate([-34, 0, -1]) cube([20, 22, 12]); } }
module drum0() { intersection() { railpart(); translate([14, 0, -1]) cube([20, 22, 16]); } }
// the rail bar turned over: tracks toward the back, bottom on the socket floor at RZ; print Y = 21.5 - stage Y, print Z = RZ + 6 - stage Z
module bar(dz = 0) { multmatrix([[1,0,0,0],[0,-1,0,21.5],[0,0,-1,RZ+6+dz],[0,0,0,1]]) bar0(); }
module wheel(dz = 0, dy = 0) { translate([IX+24, IY-10+dy, THREAD-4.4+dz]) wheel0(); }
module drum(dz = 0, dy = 0, dx = 0) { translate([SX-24+dx, SY-10+dy, THREAD-8.75+dz]) drum0(); }
module panel0() { ${imp("prop-09-curtain-panel")}; }
// panels hang from the two tracks, back face 5.2 mm under the rail bar: right on the upper track, left on the lower
module panelR(x = 26.2, dz = 0) { translate([x, ${(RIGHT_EYE_Y - 77.5).toFixed(1)}, RZ-5.2+dz]) panel0(); }
module panelL(x = 26.2, dz = 0) { translate([-x, ${(LEFT_EYE_Y - 77.5).toFixed(1)}, RZ-5.2+dz]) panel0(); }
module servo(dy = 0, dz = 0) { translate([SX, SY-5.5+dy, PLATE-16.0+dz]) {
  translate([-6.1, -11.4, 0]) cube([12.2, 22.8, 22.5]);
  translate([-6.1, -16.25, 16.0]) cube([12.2, 32.5, 2.5]);
  translate([0, 5.5, 22.5]) cylinder(h = 4.0, d = 11.8);
  translate([0, 5.5, 26.5]) cylinder(h = 3.5, d = 4.8);
} }
// the servo horn trimmed to a 13 mm bar, on the boss top
module horn(dz = 0) { translate([SX, SY, PLATE-16.0+22.5+4.0+dz]) hull() { cylinder(h = 4.2, d = 7.2); for (s = [-1, 1]) translate([s*4.5, 0, 0]) cylinder(h = 4.2, d = 4.0); } }
`;
}
const POS09 = [26.2, 32, 38.2, 44, 48.5, 50.2]; // panel positions, closed to open
const THREAD_POS09 = [26.2, 38.2, 50.2];
function checks09(root) {
  const L = loadLayout(root);
  const fSrc = fs.readFileSync(path.join(root, "print", "scad", "prop-09-stage-frame.scad"), "utf8");
  const optN = (s, k) => { const m = s.match(new RegExp(`^\\s*${k}\\s*=\\s*(-?[\\d.]+)\\s*;`, "m")); return m ? Number(m[1]) : null; };
  const rbx = optN(fSrc, "rattle_bx"), rby = optN(fSrc, "rattle_by"), rafY = optN(fSrc, "rafter_y"), rafZ = optN(fSrc, "rafter_z");
  const hasRattle = rbx !== null && rby !== null;
  const rattleLib = hasRattle ? `
module rattle_servo(dy = 0, dz = 0) { translate([${rbx}, ${rby} + dy, PLATE - 16.0 + dz]) {
  translate([-11.4, -6.1, 0]) cube([22.8, 12.2, 22.5]);
  translate([-16.25, -6.1, 16.0]) cube([32.5, 12.2, 2.5]);
  translate([-5.5, 0, 22.5]) cylinder(h = 4.0, d = 11.8);
  translate([-5.5, 0, 26.5]) cylinder(h = 3.5, d = 4.8);
} }
module rattle_horn(th = 0) { translate([${rbx - 5.5}, ${rby}, PLATE - 16.0 + 26.5]) rotate([0, 0, th]) hull() { cylinder(h = 4.2, d = 7.2); translate([14.0, 0, 0]) cylinder(h = 4.2, d = 4.0); } }
module bats_branch0() { intersection() { ${imp("prop-12-bats-mobile")}; translate([-80, 8, -1]) cube([160, 30, 8]); } }
module bats_three0() { intersection() { ${imp("prop-12-bats-mobile")}; translate([-80, -25, -1]) cube([160, 32, 8]); } }
module hanging_bats(dz = 0) {
  translate([0, ${rafY - 28.8}, ${rafZ - 1.7} + dz]) bats_branch0();
  translate([0, ${rafY - 29.0}, ${rafZ - 1.3} + dz]) translate([0, -9, 0]) rotate([0, 0, 180]) translate([0, 9, 0]) bats_three0();
}
` : "";
  const lib = lib09(L) + routeScad(L, THREAD_POS09) + rattleLib;
  const ALL = "frame(); bezel(); bar(); wheel(); drum(); servo(); horn();";
  const c = [
    ["servo-frame", "servo();", "frame();"], ["servo-bezel", "servo();", "bezel();"], ["servo-drum", "servo();", "drum();"],
    ["horn-drum", "horn();", "drum();"], ["drum-frame", "drum();", "frame();"], ["drum-bezel", "drum();", "bezel();"],
    ["drum-bar", "drum();", "bar();"], ["drum-wheel", "drum();", "wheel();"], ["wheel-frame", "wheel();", "frame();"],
    ["wheel-bar", "wheel();", "bar();"], ["bar-frame", "bar();", "frame();"], ["bar-bezel", "bar();", "bezel();"],
    ["bar-servo", "bar();", "servo(); horn(); drum();"], ["wheel-bezel", "wheel();", "bezel();"], ["wheel-servo", "wheel();", "servo(); drum();"],
  ].map(([id, a, b]) => [id, a, b, "clear", "parts in the finished stage"]);
  if (hasRattle) {
    c.push(
      ["rattle-servo-frame", "rattle_servo();", ALL, "clear", "#12 rattle SG90 in upper belfry gable against stage & curtain hardware"],
      ["hanging-bats-stage", "hanging_bats();", `${ALL} panelR(26.2); panelL(26.2);`, "clear", "#12 branch & 3 bats suspended from front belfry rafter"],
    );
    for (const th of [-25, 0, 25]) c.push([`rattle-horn-${th < 0 ? "m" + -th : th}`, `rattle_horn(${th});`, `${ALL} ${cordName("left", 26.2)}();`, "clear", `#12 rattle horn at ${th} degrees clearing belfry & curtain top thread`]);
  }
  for (const x of POS09) {
    c.push([`panelR-${x}`, `panelR(${x});`, ALL, "clear", `right panel at X = ${x}`], [`panelL-${x}`, `panelL(${x});`, ALL, "clear", `left panel at X = -${x}`],
      [`panels-${x}`, `panelR(${x});`, `panelL(${x});`, "clear", `the two panels at +-${x}`],
      [`bar-panelR-${x}`, "bar();", `panelR(${x});`, "clear", "rail bar and its posts against the right panel"], [`bar-panelL-${x}`, "bar();", `panelL(${x});`, "clear", "rail bar and its posts against the left panel"]);
  }
  for (const x of THREAD_POS09) {
    const hold = `${ALL} panelR(${x}); panelL(${x});`;
    for (const k of ["right", "left", "elastic"]) c.push([`${k}-${x}`, `${cordName(k, x)}();`, hold, "clear", `${k} thread with the panels at +-${x}`]);
    c.push([`cross-right-left-${x}`, `${cordName("right", x)}();`, `${cordName("left", x)}();`, "clear", "the threads cross nowhere"],
      [`cross-right-elastic-${x}`, `${cordName("right", x)}();`, `${cordName("elastic", x)}();`, "clear", "the threads cross nowhere"],
      [`cross-left-elastic-${x}`, `${cordName("left", x)}();`, `${cordName("elastic", x)}();`, "clear", "the threads cross nowhere"]);
  }
  const ctl = [
    ["drum-low", "drum(-3);", "servo();", "drum 3 mm too low, onto the boss"], ["drum-high", "drum(14);", "frame();", "drum 14 mm too high, into the front taper"],
    ["drum-up", "drum(0, 8);", "frame();", "drum 8 mm toward the top wall"], ["servo-to-bezel", "servo();", "translate([12, 0, 0]) bezel();", "bezel 12 mm toward the servo"],
    ["servo-up", "servo(8, 0);", "frame();", "servo 8 mm toward the top wall"], ["panel-into-rail", "panelR(30, 3.5);", "bar();", "panel 3.5 mm into the rail bar"],
    ["panels-overlap", "panelR(25.5);", "panelL(25.5);", "panels 1.4 mm too close"], ["panel-past-wall", "panelR(56);", "frame();", "panel 6 mm too far open"],
    ["wheel-up", "wheel(0, 1.5);", "frame();", "idler wheel 1.5 mm toward the top wall"], ["bar-high", "bar(3);", "frame();", "rail bar 3 mm too high, into the front taper"],
    ["horn-high", "horn(1.2);", "drum();", "horn 1.2 mm up into the pocket's ceiling"],
    ["right-into-post", `translate([0, 3, 0]) ${cordName("right", 26.2)}();`, "bar();", "right thread moved onto its post"],
    ["left-into-post", `translate([0, 2.5, 0]) ${cordName("left", 26.2)}();`, "frame();", "left thread moved onto its post"],
    ["elastic-into-post", `translate([0, -3, 0]) ${cordName("elastic", 38.2)}();`, "bar();", "elastic moved onto the centre post"],
    ["left-top-onto-post", `translate([0, -8, 0]) ${cordName("left", 26.2)}();`, "bar();", "left thread's run along the top moved down onto the centre post"],
    ["right-onto-ridge", `translate([0, 0, 1.6]) ${cordName("right", 26.2)}();`, "drum();", "right thread lifted onto the drum's ridge"],
    ["left-into-wheel", `translate([0, 0, -2.5]) ${cordName("left", 26.2)}();`, "wheel();", "left thread dropped into the idler wheel"],
  ];
  if (hasRattle) {
    ctl.push(
      ["rattle-servo-up", "rattle_servo(10, 0);", "frame();", "#12 rattle SG90 shifted 10 mm into belfry roof"],
      ["bats-into-arch", "hanging_bats(-15);", "frame();", "#12 hanging bats shifted 15 mm back into proscenium valance"],
    );
  }
  for (const [id, a, b, note] of ctl) c.push([`control-${id}`, a, b, "collide", `control: ${note}`]);
  return c.map(([id, a, b, expect, note]) => ({ id: `p09/${id}`, prop: "p09", lib, a, b, expect, note }));
}

// ---------------------------------------------------------------- #15 relic vault
// The clasp file holds three pieces side by side on one plate: the escutcheon (left), the lid's hasp and the servo's latch arm. Their
// X positions are read from the SCAD (the pieces' top-level translates, in that order) so a re-layout of the plate cannot leave the
// poses stale; `piecesSeparate` checks that the cut-out boxes at X = SPLIT still divide the plate into its three pieces.
const CLASP_SPLITS = [0, 29];
function clasp15(root) {
  const src = fs.readFileSync(path.join(root, "print", "scad", "prop-15-vault-clasp.scad"), "utf8");
  const t = [...src.matchAll(/^ {2}translate\(\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*0\s*\]\)/gm)].map((m) => [Number(m[1]), Number(m[2])]);
  if (t.length < 3) throw new Error("print-assembly: the clasp's three pieces were not found in prop-15-vault-clasp.scad");
  return { plate: t[0], hasp: t[1], arm: t[2] };
}
/** True when no triangle of the STL crosses any of the X values: the pieces on the plate are cleanly apart. */
export function piecesSeparate(buf, xs) {
  const n = buf.readUInt32LE(80);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    const x = [buf.readFloatLE(o), buf.readFloatLE(o + 12), buf.readFloatLE(o + 24)];
    const lo = Math.min(...x), hi = Math.max(...x);
    if (xs.some((c) => lo < c && hi > c)) return false;
  }
  return true;
}
function lib15(C, vd, vh, vlh, { combined = false, xv = 0, xl = 0, lh01 = 20 } = {}) {
  const [s1, s2] = CLASP_SPLITS;
  const lidZ = vh + 0.3 + vlh;
  const hy = vd / 2 + (combined ? 6.2 : 5.6);
  const hz = vh - 1.0;
  const haspY = -(vd / 2 - 0.8);
  const haspZ = vh + 1.8;
  const plateY = -(vd / 2 - 1.2);
  const plateZ = vh - 14.0;
  const armY = -vd / 2 + 10.3;
  const armZ = vh - 5.5;
  const chestFile = combined ? "prop-01-chest-body" : "prop-15-vault-chest";
  const tokBlock = combined
    ? `module token_upright(i) { translate([${xv}, -34.8 + i * 9.8, 24.0]) rotate([-90, 0, 0]) ${imp("relic-token-pocket")}; }
module stored_tokens() { for (i = [0 : 5]) token_upright(i); }
module left_lid_closed() { translate([${xl}, 0, ${vh + 0.3 + lh01}]) rotate([180, 0, 0]) ${imp("prop-01-chest-lid")}; }
module p20_sock0() { translate([65.0, -9.25, 0]) intersection() { ${imp("prop-20-terminal-blocks")}; translate([-77, -3, -1]) cube([24, 24, 18]); } }
module p20_bezel0() { translate([-64.5, 9.25, 0]) intersection() { ${imp("prop-20-terminal-blocks")}; translate([51, -23, -1]) cube([27, 27, 10]); } }
module p20_plug0() { translate([48, 11, 0]) intersection() { ${imp("prop-20-plug-heads")}; translate([-60, -23, -1]) cube([24, 24, 28]); } }
module p20_set_bezel_on_back(dy = 0) { translate([64.5, ${vd / 2 + 3.6} + dy, 26.5]) rotate([90, 0, 0]) p20_bezel0(); }`
    : `module stored_relics() {
  translate([-42.0, 21.5, 2.0]) rotate([0, 0, 90]) { ${imp("relic-music-box")}; translate([0, 0, 34.4]) rotate([180, 0, 0]) ${imp("relic-music-box-lid")}; }
  translate([-43.0, -9.5, 2.0]) ${imp("relic-wax-hand")};
  translate([-42.0, -34.0, 2.0]) ${imp("relic-locket")};
  translate([0.0, 33.0, 19.7]) ${imp("relic-bell")};
  translate([0.0, 7.0, 19.7]) ${imp("relic-planchette")};
  translate([-2.0, -14.0, 19.7]) ${imp("relic-silver-key")};
}
module stored_tokens() { for (i = [0 : 5]) translate([42.0, 6.9 + i * 6.6, 24.0]) rotate([-90, 0, 0]) ${imp("relic-token-pocket")}; }`;
  return `
module chest() { ${imp(chestFile)}; }
module tray() { translate([0, 0, 22]) ${imp("prop-15-relic-tray")}; }
module lid_closed() { translate([${xv}, 0, ${lidZ}]) rotate([180, 0, 0]) ${imp("prop-15-vault-lid")}; }
module hasp() { intersection() { ${imp("prop-15-vault-clasp")}; translate([${s1}, -30, -1]) cube([${s2 - s1}, 60, 12]); } }
module arm() { intersection() { ${imp("prop-15-vault-clasp")}; translate([${s2}, -30, -1]) cube([60, 60, 12]); } }
module plate() { intersection() { ${imp("prop-15-vault-clasp")}; translate([-80, -30, -1]) cube([${80 + s1}, 60, 12]); } }
module hasp_in_slot(zoff = ${haspZ}, yc = ${haspY}) { translate([${xv - C.hasp[0]}, yc, zoff]) rotate([90, 0, 0]) translate([0, 0, -1.9]) hasp(); }
module plate_posed() { translate([${xv - C.plate[0]}, ${plateY}, ${plateZ}]) rotate([90, 0, 0]) plate(); }
module arm_at(px = ${xv}, py = ${armY}, zb = ${armZ}, th = 0) { translate([px, py, zb]) rotate([0, 0, 180 + th]) translate([${-C.arm[0]}, ${-C.arm[1]}, 0]) arm(); }
module lid_and_hasp(openDeg) { translate([0, ${hy}, ${hz}]) rotate([-openDeg, 0, 0]) translate([0, ${-hy}, ${-hz}]) { lid_closed(); hasp_in_slot(); } }
module token_in_tray(bx = 0, by = 23.5, dz = 25.5) { translate([bx, by, dz]) ${imp("relic-token-pocket")}; }
${tokBlock}
`;
}
function checks15(root) {
  const C = clasp15(root);
  const b01 = fs.readFileSync(path.join(root, "print", "scad", "prop-01-chest-body.scad"), "utf8");
  const l01 = fs.readFileSync(path.join(root, "print", "scad", "prop-01-chest-lid.scad"), "utf8");
  const cSrc = fs.readFileSync(path.join(root, "print", "scad", "prop-15-vault-chest.scad"), "utf8");
  const lSrc = fs.readFileSync(path.join(root, "print", "scad", "prop-15-vault-lid.scad"), "utf8");
  const optN = (s, k, def = null) => { const m = s.match(new RegExp(`^\\s*${k}\\s*=\\s*(-?[\\d.]+)\\s*;`, "m")); return m ? Number(m[1]) : def; };
  const xv = optN(b01, "xv_15", null);
  const combined = xv !== null;
  const vd = combined ? optN(b01, "chest_d") : optN(cSrc, "vault_d");
  const vh = combined ? optN(b01, "chest_h") : optN(cSrc, "vault_h");
  const vlh = optN(lSrc, "vlid_h");
  const xl = optN(b01, "xl_01", 0), lh01 = optN(l01, "lid_h", 20);
  const px = combined ? xv : 0;
  const armY = -vd / 2 + 10.3, armZ = vh - 5.5, haspZ = vh + 1.8;
  if (!piecesSeparate(fs.readFileSync(path.join(root, "print", "stl", "prop-15-vault-clasp.stl")), CLASP_SPLITS))
    throw new Error(`print-assembly: the clasp plate's pieces are no longer apart at X = ${CLASP_SPLITS.join(" and ")}; move CLASP_SPLITS`);
  const c = [
    ["lid-chest", "lid_closed();", "chest();", "clear", "the closed lid on the lockbox"],
    ["stored-tokens-box", "stored_tokens();", "chest(); lid_closed();", "clear", "all 6 QR Relic Tokens upright in 1..6 dispenser rack inside closed lockbox"],
    ["token-tray", "token_in_tray();", "tray();", "clear", "a Relic Token seated in the optional tray bay"],
    ["hasp-chest", "hasp_in_slot();", "chest();", "clear", "the hasp in the lid's slot"], ["hasp-lid", "hasp_in_slot();", "lid_closed();", "clear", "the hasp in the lid's slot"],
    ["hasp-plate", "hasp_in_slot();", "plate_posed();", "clear", "the hasp and the escutcheon"],
  ];
  if (combined) {
    c.push(
      ["twin-lids-closed", "lid_closed();", "left_lid_closed();", "clear", "left (#1) and right (#15) split lids side by side"],
      ["twin-lids-right-open-90", "lid_and_hasp(90);", "left_lid_closed();", "clear", "right lockbox lid open 90 degrees beside closed left ghost lid"],
      ["neighbor-tokens", "token_upright(0);", "token_upright(1);", "clear", "adjacent upright QR Relic Stands in slots 1 and 2"],
      ["p20-set-bezel-back", "p20_set_bezel_on_back(0.2);", "chest();", "clear", "#20 SET bezel seated on the +Y back wall"],
      ["p20-plug-in-sock", "p20_sock0();", "translate([0, 0, -16.5]) p20_plug0();", "clear", "#20 resistor plug nose seated in terminal socket shroud"],
      ["control-twin-lids-overlap", "translate([-2.0, 0, 0]) lid_closed();", "left_lid_closed();", "collide", "control: right split lid shifted 2 mm into left split lid"],
      ["control-p20-plug-deep", "p20_sock0();", "translate([0, 0, -14.0]) p20_plug0();", "collide", "control: #20 plug pushed 2.5 mm past socket shoulder"],
    );
  } else {
    c.push(["stored-relics-box", "stored_relics();", "chest(); lid_closed();", "clear", "all 6 Relics standing on keeper pegs inside closed lockbox"]);
  }
  for (const od of [2, 5, 15, 45, 90]) c.push([`lid-open-${od}`, `lid_and_hasp(${od});`, `chest(); plate_posed(); arm_at(${px}, ${armY}, ${armZ}, 95);`, "clear", `lockbox lid and hasp swung open ${od} degrees with latch open`]);
  for (const th of [0, 45, 90, 135, 180]) for (const [n, b] of [["chest", "chest();"], ["hasp", "hasp_in_slot();"], ["plate", "plate_posed();"], ["lid", "lid_closed();"]]) c.push([`arm-${th}-${n}`, `arm_at(${px}, ${armY}, ${armZ}, ${th});`, b, "clear", `the latch arm turned ${th} degrees, against the ${n}`]);
  c.push(["control-lid-low", `translate([0,0,-2.0]) lid_closed();`, "chest();", "collide", "control: lid 2 mm into chest rim"],
    ["control-arm-low", `arm_at(${px}, ${armY}, ${armZ - 18}, 0);`, "chest();", "collide", "control: latch arm 18 mm too low"],
    ["control-hasp-low", `hasp_in_slot(${haspZ - 5});`, "chest();", "collide", "control: hasp 5 mm too low"],
    ["control-latched-blocks-lid", "lid_and_hasp(2);", `arm_at(${px}, ${armY}, ${armZ}, 0);`, "collide", "control: latched arm (0 deg) blocks the lid from lifting"],
    ["control-token-low", "token_in_tray(0, 23.5, 23.0);", "tray();", "collide", "control: token 2.5 mm into tray floor"]);
  const lib = lib15(C, vd, vh, vlh, { combined, xv: px, xl, lh01 });
  return c.map(([id, a, b, expect, note]) => ({ id: `p15/${id}`, prop: "p15", lib, a, b, expect, note }));
}

export const PROPS = ["p01", "p03", "p05", "p09", "p15"];

/** Every check, as {id, prop, lib, a, b, expect, note}. */
export function buildChecks(root, only = PROPS) {
  const all = { p01: () => checks01(root), p03: () => checks03(root), p05: checks05, p09: () => checks09(root), p15: () => checks15(root) };
  return only.flatMap((p) => all[p]());
}

/** Run one check with OpenSCAD: resolves to {id, volume} in mm3. */
export function runOne(check, { openscad, stlDir, tmp }) {
  const base = path.join(tmp, check.id.replace(/[^A-Za-z0-9]+/g, "_"));
  const code = `S = "${stlDir.replace(/\\/g, "/").replace(/\/?$/, "/")}";\n${check.lib}\nmodule A() { ${check.a} }\nmodule B() { ${check.b} }\nintersection() { A(); B(); }\n`;
  fs.writeFileSync(base + ".scad", code);
  return new Promise((resolve, reject) => {
    const p = spawn(openscad, ["--export-format", "binstl", "-o", base + ".stl", base + ".scad"], { stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    p.stdout.on("data", (d) => (log += d));
    p.stderr.on("data", (d) => (log += d));
    const timer = setTimeout(() => { p.kill(); reject(new Error(`${check.id}: OpenSCAD took more than 5 minutes`)); }, 300000);
    p.on("close", (status) => {
      clearTimeout(timer);
      if (/empty|no top level/i.test(log)) return resolve({ id: check.id, volume: 0 });
      if (status !== 0 || !fs.existsSync(base + ".stl")) return reject(new Error(`${check.id}: OpenSCAD failed:\n${log.slice(-600)}`));
      resolve({ id: check.id, volume: binaryStlVolume(fs.readFileSync(base + ".stl")) });
    });
  });
}

/** Run all the checks, `jobs` at a time. Returns [{...check, volume, ok}]. */
export async function runChecks(checks, { openscad, stlDir, jobs = 4, onResult = () => {} }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "print-assembly-"));
  const results = new Array(checks.length);
  let next = 0;
  const worker = async () => {
    while (next < checks.length) {
      const i = next++;
      const { volume } = await runOne(checks[i], { openscad, stlDir, tmp });
      const ok = checks[i].expect === "clear" ? volume < EPS_MM3 : volume >= EPS_MM3;
      results[i] = { ...checks[i], volume, ok };
      onResult(results[i]);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return results;
}
