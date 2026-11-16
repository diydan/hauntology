#!/usr/bin/env node
// Turns Ghost.fbx (the landing-page ghost: two Blender meshes, "Ghost" and "Web", no textures, skeleton or animation) into two binary
// STLs for the parts viewer (viewer.html): print/reference/ghost-original.stl (the ghost) and print/reference/ghost-web.stl (its web).
//   Usage: node tools/prop-mockups/convert-ghost.mjs [path/to/Ghost.fbx]
// The FBX is Y-up in metres-ish units; the viewer's parts are Z-up in millimetres, so every point goes (x, y, z) -> (x, -z, y)
// (a quarter turn about X, which keeps the triangle winding). The two meshes together are scaled to HEIGHT_MM tall and moved so their
// joint lowest corner is the origin; they keep their place relative to each other (the web's offset is printed for viewer.html).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Minimal binary FBX reader (v7.x, 32-bit offsets for <7500 and 64-bit for >=7500)
import zlib from "node:zlib";
export function parseFBX(file){
  const b=fs.readFileSync(file); if(b.slice(0,20).toString()!=="Kaydara FBX Binary  ") throw new Error("not binary FBX");
  const ver=b.readUInt32LE(23); const wide=ver>=7500; let p=27;
  const rdU=()=>{const v=wide?Number(b.readBigUInt64LE(p)):b.readUInt32LE(p);p+=wide?8:4;return v;};
  function node(){
    const end=rdU(), np=rdU(), pl=rdU(); const nl=b.readUInt8(p++); if(end===0) return null;
    const name=b.toString("latin1",p,p+nl); p+=nl; const props=[];
    for(let i=0;i<np;i++){const t=String.fromCharCode(b[p++]);
      if(t==="Y"){props.push(b.readInt16LE(p));p+=2;} else if(t==="C"){props.push(b[p++]!==0);} else if(t==="I"){props.push(b.readInt32LE(p));p+=4;}
      else if(t==="F"){props.push(b.readFloatLE(p));p+=4;} else if(t==="D"){props.push(b.readDoubleLE(p));p+=8;} else if(t==="L"){props.push(Number(b.readBigInt64LE(p)));p+=8;}
      else if("fdlib".includes(t)){const n=b.readUInt32LE(p),enc=b.readUInt32LE(p+4),cl=b.readUInt32LE(p+8);p+=12;let raw=b.subarray(p,p+cl);p+=cl;if(enc===1)raw=zlib.inflateSync(raw);
        const sz={f:4,d:8,l:8,i:4,b:1}[t];const out=t==="f"?new Float32Array(n):t==="d"?new Float64Array(n):t==="l"?new Array(n):t==="i"?new Int32Array(n):new Uint8Array(n);
        for(let k=0;k<n;k++)out[k]=t==="f"?raw.readFloatLE(k*4):t==="d"?raw.readDoubleLE(k*8):t==="l"?Number(raw.readBigInt64LE(k*8)):t==="i"?raw.readInt32LE(k*4):raw[k];props.push(out);}
      else if(t==="S"){const n=b.readUInt32LE(p);p+=4;props.push(b.toString("utf8",p,p+n));p+=n;} else if(t==="R"){const n=b.readUInt32LE(p);p+=4;props.push(b.subarray(p,p+n));p+=n;} else throw new Error("prop type "+t);}
    const kids=[]; while(p<end){const k=node(); if(k) kids.push(k);} p=end;
    return {name,props,kids};
  }
  const top=[]; while(p<b.length-160){const n=node(); if(!n) break; top.push(n);} return {version:ver,top};
}
export const find=(n,name)=>n.kids.filter(k=>k.name===name);

const here = path.dirname(fileURLToPath(import.meta.url));
const fbxPath = process.argv[2] || path.join(here, "Ghost.fbx");
const outDir = path.resolve(here, "../../print/reference");
const HEIGHT_MM = 73.5; // the whole ghost: about the height of a Suspect standee (69 mm)
const OUT = { Ghost: "ghost-original", Web: "ghost-web" }; // the model names inside the FBX -> file names

const f = parseFBX(fbxPath);
const objects = f.top.find((n) => n.name === "Objects");
const connections = f.top.find((n) => n.name === "Connections");
const byId = new Map(objects.kids.map((o) => [o.props[0], o]));
const geomOf = new Map(); // model id -> geometry node
for (const c of connections.kids) {
  if (c.props[0] !== "OO") continue;
  const child = byId.get(c.props[1]), parent = byId.get(c.props[2]);
  if (child && parent && child.name === "Geometry" && parent.name === "Model") geomOf.set(parent.props[0], child);
}

function triangles(geom) { // in FBX units, already turned to Z-up
  const v = find(geom, "Vertices")[0].props[0], idx = find(geom, "PolygonVertexIndex")[0].props[0], tris = [];
  let poly = [];
  for (const raw of idx) {
    const end = raw < 0, i = end ? -raw - 1 : raw;
    poly.push(i);
    if (end) { for (let k = 1; k + 1 < poly.length; k++) tris.push([poly[0], poly[k], poly[k + 1]]); poly = []; } // fan, in case of quads
  }
  const pt = (i) => [v[i * 3], -v[i * 3 + 2], v[i * 3 + 1]];
  return tris.map((t) => t.map(pt));
}

function stlOf(tris, header) {
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.write(header.slice(0, 79), 0, "ascii");
  buf.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => {
    const o = 84 + i * 50, u = [0, 1, 2].map((k) => t[1][k] - t[0][k]), w = [0, 1, 2].map((k) => t[2][k] - t[0][k]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...n) || 1;
    n.forEach((x, k) => buf.writeFloatLE(x / l, o + k * 4));
    t.forEach((p, j) => p.forEach((x, k) => buf.writeFloatLE(x, o + 12 + j * 12 + k * 4)));
  });
  return buf;
}

const meshes = [];
for (const [id, model] of byId) {
  if (model.name !== "Model") continue;
  const name = OUT[model.props[1].split("\u0000")[0]];
  if (name) meshes.push({ name, tris: triangles(geomOf.get(id)) });
}
const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (const m of meshes) for (const t of m.tris) for (const p of t) p.forEach((x, k) => { mn[k] = Math.min(mn[k], x); mx[k] = Math.max(mx[k], x); });
const SCALE = HEIGHT_MM / (mx[2] - mn[2]);
fs.mkdirSync(outDir, { recursive: true });
const corner = {};
for (const m of meshes) {
  const moved = m.tris.map((t) => t.map((p) => p.map((x, k) => (x - mn[k]) * SCALE)));
  fs.writeFileSync(path.join(outDir, m.name + ".stl"), stlOf(moved, "Hauntology landing-page ghost, " + m.name));
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const t of moved) for (const p of t) p.forEach((x, k) => { lo[k] = Math.min(lo[k], x); hi[k] = Math.max(hi[k], x); });
  corner[m.name] = lo;
  console.log(m.name.padEnd(15), String(m.tris.length).padStart(5), "triangles, size", hi.map((x, k) => (x - lo[k]).toFixed(1)).join(" x "), "mm");
}
if (corner["ghost-original"] && corner["ghost-web"]) console.log("web corner relative to ghost corner (mm):", corner["ghost-web"].map((x, k) => +(x - corner["ghost-original"][k]).toFixed(3)).join(", "), " scale", SCALE.toFixed(3), "mm per FBX unit");
