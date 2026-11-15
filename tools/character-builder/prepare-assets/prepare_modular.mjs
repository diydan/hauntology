// Turns the "ModularAnimeCharacter" Unity pack into web-ready assets for ../character-builder.
//
//   node prepare_modular.mjs <path-to-ModularAnimeCharacter> <out-dir>
//
// What it does
//   - reads the pack's Unity metadata (.meta, .mat) to find, for every mesh, which material it uses and which colour-mask and normal textures
//     and which colours that material has (the pack's shader colours a mask texture: the red channel shades region A, green selects region B, blue region C)
//   - shrinks the textures: colour masks stay lossless PNG at up to 1024 px (they compress to almost nothing), normal maps become WebP at up to 1024 px
//   - copies the 96 FBX meshes (loaded lazily by the viewer, one per chosen part)
//   - writes manifest.json describing every selectable part
// The pack is third-party: keep its files out of the repository (see ../character-builder/README.md).
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [, , packRoot, outDir] = process.argv;
if (!outDir) { console.error('usage: node prepare_modular.mjs <ModularAnimeCharacter folder> <out dir>'); process.exit(1); }
const slug = s => s.replace(/[^A-Za-z0-9._-]+/g, '_');
const walk = (d, out = []) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p); } return out; };
const all = walk(packRoot);

// guid -> file (relative to the pack)
const guid = {};
for (const f of all) if (f.endsWith('.meta')) { const t = fs.readFileSync(f, 'utf8').slice(0, 3000), g = t.match(/^guid: (\w+)/m); if (g) guid[g[1]] = path.relative(packRoot, f.slice(0, -5)); }

// ---- materials
const num = s => parseFloat(s);
function parseMat(file) {
  const t = fs.readFileSync(file, 'utf8'), name = (t.match(/m_Name: (.*)/) || [])[1]?.trim() || path.basename(file, '.mat');
  const sh = t.match(/m_Shader: \{fileID: (-?\d+), guid: (\w+)/), shader = sh ? guid[sh[2]] || '' : '';
  const tex = {};
  for (const m of t.matchAll(/- (_\w+):\n\s+m_Texture: \{fileID: (-?\d+)(?:, guid: (\w+))?[^}]*\}/g)) if (m[3] && guid[m[3]] && /\.(png|jpg)$/i.test(guid[m[3]])) tex[m[1]] = guid[m[3]];
  const col = {}; for (const m of t.matchAll(/- (_\w+): \{r: ([-\d.e]+), g: ([-\d.e]+), b: ([-\d.e]+), a: ([-\d.e]+)\}/g)) col[m[1]] = [num(m[2]), num(m[3]), num(m[4]), num(m[5])];
  const flo = {}; for (const m of t.matchAll(/^\s+- (_\w+): ([-\d.e]+)$/gm)) flo[m[1]] = num(m[2]);
  return { name, shader, tex, col, flo };
}
const matFiles = all.filter(f => f.endsWith('.mat') && f.includes(path.join('Assets', 'Materials')));
const mats = {};       // by file name without extension
for (const f of matFiles) mats[path.basename(f, '.mat')] = parseMat(f);
const matByGuid = {}; for (const [g, p] of Object.entries(guid)) if (p.endsWith('.mat')) matByGuid[g] = path.basename(p, '.mat');

// ---- textures: only the ones a material uses
const texOut = {}, jobs = [];
function tex(p, kind) {
  if (!p) return null; const key = p + '|' + kind; if (texOut[key]) return texOut[key];
  const base = slug(path.basename(p, path.extname(p))), rel = 'tex/' + base + (kind === 'normal' ? '.n.webp' : '.png'); texOut[key] = rel;
  jobs.push({ src: path.join(packRoot, p), dst: path.join(outDir, rel), kind }); return rel;
}
const gamma = c => c ? [c[0], c[1], c[2]] : null;
function matDef(key, override = {}) {
  const m = mats[key]; if (!m) return null;
  const mask = m.tex._BaseMap || m.tex._MainTex, normal = m.tex._BumpMap || m.tex._NormalMap, c = m.col, f = m.flo;
  if (!mask && !normal && !c._Color_A_2) {                                           // a plain material (a lens, a visor)
    const col = c._BaseColor || c._Color || [0.6, 0.7, 0.8, 0.3];
    return { kind: 'plain', color: gamma(col), alpha: col[3] < 0.999 ? col[3] : 1, metallic: f._Metallic ?? 0, smooth: f._Smoothness ?? 0.9 };
  }
  const d = { kind: 'mask', mask: tex(override.mask || mask, 'mask'), normal: tex(normal, 'normal'), A1: gamma(c._Color_A_1), A2: gamma(c._Color_A_2), B1: gamma(c._Color_B_1), B2: gamma(c._Color_B_2), C1: gamma(c._Color_C_1), C2: gamma(c._Color_C_2),
    mf: f._Mask_Factor ?? 0.45, remap: c._Mask_Remap ? [c._Mask_Remap[0], c._Mask_Remap[1]] : [0, 1], metallic: f._Metallic ?? 0, smooth: f._Smoothness ?? 0.5, thick: f._Thickness ?? 0.5, tint: gamma(c._Color) || [0.5, 0.5, 0.5] };
  for (const k of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) if (!d[k]) d[k] = [0, 0, 0];
  return d;
}

// ---- meshes and which material each of its sub-materials uses (read from the FBX's own .meta)
const meshDir = path.join(packRoot, 'Assets', 'Meshes'), fbxList = fs.readdirSync(meshDir).filter(f => f.endsWith('.fbx')).sort();
const fbxMats = {}, used = new Set();
for (const f of fbxList) {
  const t = fs.readFileSync(path.join(meshDir, f + '.meta'), 'utf8'), map = {};
  for (const m of t.matchAll(/first:\n\s+type: UnityEngine:Material\n\s+assembly: [\w.]+\n\s+name: (.*)\n\s+second: \{fileID: \d+, guid: (\w+)/g)) { const k = matByGuid[m[2]]; if (k) { map[m[1].trim()] = k; used.add(k); } }
  fbxMats[slug(f)] = map;
}
// make sure every referenced material has a definition
const materials = {}; for (const k of used) materials[k] = matDef(k);

// ---- catalogue of selectable parts, from the file names
const meshes = fbxList.map(f => ({ f, id: slug(f) }));
const nice = s => s.replace(/[._]+/g, ' ').replace(/\b(\d+)\b/g, '$1').replace(/\+T/, ' + T').replace(/^./, c => c.toUpperCase()).trim();
const slots = { body: {}, head: [], hair: [], hat: [], hathair: {}, glasses: [], scarf: [], top: [], bot: [], outfit: [], shoes: [] };
const byGender = (list, id, label, g, file) => { let e = list.find(x => x.id === id); if (!e) { e = { id, label }; list.push(e); } e[g] = file; return e; };
for (const { f, id } of meshes) {
  let m;
  if ((m = f.match(/^([MF])_body\.fbx$/))) slots.body[m[1]] = id;
  else if ((m = f.match(/^([MF])_head\.(\d+)\.fbx$/))) byGender(slots.head, 'head.' + m[2], 'Head ' + +m[2], m[1], id);
  else if ((m = f.match(/^C_hair_(.+)\.fbx$/))) { const nm = m[1]; const cat = /^buzzcut/.test(nm) ? 'buzzcut' : /^short/.test(nm) ? 'short' : /^medium/.test(nm) ? 'medium' : /^long/.test(nm) ? 'long' : /^tied/.test(nm) ? 'tied' : /^afro/.test(nm) ? 'short' : /^bangs/.test(nm) ? 'short' : /^curly/.test(nm) ? 'medium' : 'short'; slots.hair.push({ id: 'hair.' + nm, label: nice(nm.replace('.', ' ')), file: id, cat }); }
  else if ((m = f.match(/^C_hat\.hair_(.+)\.fbx$/))) slots.hathair[m[1]] = id;
  else if ((m = f.match(/^C_hat\.(\d+)_(.+)\.fbx$/))) slots.hat.push({ id: 'hat.' + m[1], label: nice(m[2]), file: id });
  else if ((m = f.match(/^C_glasses\.(\d+)_(.+)\.fbx$/))) slots.glasses.push({ id: 'glasses.' + m[1], label: nice(m[2]) + ' glasses', file: id });
  else if ((m = f.match(/^C_acc\.001_scarf(.*)\.fbx$/))) slots.scarf.push({ id: 'scarf' + m[1], label: 'Scarf' + (m[1] ? ' ' + m[1].replace(/^-?/, '').replace(/wideadjust-/, 'wide ') : ''), file: id });
  else if ((m = f.match(/^([MF])_(top|bot|outfit|shoes)\.(\d+)_?(.*)\.fbx$/))) { const list = { top: slots.top, bot: slots.bot, outfit: slots.outfit, shoes: slots.shoes }[m[2]]; byGender(list, m[2] + '.' + m[3] + (m[4].match(/_([AB])$/) ? '.' + m[4].match(/_([AB])$/)[1] : ''), nice((m[4] || (m[2] + ' ' + +m[3])).replace(/_[AB]$/, (s) => ' ' + s.slice(1))) || m[2], m[1], id); }
}
for (const k of ['head', 'top', 'bot', 'outfit', 'shoes']) slots[k].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
const fix = (list, names) => list.forEach(e => { const n = names[e.id]; if (n) e.label = n; });
fix(slots.top, { 'top.001': 'T-shirt', 'top.002': 'Hooded jacket', 'top.003': 'Sweatshirt', 'top.004': 'Shirt', 'top.005': 'Shirt and vest', 'top.006': 'Open shirt', 'top.007.A': 'Small jacket A', 'top.007.B': 'Small jacket B', 'top.008': 'Long sleeves', 'top.009': 'Hoodie', 'top.010': 'Shirt and tie', 'top.011': 'School blazer' });
fix(slots.bot, { 'bot.001': 'Trousers', 'bot.002': 'Shorts', 'bot.003': 'Short skirt', 'bot.004': 'Skinny jeans', 'bot.005': 'Big shorts', 'bot.006': 'Loose trousers' });
fix(slots.outfit, { 'outfit.001': 'Overalls', 'outfit.002': 'Outfit 2', 'outfit.003': 'Outfit 3', 'outfit.004': 'Racing suit' });
fix(slots.shoes, { 'shoes.001': 'Boots', 'shoes.002': 'Sneakers', 'shoes.003': 'Flip-flops', 'shoes.004': 'Sandals', 'shoes.005': 'High boots', 'shoes.006': 'Low sneakers', 'shoes.007': 'Chelsea boots' });
fix(slots.hat, { 'hat.001': 'Baseball cap', 'hat.002': 'Beanie', 'hat.003': 'Racing helmet' });
// style variants: a second material or a second mask for the same mesh
const variants = {
  'top.008': [{ label: 'Flat', mats: { 'mat_top.008_longsleevedshirt': 'mat_top.008_longsleeved-A' } }, { label: 'Stripes', mats: { 'mat_top.008_longsleevedshirt': 'mat_top.008_longsleeved-B' } }],
};
for (const k of ['mat_top.008_longsleeved-A', 'mat_top.008_longsleeved-B']) if (mats[k] && !materials[k]) materials[k] = matDef(k);
const t1 = mats['mat_top.001_tshirt'];
if (t1) { const base = t1.tex._BaseMap || ''; const alt = base.replace('RGBMap - A', 'RGBMap - B'); if (alt !== base && all.some(f => f.endsWith(path.basename(alt)))) { materials['mat_top.001_tshirt@B'] = matDef('mat_top.001_tshirt', { mask: alt }); variants['top.001'] = [{ label: 'A', mats: {} }, { label: 'B', mats: { 'mat_top.001_shirt': 'mat_top.001_tshirt@B' } }]; } }
for (const [k, v] of Object.entries(variants)) { const it = [...slots.top, ...slots.bot, ...slots.outfit, ...slots.shoes].find(e => e.id === k); if (it) it.variants = v; }

// ---- write everything
fs.mkdirSync(path.join(outDir, 'mesh'), { recursive: true }); fs.mkdirSync(path.join(outDir, 'tex'), { recursive: true });
for (const f of fbxList) fs.copyFileSync(path.join(meshDir, f), path.join(outDir, 'mesh', slug(f)));
let bytes = 0;
for (const j of jobs) {
  let s = sharp(j.src).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true });
  s = j.kind === 'normal' ? s.webp({ quality: 88 }) : s.png({ compressionLevel: 9 });
  const b = await s.toBuffer(); fs.writeFileSync(j.dst, b); bytes += b.length;
}
const manifest = { version: 1, source: 'ModularAnimeCharacter', slots, materials, fbxMats };
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest));
const mesh = fbxList.reduce((a, f) => a + fs.statSync(path.join(meshDir, f)).size, 0);
console.log(`${fbxList.length} meshes (${(mesh / 1048576).toFixed(1)} MB), ${jobs.length} textures (${(bytes / 1048576).toFixed(1)} MB), ${Object.keys(materials).length} materials`);
console.log('slots:', Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, Array.isArray(v) ? v.length : Object.keys(v).length])));
