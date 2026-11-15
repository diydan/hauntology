// Renders the picture for every tile in the Look panel: node make-thumbs.cjs
//
// Needs `playwright` (npm i playwright) and the built assets in ./assets (see README). Opens the builder in its
// thumbnail mode (?thumbs: no stage, no HUD, flat background), puts the character in an A-pose, and for each
// option sets it on a plain base look and takes a square picture. Writes assets/thumb/<M|F>/<kind>_<id>.webp.
//
// Offline or behind a proxy: THREE_ROOT=/path/to/node_modules/three serves three.js from disk instead of the CDN.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = __dirname, OUT = path.join(ROOT, 'assets', 'thumb'), SIZE = 200, PORT = +(process.env.PORT || 8790);
const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.txt': 'text/plain', '.js': 'text/javascript' };
const only = (process.env.ONLY || '').split(',').filter(Boolean), genders = (process.env.GENDERS || 'M,F').split(',');

const srv = http.createServer((q, s) => {
  const u = decodeURIComponent(q.url.split('?')[0]), f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
});

// Which frame each kind of tile is shot in: [target height in metres, visible height in metres, camera yaw in degrees]
const FRAME = { face: [1.535, 0.4, 14], hair: [1.54, 0.56, 14], hat: [1.54, 0.56, 14], scarf: [1.46, 0.56, 14], top: [1.27, 0.84, 18], bot: [0.62, 1.25, 18], outfit: [0.9, 1.9, 18], shoes: [0.11, 0.34, 25] };
// What the character wears while one kind of option is being shot (everything else stays plain and the same for every tile)
const BASE = { hair: 'hair.short.001', top: 'top.001', bot: 'bot.004', shoes: 'shoes.006', outfit: null, hat: null, glasses: null, scarf: null, bangs: null };
const plain = over => ({ ...BASE, ...over });

srv.listen(PORT, async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const g of genders) {
    const ctx = await browser.newContext({ viewport: { width: SIZE, height: SIZE } }), pg = await ctx.newPage();
    if (process.env.THREE_ROOT) await pg.route(/cdn\.jsdelivr\.net\/npm\/three@/, r => { const m = r.request().url().match(/three@0\.187\.0\/(.*)$/); r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(process.env.THREE_ROOT, m[1])) }); });
    pg.on('pageerror', e => console.log('page error', e.message));
    await pg.goto(`http://localhost:${PORT}/?thumbs&g=${g}`); await pg.waitForFunction(() => window.__cb && window.__cb.ready && window.__cb.parts.shoes, null, { timeout: 120000 }); await pg.evaluate(() => window.__cb.ready);
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8')), slots = manifest.slots;
    const ADDON = /bangs|_(bun|buns|ponytail|twintails)$/, hairs = slots.hair.filter(h => !ADDON.test(h.id)), bangs = slots.hair.filter(h => ADDON.test(h.id));

    await pg.evaluate(() => {
      const c = window.__cb, T = c.THREE; document.getElementById('spin').click(); c.controls.enableDamping = false; c.controls.autoRotate = false; c.S.blink = false; c.S.lip = false; c.S.prop = false;
      const t = window.__t = {};
      // A-pose: drop both upper arms about 62 degrees from the T-pose, elbows a touch bent
      t.pose = (deg = 62) => { c.mixer.stopAllAction(); const B = c.B(), z = new T.Vector3(0, 0, 1), pq = new T.Quaternion(), wq = new T.Quaternion();
        for (const [n, sgn] of [['CC_BaseUpperarmL', -1], ['CC_BaseUpperarmR', 1]]) { const b = B[n]; if (!b) continue; c.bodyObj.updateWorldMatrix(true, true);
          b.getWorldQuaternion(wq); b.parent.getWorldQuaternion(pq); const rot = new T.Quaternion().setFromAxisAngle(z, sgn * deg * Math.PI / 180); b.quaternion.copy(pq.invert().multiply(rot.multiply(wq))); }
        c.bodyObj.updateWorldMatrix(true, true); };
      t.frame = (cy, span, yaw) => { const d = span * 1.55, a = yaw * Math.PI / 180; c.camera.position.set(Math.sin(a) * d, cy + span * 0.04, Math.cos(a) * d); c.controls.target.set(0, cy, 0); c.controls.update(); };
      t.shot = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => { c.renderer.render(c.scene, c.camera); r(c.renderer.domElement.toDataURL('image/webp', 0.84)); })));
      t.look = async cfg => { Object.assign(c.S, cfg); await c.applyLook(); };
    });
    await pg.evaluate(() => window.__t.pose());
    const save = (kind, id, dataUrl) => { const dir = path.join(OUT, g); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${kind}_${id.replace(/ /g, '-')}.webp`), Buffer.from(dataUrl.split(',')[1], 'base64')); };
    const take = async (kind, id, frame) => { await pg.evaluate(([f]) => window.__t.frame(...f), [frame]); save(kind, id, await pg.evaluate(() => window.__t.shot())); };
    const run = (name, fn) => (only.length && !only.includes(name)) ? null : fn().then(() => console.log(g, name, 'done'));

    await run('head', async () => { await pg.evaluate(cfg => window.__t.look(cfg), plain({ hair: null, expr: 'neutral' })); for (const h of slots.head) { await pg.evaluate(id => window.__t.look({ head: id }), h.id); await take('head', h.id, FRAME.hair); } });
    await run('mood', async () => { await pg.evaluate(cfg => window.__t.look(cfg), plain({ head: 'head.001' }));
      const EX = { neutral: {}, happy: { happy_01: 0.9 }, 'happy 2': { happy_02: 0.9 }, angry: { angry_01: 0.9 }, sad: { sad_01: 0.9 }, surprised: { surprised_01: 0.9 }, smirk: { extra_01: 0.9 } };
      for (const [k, v] of Object.entries(EX)) { await pg.evaluate(f => { window.__cb.FACE.force = f; }, v); await pg.waitForTimeout(250); await take('mood', k, FRAME.hair); } await pg.evaluate(() => { window.__cb.FACE.force = null; }); });
    await run('hair', async () => { await pg.evaluate(cfg => window.__t.look(cfg), plain({ head: 'head.001', bangs: null })); for (const h of hairs) { await pg.evaluate(id => window.__t.look({ hair: id }), h.id); await take('hair', h.id, FRAME.hair); } });
    await run('bangs', async () => { await pg.evaluate(cfg => window.__t.look(cfg), plain({ hair: 'hair.medium.001' })); for (const h of bangs) { const m = h.id.match(/^(hair\.tied\.\d+)_/); await pg.evaluate(([id, base]) => window.__t.look({ bangs: id, hair: base || 'hair.medium.001' }), [h.id, m ? m[1] : null]); await take('bangs', h.id, FRAME.hair); } await pg.evaluate(() => window.__t.look({ bangs: null })); });
    await run('hat', async () => { await pg.evaluate(cfg => window.__t.look(cfg), plain({ hair: 'hair.short.001' })); for (const h of slots.hat) { await pg.evaluate(id => window.__t.look({ hat: id }), h.id); await take('hat', h.id, FRAME.hat); } await pg.evaluate(() => window.__t.look({ hat: null })); });
    await run('glasses', async () => { await pg.evaluate(cfg => window.__t.look(cfg), plain({})); for (const h of slots.glasses) { await pg.evaluate(id => window.__t.look({ glasses: id }), h.id); await take('glasses', h.id, FRAME.hair); } await pg.evaluate(() => window.__t.look({ glasses: null })); });
    await run('scarf', async () => { await pg.evaluate(cfg => window.__t.look(cfg), plain({})); for (const h of slots.scarf) { await pg.evaluate(id => window.__t.look({ scarf: id }), h.id); await take('scarf', h.id, FRAME.scarf); } await pg.evaluate(() => window.__t.look({ scarf: null })); });
    await run('top', async () => { await pg.evaluate(cfg => window.__t.look(cfg), plain({})); for (const h of slots.top) { await pg.evaluate(id => window.__t.look({ top: id, variant: {} }), h.id); await take('top', h.id, FRAME.top); } });
    await run('bot', async () => { await pg.evaluate(cfg => window.__t.look(cfg), plain({})); for (const h of slots.bot) { await pg.evaluate(id => window.__t.look({ bot: id }), h.id); await take('bot', h.id, FRAME.bot); } });
    await run('outfit', async () => { await pg.evaluate(cfg => window.__t.look(cfg), plain({})); for (const h of slots.outfit) { await pg.evaluate(id => window.__t.look({ outfit: id }), h.id); await take('outfit', h.id, FRAME.outfit); } });
    await run('shoes', async () => { await pg.evaluate(cfg => window.__t.look(cfg), plain({ outfit: null })); for (const h of slots.shoes) { await pg.evaluate(id => window.__t.look({ shoes: id }), h.id); await take('shoes', h.id, FRAME.shoes); } });
    await ctx.close();
  }
  await browser.close(); srv.close();
});
