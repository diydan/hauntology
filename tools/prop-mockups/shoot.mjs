// Screenshots every mockup in a headless Chrome over CDP, collecting console errors.
//   node tools/prop-mockups/shoot.mjs mockups [slug-prefix]   -> shots/<slug>.png
//   node tools/prop-mockups/shoot.mjs sheets                  -> shots/sheet-N.png (4 per sheet)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const dirs = fs.readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell')).sort().reverse();
  for (const d of dirs) {
    for (const sub of fs.readdirSync(path.join(base, d))) {
      const p = path.join(base, d, sub, 'chrome-headless-shell');
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error('no headless chrome found; set CHROME');
}

async function launch(port) {
  const proc = spawn(findChrome(), ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + port,
    '--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--in-process-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) break; } catch { /* retry */ }
    await sleep(200);
  }
  const t = await (await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const calls = new Map(); const listeners = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && calls.has(d.id)) { const c = calls.get(d.id); calls.delete(d.id); d.error ? c.rej(new Error(d.error.message)) : c.res(d.result); }
    else listeners.forEach((l) => l(d));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; calls.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const on = (fn) => { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); };
  await send('Page.enable'); await send('Runtime.enable');
  return { send, on, close: () => { try { ws.close(); } catch { /* ignore */ } proc.kill(); } };
}

async function shot(c, url, out, w, h, useShot, opts = {}) {
  const errors = [];
  const off = c.on((d) => {
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value || a.description).join(' '));
  });
  await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!opts.mobile });
  let loaded; const lp = new Promise((r) => { loaded = r; });
  const off2 = c.on((d) => { if (d.method === 'Page.loadEventFired') loaded(); });
  await c.send('Page.navigate', { url });
  await Promise.race([lp, sleep(8000)]);
  off2();
  await sleep(500);
  if (useShot) {
    const r = await c.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__mock && window.__mock.shot)', returnByValue: true });
    const s = r.result.value && JSON.parse(r.result.value);
    if (s) {
      for (const b of s.before || []) {
        await c.send('Runtime.evaluate', { expression: 'window.__mock.fire(' + JSON.stringify(b) + ')' });
        await sleep(350);
      }
      await c.send('Runtime.evaluate', { expression: 'window.__mock.fire(' + JSON.stringify(s.event) + ')' });
      await sleep(s.wait || 1000);
    }
  }
  if (opts.overflow) {
    const r = await c.send('Runtime.evaluate', { expression: 'JSON.stringify({sw: document.documentElement.scrollWidth, iw: window.innerWidth})', returnByValue: true });
    const o = JSON.parse(r.result.value);
    if (o.sw > o.iw + 1) errors.push('horizontal overflow: page is ' + o.sw + ' px wide in a ' + o.iw + ' px viewport');
  }
  if (opts.scrollY) { await c.send('Runtime.evaluate', { expression: 'window.scrollTo(0,' + opts.scrollY + ')' }); await sleep(250); }
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  off();
  return errors;
}

const mode = process.argv[2] || 'mockups';
const c = await launch(Number(process.env.SHOOT_PORT) || 9517 + (process.pid % 300));
try {
  if (mode === 'mockups') {
    const prefix = process.argv[3] || '';
    const files = fs.readdirSync(path.join(here, 'mockups')).filter((f) => f.endsWith('.html') && f.startsWith(prefix)).sort();
    let bad = 0;
    for (const f of files) {
      const slug = f.replace(/\.html$/, '');
      const errs = await shot(c, pathToFileURL(path.join(here, 'mockups', f)).href, path.join(here, 'shots', slug + '.png'), 1100, 800, true);
      if (errs.length) bad++;
      console.log((errs.length ? 'ERR ' : 'ok  ') + slug + (errs.length ? '\n     ' + [...new Set(errs)].join('\n     ') : ''));
    }
    console.log(bad ? bad + ' mockup(s) with errors' : 'all ' + files.length + ' clean');
  } else if (mode === 'phone') {
    // 390 x 844 phone viewport: reports horizontal overflow and saves shots/phone-<slug>.png scrolled to show the sticky stage
    const want = (process.argv[3] || '').split(',').filter(Boolean);
    const files = fs.readdirSync(path.join(here, 'mockups')).filter((f) => f.endsWith('.html') && (!want.length || want.some((w) => f.startsWith(w)))).sort();
    let bad = 0;
    for (const f of files) {
      const slug = f.replace(/\.html$/, '');
      const errs = await shot(c, pathToFileURL(path.join(here, 'mockups', f)).href, path.join(here, 'shots', 'phone-' + slug + '.png'), 390, 844, true, { mobile: true, scrollY: 520, overflow: true });
      if (errs.length) bad++;
      console.log((errs.length ? 'ERR ' : 'ok  ') + 'phone ' + slug + (errs.length ? '\n     ' + [...new Set(errs)].join('\n     ') : ''));
    }
    console.log(bad ? bad + ' page(s) with problems at phone size' : 'all ' + files.length + ' fit a phone');
  } else if (mode === 'index') {
    await shot(c, pathToFileURL(path.join(here, 'index.html')).href, path.join(here, 'shots', 'index.png'), 1280, 1500, false);
    console.log('index.png');
  } else {
    const want = (process.argv[3] || '').split(',').filter(Boolean), pre = process.argv[4] || 'sheet';
    const pngs = fs.readdirSync(path.join(here, 'shots')).filter((f) => /^\d\d-.*\.png$/.test(f) && (!want.length || want.some((w) => f.startsWith(w)))).sort();
    const per = 4; let n = 0;
    for (let i = 0; i < pngs.length; i += per) {
      n++;
      const items = pngs.slice(i, i + per).map((p) => '<figure><img src="' + p + '"><figcaption>' + p.replace(/\.png$/, '') + '</figcaption></figure>').join('');
      const html = '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#0d0b12;color:#ebe6f5;font:15px sans-serif}.g{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:14px;width:1500px}figure{margin:0}img{width:100%;display:block;border-radius:10px;border:1px solid #2d2641}figcaption{padding:4px 2px;color:#9b92ae}</style><div class="g">' + items + '</div>';
      const hp = path.join(here, 'shots', pre + '-' + n + '.html');
      fs.writeFileSync(hp, html);
      await shot(c, pathToFileURL(hp).href, path.join(here, 'shots', pre + '-' + n + '.png'), 1500, 1250, false);
      fs.unlinkSync(hp);
      console.log(pre + '-' + n + '.png');
    }
  }
} finally { c.close(); }
