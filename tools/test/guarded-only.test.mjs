import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * `.kiro/steering/security-and-cost.md`, paid calls, rule 1: the World Labs service is called only from modules under
 * `api/src/guarded/`, a Workers AI model is called (`env.AI.run(...)`) only from there too, and so is the Images binding's
 * background removal (`env.IMAGES.input(...)`, `segment: "foreground"`). No other source file may name its
 * host, its key header, its key or its start path, or call `ai.run` or the Images binding. (Test files may
 * name them, to check that none leaks.) A new file that does is a second way to spend: this test fails it.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SOURCE_DIRS = ["api/src", "api/dev", "shared/src", "web/src"];
// The adapter, and the test-only stand-in of the service (`api/dev/fake-world-api.mjs`), which answers calls and makes none.
const ALLOWED = /(^|\/)api\/src\/guarded\/|(^|\/)api\/dev\/fake-world-api\.mjs$/;
const NEEDLES = [/worldlabs\.ai/i, /WLT-Api-Key/i, /WLT_API_KEY/, /worlds:generate/i, /\bai\.run\s*\(/i, /\bimages\.input\s*\(/i, /segment\s*:\s*["']foreground/i];

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const path = join(dir, e.name);
    if (e.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const sources = () =>
  SOURCE_DIRS.flatMap((d) => [...walk(join(ROOT, d))])
    .map((f) => relative(ROOT, f))
    .filter((f) => /\.(ts|tsx|mjs|js)$/.test(f) && !/\.test\.(ts|tsx|mjs)$/.test(f));

test("no source file outside api/src/guarded names the World Labs host, key header, key or start path", () => {
  const found = [];
  for (const file of sources()) {
    if (ALLOWED.test(file)) continue;
    const text = readFileSync(join(ROOT, file), "utf8");
    for (const n of NEEDLES) if (n.test(text)) found.push(`${file}: ${n}`);
  }
  assert.deepEqual(found, []);
});

test("the scan reaches the adapter, so an empty result means something", () => {
  const files = sources();
  assert.ok(files.some((f) => f === "api/src/guarded/worldlabs-http.ts"), "the adapter is among the sources");
  const adapter = readFileSync(join(ROOT, "api/src/guarded/worldlabs-http.ts"), "utf8");
  assert.ok(NEEDLES.slice(0, 4).every((n) => n.test(adapter)), "the adapter names the host, the key header, the key and the start path");
  const scout = readFileSync(join(ROOT, "api/src/guarded/workersai/scout.ts"), "utf8");
  assert.ok(NEEDLES[4].test(scout), "the Scout adapter calls ai.run");
  for (const name of ["guard", "text", "image"]) {
    const text = readFileSync(join(ROOT, `api/src/guarded/workersai/${name}.ts`), "utf8");
    assert.ok(NEEDLES[4].test(text), `the ${name} adapter calls ai.run`);
  }
  const cutout = readFileSync(join(ROOT, "api/src/guarded/workersai/cutout.ts"), "utf8");
  assert.ok(NEEDLES[5].test(cutout) && NEEDLES[6].test(cutout), "the cut-out adapter calls the Images binding and asks for the foreground");
  assert.ok(files.length > 100, "a real scan");
});
