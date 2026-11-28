#!/usr/bin/env node
// A look check in a real headless Chrome (design-system 5, integration 8.3, songs 4.3, haunwallker 13.3): the app's demo flow at 390 and 1280 px, with
// the checks the shared-look tasks name: no sideways scroll, touch targets of at least 44 px, one solid yellow button per view, text contrast, a focus
// ring on every control reached by Tab, and no running animation when the visitor asks for reduced motion. It uses the Vite dev server of `web/` and
// the fake API of `?demo=1&zero=1`, so it makes no request to `/api/` and spends nothing; it needs Chrome (set CHROME, or it looks in the Playwright
// cache and /Applications) and nothing else: the protocol is spoken over a WebSocket by hand, so there is no new dependency.
//
//   node tools/ui-check.mjs            all stops, both widths, normal and reduced motion
//   node tools/ui-check.mjs --json     the findings as JSON
//
// Exit 0: nothing found. Exit 1: something found (listed). The checks live in `lib/ui-audit.mjs` (pure, tested without a browser).
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUDIT_SOURCE, summarize } from "./lib/ui-audit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = path.join(os.homedir(), "Library/Caches/ms-playwright");
  if (existsSync(base)) {
    for (const d of readdirSync(base).filter((x) => x.startsWith("chromium_headless_shell")).sort().reverse()) {
      for (const sub of readdirSync(path.join(base, d))) { const p = path.join(base, d, sub, "chrome-headless-shell"); if (existsSync(p)) return p; }
    }
  }
  const app = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (existsSync(app)) return app;
  throw new Error("no Chrome found: set CHROME");
}

async function startVite() {
  const port = await freePort();
  const bin = path.join(root, "web/node_modules/vite/bin/vite.js");
  const proc = spawn(process.execPath, [bin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: path.join(root, "web"), stdio: "ignore" });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch { /* not yet */ } await sleep(200); }
  return { origin: `http://127.0.0.1:${port}`, stop: () => proc.kill() };
}

async function startChrome() {
  const port = await freePort();
  const profile = path.join(process.env.KIROCREW_SCRATCH ?? os.tmpdir(), `ui-check-profile-${process.pid}`);
  const args = ["--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--no-first-run"];
  if (!/headless-shell/.test(findChrome())) args.push("--headless=new");
  const proc = spawn(findChrome(), [...args, "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch { /* not yet */ } await sleep(200); }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const calls = new Map();
  const listeners = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && calls.has(d.id)) { const c = calls.get(d.id); calls.delete(d.id); if (d.error) c.rej(new Error(d.error.message)); else c.res(d.result); } else for (const l of listeners) l(d);
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    const timer = setTimeout(() => { calls.delete(i); rej(new Error(`${method} got no answer in 30 s`)); }, 30_000);
    calls.set(i, { res: (v) => { clearTimeout(timer); res(v); }, rej: (e) => { clearTimeout(timer); rej(e); } });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send("Page.enable"); await send("Runtime.enable");
  // a page that asks "leave this page?" must not hold the run
  listeners.push((d) => { if (d.method === "Page.javascriptDialogOpening") void send("Page.handleJavaScriptDialog", { accept: true }).catch(() => undefined); });
  return { send, on: (fn) => listeners.push(fn), close: () => { try { ws.close(); } catch { /* ignore */ } proc.kill(); } };
}

const toHaunt = async (p) => {
  await p.goto("/?demo=1&zero=1");
  await p.clickText("a", "Visit a gallery place");
  await p.clickText("button", "Visit The attic room", 400);
};
const STOPS = [
  { name: "Home", go: (p) => p.goto("/?demo=1&zero=1") },
  { name: "Gallery", go: (p) => p.clickText("a", "Visit a gallery place") },
  { name: "Haunt", go: (p) => p.clickText("button", "Visit The attic room", 400) },
  { name: "Case setup", go: (p) => p.clickText("button", "Play a case") },
  { name: "Case", go: (p) => p.clickText("button", "Start", 600) },
  { name: "Case ending", go: (p) => p.clickText("button", "End the case", 400) },
  { name: "Wander (Play)", go: async (p) => { await toHaunt(p); await p.clickText("button", "Use a preset ghost"); await p.clickText("button", "Maren"); await p.clickText("button", "Wander"); await p.clickText("button", "Go in", 400); } },
  { name: "Wander ending", go: async (p) => {
    for (const n of [1, 2, 3]) {
      await p.evalJs(`(() => { const c = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Close chat'); if (c) c.click(); })()`);
      await sleep(200);
      await p.evalJs(`(() => { const re = /(Walk to|Back to) memory ${n}/; const b = [...document.querySelectorAll('button')].find((b) => re.test(b.getAttribute('aria-label') || b.textContent || '')); if (b) b.click(); })()`);
      await sleep(300);
      await p.clickText("button", "Talk");
      await p.clickText("button", "Look", 400);
    }
    await sleep(500);
  } },
  { name: "Wander journal", go: async (p) => { await toHaunt(p); await p.clickText("button", "Use a preset ghost"); await p.clickText("button", "Maren"); await p.clickText("button", "Wander"); await p.clickText("button", "Go in", 400); await p.clickText("button", "Journal", 400); } },
  { name: "Host (no Room)", go: (p) => p.goto("/host.html?demo=1") },
  { name: "Display (no Room)", go: (p) => p.goto("/display.html?demo=1") },
  { name: "Create (draw a place)", go: async (p) => { await p.goto("/?demo=1"); await p.clickText("a, button", "Draw a place", 600); } },
  { name: "Shared link (a Gallery place is not shared: the Expired screen)", go: (p) => p.goto("/shared/attic-room?demo=1&zero=1") },
  { name: "Not found", go: (p) => p.goto("/play/not%20a%20place?demo=1&zero=1") },
  { name: "Controller (stand-in Room)", go: (p) => p.goto("/controller-demo.html?code=K7M2") },
  { name: "Game songs (Master)", go: (p) => p.goto("/songs-demo.html") },
  { name: "Game songs (Player)", go: (p) => p.goto("/songs-demo.html?view=player") },
  { name: "Puzzles demo", go: (p) => p.goto("/puzzles-demo.html") },
];

async function page(chrome, origin, width, height, reduced) {
  const errors = [];
  chrome.on((d) => {
    if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails?.exception?.description ?? "exception");
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value ?? a.description).join(" "));
  });
  await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  if (width < 600) await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await chrome.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
  const evalJs = async (expression) => {
    const r = await chrome.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "evaluate failed");
    return r.result.value;
  };
  return {
    errors, evalJs,
    async goto(p) {
      const nav = await chrome.send("Page.navigate", { url: origin + p });
      if (nav.errorText) throw new Error(`navigation to ${origin + p} failed: ${nav.errorText}`);
      // the dev server compiles on first request: wait until the app has drawn something
      for (let i = 0; i < 100; i++) { await sleep(200); if (await evalJs("(document.getElementById('root')?.children.length ?? 0) > 0 && document.body.innerText.trim().length > 0").catch(() => false)) break; }
      await sleep(300);
    },
    async clickText(sel, text, wait = 300) {
      const ok = await evalJs(`(() => { const t = ${JSON.stringify(text)}; const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => (e.getAttribute('aria-label') || e.textContent || '').trim() === t || (e.textContent || '').trim().startsWith(t)); if (!el) return false; el.click(); return true; })()`);
      if (!ok) {
        const have = await evalJs(`[...document.querySelectorAll('a, button')].map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 40)).join(' | ')`);
        throw new Error(`no ${sel} with the text "${text}"; on the page: ${have}`);
      }
      await sleep(wait + 200);
    },
    async tab(n) {
      const seen = [];
      for (let i = 0; i < n; i++) {
        for (const type of ["keyDown", "keyUp"]) await chrome.send("Input.dispatchKeyEvent", { type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
        seen.push(await evalJs(`window.__uiAudit.focusState()`));
      }
      return seen;
    },
  };
}

async function main() {
  const asJson = process.argv.includes("--json");
  const vite = await startVite();
  const chrome = await startChrome();
  const findings = [];
  const requests = [];
  chrome.on((d) => { if (d.method === "Network.requestWillBeSent" && new URL(d.params.request.url).pathname.startsWith("/api/")) requests.push(d.params.request.url); });
  await chrome.send("Network.enable");
  try {
    const probe = process.argv.find((a) => a.startsWith("--probe="));
    if (probe) {
      const p = await page(chrome, vite.origin, 390, 844, false);
      await p.goto(probe.slice(8)).catch((e) => console.log("goto failed:", e.message));
      console.log(await p.evalJs("document.documentElement.outerHTML.slice(0, 700)"));
      console.log(await p.evalJs("document.body.innerText.slice(0, 600) + '\\n---\\n' + document.getElementById('root')?.innerHTML.slice(0, 300)"));
      console.log("errors:", p.errors);
      if (probe.includes("&audit")) {
        await p.evalJs(AUDIT_SOURCE);
        const a = await p.evalJs("window.__uiAudit.run()"); console.log(JSON.stringify({ ...a, contrast: `${a.contrast.length} text elements, lowest ${Math.min(...a.contrast.map((c) => c.ratio))}` }).slice(0, 1500));
        console.log(JSON.stringify(await p.tab(3)));
      }
      return;
    }
    for (const [width, height] of [[390, 844], [1280, 800]]) {
      for (const reduced of [false, true]) {
        const p = await page(chrome, vite.origin, width, height, reduced);
        const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
        for (const stop of STOPS.filter((x) => only === undefined || x.name.includes(only))) {
          try {
            if (process.env.UI_CHECK_VERBOSE) console.error(`[${width}px${reduced ? " reduced" : ""}] ${stop.name}`);
            await stop.go(p);
            await p.evalJs(AUDIT_SOURCE);
            const audit = await p.evalJs("window.__uiAudit.run()");
            const focus = reduced ? [] : await p.tab(10);
            const where = `${stop.name} at ${width}px${reduced ? " (reduced motion)" : ""}`;
            for (const f of summarize(audit, focus, { reduced })) findings.push({ where, ...f });
          } catch (e) { findings.push({ where: `${stop.name} at ${width}px`, kind: "error", detail: String(e.message ?? e) }); }
        }
        for (const e of p.errors) findings.push({ where: `${width}px`, kind: "console-error", detail: e.slice(0, 200) });
      }
    }
    for (const u of requests) findings.push({ where: "network", kind: "api-request", detail: u });
  } finally { chrome.close(); vite.stop(); if (process.argv.some((a) => a.startsWith('--probe='))) process.exit(0); }
  if (asJson) console.log(JSON.stringify(findings, null, 2));
  else {
    for (const f of findings) console.log(`${f.where}: ${f.kind}: ${f.detail}`);
    console.log(findings.length === 0 ? "ui-check: nothing found" : `ui-check: ${findings.length} finding(s)`);
  }
  process.exit(findings.length === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
