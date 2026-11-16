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

// ---------------------------------------------------------------- #1 ghost in the box
const lib01 = `
module body() { ${imp("prop-01-chest-body")}; }
// lid turned right way up onto the chest: 90.3 puts the hinge axes together with 0.3 mm of rim clearance
module lid(dz = 90.3) { translate([0, 0, dz]) rotate([180, 0, 0]) ${imp("prop-01-chest-lid")}; }
// servo shaft along -Y at X = -48.5, Z = 32; the lever sweeps in the XZ plane, th degrees up from level
module lever(a) { translate([-48.5, -11.0, 32]) rotate([0, a, 0]) rotate([-90, 0, 0]) ${imp("prop-01-lever-arm")}; }
module ghost(zo) { translate([0, 1.0, zo]) rotate([90, 0, 0]) ${imp("prop-01-ghost-figure")}; }
`;
function checks01() {
  const c = [
    ["lid-body", "lid();", "body();", "clear", "the closed lid on the chest"],
    ["ghost-rest-body", "ghost(9.1);", "body();", "clear", "the ghost at rest"],
    ["ghost-rest-lid", "ghost(9.1);", "lid();", "clear", "the ghost under the closed lid"],
    ["ghost-lift-body", "ghost(39.1);", "body();", "clear", "the ghost lifted 30 mm"],
    ["lever-rest-ghost", "lever(18);", "ghost(9.1);", "clear", "the lever at its lowest, round the ghost's pin"],
  ];
  for (const [name, a, th] of [["m18", 18, -18], ["m10", 10, -10], ["0", 0, 0], ["20", -20, 20], ["45", -45, 45]]) c.push([`lever-${name}-body`, `lever(${a});`, "body();", "clear", `the lever ${th} degrees from level`]);
  c.push(["control-lid-low", "lid(88);", "body();", "collide", "control: the lid 2.3 mm too low"]);
  return c.map(([id, a, b, expect, note]) => ({ id: `p01/${id}`, prop: "p01", lib: lib01, a, b, expect, note }));
}

// ---------------------------------------------------------------- #3 Haunt needle
const lib03 = (plateH) => `
PH = ${plateH};
module plate() { ${imp("prop-03-dial-plate")}; }
module bezel(z = PH) { translate([0, 0, z]) ${imp("prop-03-bezel-ring")}; }
module needle(a) { translate([0, 0, PH]) rotate([0, 0, a]) ${imp("prop-03-needle")}; }
`;
function checks03(root) {
  const src = fs.readFileSync(path.join(root, "print", "scad", "prop-03-dial-plate.scad"), "utf8");
  const plateH = Number(src.match(/^\s*plate_h\s*=\s*(-?[\d.]+)\s*;/m)[1]);
  const lib = lib03(plateH);
  const c = [["bezel-plate", "bezel();", "plate();", "clear", "the bezel ring on the dial plate"]];
  for (const a of [15, 90, 165]) c.push([`needle-${a}-plate`, `needle(${a});`, "plate();", "clear", `the needle at ${a} degrees`], [`needle-${a}-bezel`, `needle(${a});`, "bezel();", "clear", `the needle at ${a} degrees, inside the bezel`]);
  c.push(["control-bezel-low", `bezel(${plateH - 4.4});`, "plate();", "collide", "control: the bezel sunk 4.4 mm into the plate"]);
  return c.map(([id, a, b, expect, note]) => ({ id: `p03/${id}`, prop: "p03", lib, a, b, expect, note }));
}

// ---------------------------------------------------------------- #5 flipper
const lib05 = `
module plinth(dx = 0) { translate([dx, 0, 0]) ${imp("prop-05-plinth-2seat")}; }
// a flap turned th degrees about its servo's axis (Z = 5 in the file), placed dx along
module pw(dx, th) { translate([dx, 0, 5]) rotate([0, th, 0]) translate([0, 0, -5]) ${imp("prop-05-flap-pawn")}; }
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
  c.push(["control-flaps-30", "pw(0, 0);", "pw(30, 0);", "collide", "control: flaps 30 mm apart"]);
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
  const lib = lib09(L) + routeScad(L, THREAD_POS09);
  const ALL = "frame(); bezel(); bar(); wheel(); drum(); servo(); horn();";
  const c = [
    ["servo-frame", "servo();", "frame();"], ["servo-bezel", "servo();", "bezel();"], ["servo-drum", "servo();", "drum();"],
    ["horn-drum", "horn();", "drum();"], ["drum-frame", "drum();", "frame();"], ["drum-bezel", "drum();", "bezel();"],
    ["drum-bar", "drum();", "bar();"], ["drum-wheel", "drum();", "wheel();"], ["wheel-frame", "wheel();", "frame();"],
    ["wheel-bar", "wheel();", "bar();"], ["bar-frame", "bar();", "frame();"], ["bar-bezel", "bar();", "bezel();"],
    ["bar-servo", "bar();", "servo(); horn(); drum();"], ["wheel-bezel", "wheel();", "bezel();"], ["wheel-servo", "wheel();", "servo(); drum();"],
  ].map(([id, a, b]) => [id, a, b, "clear", "parts in the finished stage"]);
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
function lib15(C) {
  const [s1, s2] = CLASP_SPLITS;
  return `
module chest() { ${imp("prop-15-vault-chest")}; }
module tray() { translate([0, 0, 22]) ${imp("prop-15-relic-tray")}; }
module pod(dx) { translate([dx, 0, 0]) ${imp("prop-15-keypad-pod")}; }
// the lid turned right way up: 102.3 puts the hinge axes together with 0.3 mm of rim clearance
module lid_closed() { translate([0, 0, 102.3]) rotate([180, 0, 0]) ${imp("prop-15-vault-lid")}; }
// the clasp file holds three pieces on one plate (cut out here by X): the escutcheon, the lid's hasp and the servo's latch arm
module hasp() { intersection() { ${imp("prop-15-vault-clasp")}; translate([${s1}, -30, -1]) cube([${s2 - s1}, 60, 12]); } }
module arm() { intersection() { ${imp("prop-15-vault-clasp")}; translate([${s2}, -30, -1]) cube([60, 60, 12]); } }
module plate() { intersection() { ${imp("prop-15-vault-clasp")}; translate([-80, -30, -1]) cube([${80 + s1}, 60, 12]); } }
// the hasp stood in the lid's slot (its middle on the slot's middle, X = 0), the escutcheon on the chest front with its keeper slot
// over the latch window, and the latch arm on the servo's spline (X = 0, Y = -47.7, horn at Z = 74.5), th degrees round
module hasp_in_slot(zoff = 81.8, yc = -57.2) { translate([${-C.hasp[0]}, yc, zoff]) rotate([90, 0, 0]) translate([0, 0, -1.9]) hasp(); }
module plate_posed() { multmatrix([[1,0,0,${-C.plate[0]}],[0,0,1,-62.2],[0,1,0,66],[0,0,0,1]]) plate(); }
module arm_at(px, py, zb, th) { translate([px, py, zb]) rotate([0, 0, 180 + th]) translate([${-C.arm[0]}, ${-C.arm[1]}, 0]) arm(); }
`;
}
function checks15(root) {
  const C = clasp15(root);
  if (!piecesSeparate(fs.readFileSync(path.join(root, "print", "stl", "prop-15-vault-clasp.stl")), CLASP_SPLITS))
    throw new Error(`print-assembly: the clasp plate's pieces are no longer apart at X = ${CLASP_SPLITS.join(" and ")}; move CLASP_SPLITS`);
  const c = [
    ["lid-chest", "lid_closed();", "chest();", "clear", "the closed lid on the vault"], ["tray-chest", "tray();", "chest();", "clear", "the tray on its ledges"],
    ["hasp-chest", "hasp_in_slot();", "chest();", "clear", "the hasp in the lid's slot"], ["hasp-lid", "hasp_in_slot();", "lid_closed();", "clear", "the hasp in the lid's slot"],
    ["hasp-plate", "hasp_in_slot();", "plate_posed();", "clear", "the hasp and the escutcheon"], ["pod-docked", "pod(127);", "chest();", "clear", "the keypad pod docked on the right wall"],
  ];
  for (const th of [0, 45, 90, 135, 180]) for (const [n, b] of [["chest", "chest();"], ["hasp", "hasp_in_slot();"], ["plate", "plate_posed();"], ["lid", "lid_closed();"]]) c.push([`arm-${th}-${n}`, `arm_at(0, -47.7, 74.5, ${th});`, b, "clear", `the latch arm turned ${th} degrees, against the ${n}`]);
  c.push(["control-pod-126", "pod(126);", "chest();", "collide", "control: pod 1 mm too close"], ["control-arm-low", "arm_at(0, -47.7, 50, 0);", "chest();", "collide", "control: latch arm 24 mm too low"],
    ["control-hasp-low", "hasp_in_slot(76.8);", "chest();", "collide", "control: hasp 5 mm too low"]);
  const lib = lib15(C);
  return c.map(([id, a, b, expect, note]) => ({ id: `p15/${id}`, prop: "p15", lib, a, b, expect, note }));
}

export const PROPS = ["p01", "p03", "p05", "p09", "p15"];

/** Every check, as {id, prop, lib, a, b, expect, note}. */
export function buildChecks(root, only = PROPS) {
  const all = { p01: checks01, p03: () => checks03(root), p05: checks05, p09: () => checks09(root), p15: () => checks15(root) };
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
