#!/usr/bin/env node
// Assembly collision checks for the print kit (see tools/lib/print-assembly.mjs): the compiled STLs in print/stl are put in the
// poses of the finished props and intersected with OpenSCAD. A "clear" check must overlap nothing; a "collide" check is a control
// (a part moved on purpose) and must overlap something, so a wrong pose cannot pass quietly.
//
//   node tools/check-print-assembly.mjs                 all five props (142 OpenSCAD runs, about 30 seconds)
//   node tools/check-print-assembly.mjs --only p09,p15  some props: p01 p03 p05 p09 p15
//   node tools/check-print-assembly.mjs --jobs 8        OpenSCAD runs at a time (default 4)
//   node tools/check-print-assembly.mjs --list          list the checks without running them
//   node tools/check-print-assembly.mjs --route         the curtain's thread route: lengths, wraps and the elastic, no OpenSCAD
//   node tools/check-print-assembly.mjs --stl <dir>     check STLs somewhere else (default print/stl)
// Exit 1 when a clear check overlaps or a control does not.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROPS, EPS_MM3, buildChecks, findOpenscad, runChecks } from "./lib/print-assembly.mjs";
import { drumTurnDeg, loadLayout, routes } from "./lib/print-route.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const flag = (name) => process.argv.includes(name);

if (flag("--route")) {
  const L = loadLayout(root);
  console.log("Thread route of the curtain reveal (prop #9). Stage mm; panels' middles at +-X.");
  console.log(`  drum (${L.drum}), idler (${L.idler}), right post (${L.rightPost}), left post (${L.leftPost}), centre post (${L.centrePost}); thread plane Z = ${L.threadZ}`);
  const row = (name, closed, open, extra) => console.log(`  ${name.padEnd(14)} ${closed.toFixed(1).padStart(6)} mm closed  ${open.toFixed(1).padStart(6)} mm open  ${extra}`);
  const a = routes(L, 26.2), b = routes(L, 50.2);
  row("right thread", a.right.length, b.right.length, `post ${a.right.postDeg.toFixed(0)} deg, drum ${a.right.drumDeg.toFixed(0)} deg to its anchor`);
  row("left thread", a.left.length, b.left.length, `post ${a.left.postDeg.toFixed(0)}, idler ${a.left.idlerDeg.toFixed(0)}, drum ${a.left.drumDeg.toFixed(0)} deg to its anchor`);
  row("elastic", a.elastic.length, b.elastic.length, `stretch x${(b.elastic.length / a.elastic.length).toFixed(2)}, leaves the carriage ${(180 - a.elastic.leaveDeg).toFixed(0)} deg off the rail closed, ${(180 - b.elastic.leaveDeg).toFixed(0)} open`);
  console.log(`  thread taken in by opening: right ${(a.right.length - b.right.length).toFixed(1)} mm, left ${(a.left.length - b.left.length).toFixed(1)} mm = ${drumTurnDeg(a.right.length - b.right.length).toFixed(0)} deg of servo turn`);
  process.exit(0);
}

const only = (arg("--only") ?? PROPS.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
for (const p of only) if (!PROPS.includes(p)) { console.error(`unknown prop ${p}; props are ${PROPS.join(" ")}`); process.exit(2); }
const checks = buildChecks(root, only);

if (flag("--list")) {
  for (const c of checks) console.log(`${c.expect.padEnd(8)} ${c.id.padEnd(40)} ${c.note}`);
  console.log(`${checks.length} checks`);
  process.exit(0);
}

const openscad = findOpenscad();
if (!openscad) { console.error("OpenSCAD is not installed (brew install openscad), so the collision checks cannot run."); process.exit(2); }
const stlDir = path.resolve(arg("--stl") ?? path.join(root, "print", "stl"));
const jobs = Number(arg("--jobs") ?? 4);
console.log(`${checks.length} checks on ${only.join(" ")}, ${jobs} at a time, STLs from ${stlDir}`);
let done = 0;
const results = await runChecks(checks, {
  openscad, stlDir, jobs,
  onResult: (r) => { done++; if (!r.ok) console.log(`FAIL ${r.id}: ${r.volume.toFixed(1)} mm3 overlap, ${r.expect === "clear" ? "expected none" : "expected a collision (control)"} (${r.note})`); else if (process.stdout.isTTY) process.stdout.write(`\r${done}/${checks.length}`); },
});
if (process.stdout.isTTY) process.stdout.write("\r");
for (const p of only) {
  const mine = results.filter((r) => r.prop === p);
  const clear = mine.filter((r) => r.expect === "clear"), ctl = mine.filter((r) => r.expect === "collide");
  console.log(`${p}: ${clear.filter((r) => r.ok).length}/${clear.length} clear, ${ctl.filter((r) => r.ok).length}/${ctl.length} controls collide`);
}
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `${failed.length} of ${results.length} checks failed (overlap under ${EPS_MM3} mm3 counts as touching).` : `print-assembly: all ${results.length} checks as expected.`);
process.exit(failed.length ? 1 : 0);
