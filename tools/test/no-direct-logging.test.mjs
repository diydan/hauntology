import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Logging policy (world-pipeline 8.2, Requirement 10.3; `.kiro/steering/security-and-cost.md`: "Logs: ids, counters, error codes only").
 * A log line is made by `shared/src/log.ts` and written by `api/src/log.ts`, which keep only ids, codes, counters and yes/no. This test
 * keeps every other file honest: no source under `api/src` or `shared/src` may name `console` (the one allowed file is `api/src/log.ts`), so
 * there is no second way to write a request body, a prompt or a caption to a log. Test files may name it, to check that nothing leaks.
 * The stand-in of the world service (`api/dev/fake-world-api.mjs`) is a separate dev process, not the Worker, and is the one other exception.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SOURCE_DIRS = ["api/src", "api/dev", "shared/src"];
// The logger, and the test-only stand-in of the world service (`api/dev/fake-world-api.mjs`), a separate Node process that prints its own address; it is not part of the Worker.
const ALLOWED = /(^|\/)api\/src\/log\.ts$|(^|\/)api\/dev\/fake-world-api\.mjs$/;

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

/** The text with comments removed, so a comment that mentions the word is not a use of it. Strings are kept: a `"console"` is still a smell. */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"`\\])\/\/[^\n]*/g, "$1");

test("no source file under api/src, api/dev or shared/src names console, except the logger", () => {
  const found = [];
  for (const file of sources()) {
    if (ALLOWED.test(file)) continue;
    if (/\bconsole\b/.test(code(readFileSync(join(ROOT, file), "utf8")))) found.push(file);
  }
  assert.deepEqual(found, [], "log through api/src/log.ts (createLogger) and an event in shared/src/log.ts instead");
});

test("the scan reaches the logger, and the logger is the one place that writes to the console", () => {
  const files = sources();
  assert.ok(files.includes("api/src/log.ts"), "the logger is among the sources");
  assert.ok(files.includes("shared/src/log.ts"), "the policy is among the sources");
  assert.ok(files.length > 100, "a real scan");
  assert.match(code(readFileSync(join(ROOT, "api/src/log.ts"), "utf8")), /\bconsole\.log\(/);
  assert.doesNotMatch(code(readFileSync(join(ROOT, "shared/src/log.ts"), "utf8")), /\bconsole\b/);
});

test("the code stripper keeps a real use and drops a comment", () => {
  assert.match(code("const a = 1; console.log(a);"), /console/);
  assert.doesNotMatch(code("// console.log(a)\nconst a = 1;"), /console/);
  assert.doesNotMatch(code("/* console.log(a) */ const a = 1;"), /console/);
  assert.match(code("const u = 'http://x'; console.error(u);"), /console/);
});
