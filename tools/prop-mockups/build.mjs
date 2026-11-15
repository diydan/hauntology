// Builds every scene in src/scenes into one standalone HTML file (mockups/NN-name.html)
// and the gallery page (index.html). No dependencies. Run: node tools/prop-mockups/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, 'src/harness.css'), 'utf8');
const js = fs.readFileSync(path.join(here, 'src/harness.js'), 'utf8');
const sceneDir = path.join(here, 'src/scenes');
const files = fs.readdirSync(sceneDir).filter((f) => f.endsWith('.js')).sort();
fs.mkdirSync(path.join(here, 'mockups'), { recursive: true });

const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const metas = [];

for (const f of files) {
  const src = fs.readFileSync(path.join(sceneDir, f), 'utf8');
  let meta = null;
  vm.runInNewContext(src, { Mock: (d) => { meta = d; }, Math, performance: { now: () => 0 } });
  if (!meta) throw new Error(f + ' did not call Mock()');
  const slug = f.replace(/\.js$/, '');
  meta.slug = slug;
  metas.push(meta);
  const ranked = files.filter((g) => /rank:\s*\d/.test(fs.readFileSync(path.join(sceneDir, g), 'utf8'))).length;
  const html = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>' + esc(meta.title) + ' · prop mockup</title><style>' + css + '</style></head>' +
    '<body><div id="app"></div><script>window.__RANKED__=' + ranked + ';</script><script>' + safe(js) + '</script><script>' + safe(src) + '</script></body></html>\n';
  fs.writeFileSync(path.join(here, 'mockups', slug + '.html'), html);
}

const groups = [...new Set(metas.map((m) => m.group))];
const card = (m) => {
  const shot = fs.existsSync(path.join(here, 'shots', m.slug + '.png'));
  const servos = Object.keys(m.servos || {}).filter((k) => !m.servos[k].hand).length;
  return '<a class="c" data-rank="' + (m.rank || 99) + '" data-num="' + m.num + '" href="mockups/' + m.slug + '.html">' +
    (shot ? '<img loading="lazy" alt="" src="shots/' + m.slug + '.png">' : '<div class="ph"></div>') +
    '<div class="b"><h3><span>#' + m.num + '</span> ' + esc(m.title) + '</h3><p>' + esc(m.summary) + '</p>' +
    '<div class="t">' + (m.rank ? '<i>rank ' + m.rank + '</i>' : '') + '<i>' + servos + ' servo' + (servos === 1 ? '' : 's') + '</i>' +
    (m.leak ? '<i class="' + m.leak.toLowerCase() + '">leak ' + esc(m.leak) + '</i>' : '') + '</div></div></a>';
};
const sections = groups.map((g) => '<h2>' + esc(g) + '</h2><div class="grid" data-g="' + esc(g) + '">' + metas.filter((m) => m.group === g).map(card).join('') + '</div>').join('');

const index = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Hauntology prop mockups</title><style>' +
  ':root{--bg:#0d0b12;--panel:#16121e;--line:#2d2641;--text:#ebe6f5;--mute:#9b92ae;--ghost:#b9a7ff;--gold:#e8c36a}' +
  '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}' +
  '.w{max-width:1180px;margin:0 auto;padding:20px 16px 60px}h1{margin:0 0 4px;font-size:28px}h2{margin:26px 0 10px;font-size:13px;letter-spacing:.09em;text-transform:uppercase;color:var(--mute)}' +
  '.lead{color:var(--mute);max-width:75ch;margin:0 0 12px}button{font:inherit;color:var(--text);background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:8px 14px;min-height:44px;cursor:pointer}button:hover{border-color:var(--ghost)}' +
  '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px}.c{display:block;background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;color:inherit;text-decoration:none}' +
  '.c:hover{border-color:var(--ghost)}.c img,.ph{display:block;width:100%;aspect-ratio:11/8;object-fit:cover;background:#100d17}.b{padding:10px 12px 12px}.b h3{margin:0 0 4px;font-size:16px}.b h3 span{color:var(--gold)}' +
  '.b p{margin:0 0 8px;color:var(--mute);font-size:13.5px}.t{display:flex;gap:6px;flex-wrap:wrap}.t i{font-style:normal;font-size:12px;padding:2px 8px;border-radius:99px;border:1px solid var(--line);color:var(--mute)}' +
  '.t i.none{border-color:#2f6b4a;color:#9fe8be}.t i.low{border-color:#7a6a2e;color:#f0d98a}.t i.high{border-color:#8a3a3a;color:#ffb0b0}' +
  '</style></head><body><div class="w"><h1>Hauntology prop mockups</h1>' +
  '<p class="lead">Each page is standalone: open it, press the buttons on the right, and watch what the ESP32 would do. These are drawings with the game rules built in. Nothing here is real hardware, and nothing is connected to the game.</p>' +
  '<button id="s">Sort the props by my rank</button>' + sections +
  '<script>var b=document.getElementById("s"),by="num";b.onclick=function(){by=by==="num"?"rank":"num";b.textContent=by==="num"?"Sort the props by my rank":"Sort the props by number";' +
  'var g=document.querySelector(\'[data-g="Props"]\');if(!g)return;Array.prototype.slice.call(g.children).sort(function(x,y){return x.dataset[by]-y.dataset[by]}).forEach(function(c){g.appendChild(c)})}</script>' +
  '</div></body></html>\n';
fs.writeFileSync(path.join(here, 'index.html'), index);
console.log('built', metas.length, 'mockups + index.html');
