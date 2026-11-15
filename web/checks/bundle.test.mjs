import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Task 10.2 (Requirements 9.1, 9.2, 9.4, 9.5, 10.1, 11.3): this builds the shell the way production does
 * and reads what came out. It fails if Home's first JavaScript is over 150 KB gzipped, if the demo API or
 * `console.log` is in the build, if an origin outside the allow-list is named anywhere in it, if the page has
 * an inline script, or if `dangerouslySetInnerHTML` is in the source. It runs in `pnpm test`, so the build
 * breaks when any of these does. It builds into a temporary folder and never touches `web/dist`.
 */
const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOME_LIMIT_BYTES = 150 * 1024;

/**
 * The only origins that may be named in the built files:
 * - `www.w3.org` is the XML and SVG namespace name, an identifier and not an address that is fetched;
 * - `react.dev` is in React's own error messages, as text;
 * - `challenges.cloudflare.com` is Turnstile, which the Confirm Gate loads on demand (and the page policy
 *   allows only when it is configured).
 */
const ALLOWED_ORIGINS = ["challenges.cloudflare.com", "react.dev", "www.w3.org"];

let out;
let html;
const files = {};

const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));

beforeAll(() => {
  out = mkdtempSync(join(tmpdir(), "hauntology-bundle-"));
  const vite = join(dirname(createRequire(import.meta.url).resolve("vite/package.json")), "bin", "vite.js");
  execFileSync(process.execPath, [vite, "build", "--outDir", out, "--emptyOutDir", "--logLevel", "error"], {
    cwd: WEB, timeout: 180_000, stdio: "pipe",
    // Vitest sets NODE_ENV to "test", which Vite would keep: it would build React for development and leave the demo in. A production build is a production one.
    env: { ...process.env, NODE_ENV: "production" },
  });
  html = readFileSync(join(out, "index.html"), "utf8");
  for (const f of walk(out)) {
    if (/\.(js|css|html)$/.test(f)) files[relative(out, f)] = readFileSync(f, "utf8");
  }
}, 200_000);

afterAll(() => {
  if (out) rmSync(out, { recursive: true, force: true });
});

const scripts = () => Object.entries(files).filter(([name]) => name.endsWith(".js"));
const gzipped = (text) => gzipSync(Buffer.from(text, "utf8"), { level: 9 }).length;

/** The files the browser fetches before Home can draw: what the page names, and what those import by name (not what they import on demand). */
function initialScripts() {
  const entry = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  const preload = [...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set();
  const queue = [...entry, ...preload].map((p) => p.replace(/^\//, ""));
  while (queue.length > 0) {
    const name = queue.pop();
    if (seen.has(name) || files[name] === undefined) continue;
    seen.add(name);
    for (const m of files[name].matchAll(/\bfrom\s*["'](\.\/[^"']+)["']|(?:^|[;}\s])import\s*["'](\.\/[^"']+)["']/g)) {
      queue.push(join(dirname(name), m[1] ?? m[2]));
    }
  }
  return [...seen];
}

describe("the production build", () => {
  it("builds, with an entry page that names one module script", () => {
    expect(html).toContain('<div id="root"></div>');
    expect([...html.matchAll(/<script[^>]*\stype="module"/g)]).toHaveLength(1);
    expect(scripts().length).toBeGreaterThan(3);
  });

  it("keeps Home's first JavaScript under 150 KB gzipped (Requirement 10.1)", () => {
    const initial = initialScripts();
    expect(initial.length).toBeGreaterThan(0);
    const bytes = initial.reduce((sum, n) => sum + gzipped(files[n]), 0);
    expect(bytes, `${initial.join(", ")} is ${(bytes / 1024).toFixed(1)} KB gzipped`).toBeLessThan(HOME_LIMIT_BYTES);
  });

  it("loads Play, Create and the case only when they are opened: their code is in their own files, not in the first one", () => {
    const initial = new Set(initialScripts());
    const only = { "Opening the door…": "Play", "Pick the one that feels right": "Create", "Setting the scene…": "the Case Screen", "Stand-in view.": "the Viewer" };
    for (const [marker, who] of Object.entries(only)) {
      const holders = scripts().filter(([, text]) => text.includes(marker)).map(([name]) => name);
      expect(holders.length, `${who} (${marker}) is in some file`).toBeGreaterThan(0);
      for (const name of holders) expect(initial.has(name), `${who} is in a file Home loads first: ${name}`).toBe(false);
    }
  });

  it("does not carry the demo: no fake API, no demo Turnstile, no demo pictures, no demo folder", () => {
    for (const [name, text] of scripts()) {
      for (const marker of ["FakeApi", "createFakeBackend", "Demo fixture", "demo-img", "Pass the check (demo)", "demo-turnstile-token", "/demo/gallery"]) {
        expect(text.includes(marker), `${name} contains ${marker}`).toBe(false);
      }
    }
    expect(existsSync(join(out, "demo"))).toBe(false);
  });

  it("has no console.log, console.debug or console.info (Requirement 9.5)", () => {
    for (const [name, text] of scripts()) expect(/console\.(log|debug|info)\s*\(/.test(text), name).toBe(false);
  });

  it("names no origin outside the allow-list, in script, style or page (Requirements 9.1 and 9.4)", () => {
    const found = new Set();
    for (const text of Object.values(files)) {
      for (const m of text.matchAll(/\b(?:https?|wss?):\/\/([A-Za-z0-9.-]+)/g)) found.add(m[1]);
      // A protocol-relative address in a string or a stylesheet would be fetched from elsewhere too.
      for (const m of text.matchAll(/["'(]\/\/([A-Za-z0-9-]+\.[A-Za-z0-9.-]+)/g)) found.add(m[1]);
    }
    expect([...found].filter((o) => !ALLOWED_ORIGINS.includes(o)).sort()).toEqual([]);
    // And the one that is allowed to be fetched is named only by the Turnstile loader.
    const holders = scripts().filter(([, text]) => text.includes("challenges.cloudflare.com")).length;
    expect(holders).toBeGreaterThan(0);
  });

  it("has no inline script, no inline style and no remote stylesheet or font in the page (Requirement 9.1)", () => {
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
    expect(html).not.toMatch(/\sstyle\s*=/);
    expect(html).not.toMatch(/<style[\s>]/);
    expect(html).not.toMatch(/(?:href|src)="(?:https?:)?\/\//);
    for (const [name, text] of Object.entries(files).filter(([n]) => n.endsWith(".css"))) {
      expect(/@import|url\(\s*["']?(?:https?:)?\/\//.test(text), name).toBe(false);
    }
  });

  it("has no eval and no Function constructor in the shell's own code, which a strict policy would refuse", () => {
    // The shell's code is in the entry and the Screens' files; a library may mention `new Function` in a branch it never takes.
    const own = scripts().filter(([name]) => /^assets\/(index|Play|Create|Case|standin|creator-standin)/.test(name));
    expect(own.length).toBeGreaterThan(3);
    for (const [name, text] of own) expect(/[^.\w]eval\s*\(/.test(text), name).toBe(false);
  });
});

describe("the source", () => {
  it("never uses dangerouslySetInnerHTML (Requirement 9.2)", () => {
    const sources = walk(join(WEB, "src")).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith("lint.test.ts"));
    expect(sources.length).toBeGreaterThan(50);
    const hits = sources.filter((f) => readFileSync(f, "utf8").includes("dangerouslySetInnerHTML")).map((f) => relative(WEB, f));
    expect(hits).toEqual([]);
  });
});
