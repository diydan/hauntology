// Renders contact sheets of morphed heads into ./screenshots (git-ignored: the pictures contain the pack's art).
//   node make-head-shots.cjs [url]      needs: npm i playwright, and the viewer served (npx serve character-builder)
// Sheets: heads-presets.png (the six face presets, each at three head sizes) and heads-random.png (twelve seeded full looks with
// their own head size, so the face morphs, eye shapes, hair and head scale can all be judged side by side).
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const URL = process.argv[2] || 'http://localhost:4180/character-builder/';
const OUT = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await page.route('https://fonts.g*/**', (r) => r.abort());
  await page.goto(URL + '#seed=2024');
  await page.waitForFunction(() => window.__cb && window.__cb.bodyObj && Object.keys(window.__cb.B()).length > 10, null, { timeout: 60000 });
  await page.evaluate(async () => { await window.__cb.ready; document.body.classList.add('thumbs'); });
  await page.waitForTimeout(2500);

  const sheet = async (name, cols, tileW, tileH, jobs) => {
    const b64 = await page.evaluate(async ({ cols, tileW, tileH, jobs }) => {
      const c = window.__cb, rows = Math.ceil(jobs.length / cols), sh = document.createElement('canvas');
      sh.width = cols * tileW; sh.height = rows * tileH; const g = sh.getContext('2d'); g.fillStyle = '#120b30'; g.fillRect(0, 0, sh.width, sh.height);
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      c.camera.clearViewOffset(); c.controls.enabled = false;
      for (let i = 0; i < jobs.length; i++) {
        const j = jobs[i];
        if (j.seed != null) { await c.randomLook(j.seed, true, true); await c.ready; await wait(900); }
        if (j.preset) { const z = {}; for (const m of c.HEAD_MORPHS) z[m.id] = 0; c.S.face = { ...c.S.face, ...z, ...c.HEAD_PRESETS[j.preset] }; }
        c.S.shape.head = j.head; c.applyShape(); c.applySculptMorphs();
        c.bodyObj.parent.visible = true;
        // a calm standing frame of the guitar clip (head level, mouth closed), frozen
        c.play('Guitar_Playing'); c.mixer.stopAllAction(); const act = c.mixer.clipAction(c.mixer._actions.find((a) => a._clip.name === 'Guitar_Playing')._clip).reset(); act.play(); c.mixer.timeScale = 1; c.mixer.setTime(0.3); c.mixer.timeScale = 0;
        c.mixer.update(0); c.fixShapeAnimation(); for (const n of c.propNodes()) n.visible = false; for (const h of c.hairBones) h.b.quaternion.copy(h.restQ);
        c.bodyObj.parent.updateMatrixWorld(true);
        const p = c.headBone.getWorldPosition(new c.THREE.Vector3()), fwd = c.MOUTH.fwd.clone().transformDirection(c.headBone.matrixWorld); p.y += 0.06;
        c.camera.position.copy(p).addScaledVector(fwd, 0.7); c.camera.position.y += 0.02; c.camera.up.set(0, 1, 0); c.camera.aspect = tileW / tileH; c.camera.updateProjectionMatrix(); c.camera.lookAt(p);
        const r = c.renderer, w0 = r.domElement.width, h0 = r.domElement.height; r.setSize(tileW, tileH, false); r.render(c.scene, c.camera);
        const x = (i % cols) * tileW, y = Math.floor(i / cols) * tileH;
        g.drawImage(r.domElement, x, y, tileW, tileH);
        g.fillStyle = 'rgba(8,5,24,.8)'; g.fillRect(x, y + tileH - 22, tileW, 22);
        g.fillStyle = '#f1eeff'; g.font = '600 13px system-ui'; g.fillText(j.label + ' · ' + c.S.gender, x + 8, y + tileH - 7);
        r.setSize(w0, h0, false);
      }
      return sh.toDataURL('image/png').split(',')[1];
    }, { cols, tileW, tileH, jobs });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(b64, 'base64'));
    console.log('wrote', name);
  };

  const presets = ['soft', 'angular', 'broad', 'delicate', 'long', 'round'], sizes = [[0.2, 'small head'], [0.5, 'standard head'], [0.85, 'big head']];
  // presets: same character, same eye shape; only the morphs and head size change
  await sheet('heads-presets.png', 3, 300, 340, presets.flatMap((p) => sizes.map(([h, l]) => ({ preset: p, head: h, label: p + ' / ' + l }))));
  const seeds = [101, 2024, 31337, 4242, 555, 9001, 12345, 777, 8080, 60606, 271828, 161803];
  await sheet('heads-random.png', 4, 260, 300, seeds.map((s, i) => ({ seed: s, head: [0.3, 0.5, 0.7, 0.9][i % 4], label: 'seed ' + s })));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
