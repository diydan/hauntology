import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The privacy and outside-host rules of the `conditions` spec (tasks 3.6; Requirements 1.2 and 1.3; design, "Privacy" and "Testing strategy"; `.kiro/steering/security-and-cost.md`,
 * "Place privacy"): Open-Meteo is an outside host, so exactly one module (`api/src/conditions/open-meteo.ts`) may name it; no place is ever derived from the request (nothing
 * reads `request.cf` or a location header); and nothing under `api/src/conditions/` logs anything but its three counters, so a query, a position or a label cannot reach a log line.
 * Test files may name a host, to check that none leaks. A new file that breaks a rule fails here.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SOURCE_DIRS = ["api/src", "api/dev", "shared/src", "web/src"];
const THE_ONE_MODULE = "api/src/conditions/open-meteo.ts";

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
    .filter((f) => /\.(ts|tsx|mjs|js)$/.test(f) && !/\.test\.(ts|tsx|mjs)$/.test(f) && !/\.(prop|fixture)\.ts$/.test(f) && !/(^|\/)[^/]*-kit\.ts$/.test(f));
/** The text with comments removed, so a comment that mentions a host is not a use of it. Strings are kept. */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"`\\])\/\/[^\n]*/g, "$1");
const read = (file) => code(readFileSync(join(ROOT, file), "utf8"));

// The hosts a call goes to, and the paths of the three calls. The credit line the free tier asks for (a link to open-meteo.com in the app's credits) is not a call, so it is allowed anywhere.
const HOST_NEEDLES = [/api\.open-meteo\.com/i, /archive-api\.open-meteo/i, /geocoding-api\.open-meteo/i, /open-meteo\.com\/v1\//i, /\bPUBLIC_HOSTS\b/];

test("no source file but api/src/conditions/open-meteo.ts names an Open-Meteo host", () => {
  const found = [];
  for (const file of sources()) {
    if (file === THE_ONE_MODULE) continue;
    const text = read(file);
    for (const n of HOST_NEEDLES) if (n.test(text)) found.push(`${file}: ${n}`);
  }
  assert.deepEqual(found, [], "weather is read only through api/src/conditions/open-meteo.ts");
});

test("the one module does name the hosts, and the scan reaches api, shared and web", () => {
  assert.match(read(THE_ONE_MODULE), /api\.open-meteo\.com/);
  assert.match(read(THE_ONE_MODULE), /archive-api\.open-meteo\.com/);
  assert.match(read(THE_ONE_MODULE), /geocoding-api\.open-meteo\.com/);
  const files = sources();
  for (const dir of ["api/src/", "shared/src/", "web/src/"]) assert.ok(files.some((f) => f.startsWith(dir)), dir);
  assert.ok(files.includes("api/src/conditions/snapshot-store.ts"));
  assert.ok(files.length > 200);
});

// A place may come only from what the visitor chose or shared on a tap, rounded; never from the request's own metadata.
const LOCATION_NEEDLES = [/\brequest\.cf\b/, /\bc\.req\.raw\.cf\b/, /\.cf\s*\??\.\s*(latitude|longitude|city|region|country|postalCode|timezone|metroCode|continent|colo)/, /\bcf\?\./, /cf-ip(city|country|latitude|longitude|region|timezone|continent)/i, /x-forwarded-for/i, /\bgetCurrentPosition\b/];

test("nothing in api or shared derives a place from the request or the network address, or asks the browser for a position", () => {
  const found = [];
  for (const file of sources().filter((f) => f.startsWith("api/src/") || f.startsWith("shared/src/"))) {
    const text = read(file);
    for (const n of LOCATION_NEEDLES) if (n.test(text)) found.push(`${file}: ${n}`);
  }
  assert.deepEqual(found, []);
});

test("nothing under api/src/conditions reads the request's own location or handles a request at all", () => {
  for (const file of sources().filter((f) => f.startsWith("api/src/conditions/"))) {
    const text = read(file);
    assert.doesNotMatch(text, /\.cf\b/, file);
    assert.doesNotMatch(text, /\bcf-/i, file);
    assert.doesNotMatch(text, /\bRequest\b/, `${file} handles no request: it is given a choice and returns a snapshot`);
  }
});

test("everything under api/src/conditions that logs, logs the one counter event and passes only its three fields", () => {
  const events = [];
  for (const file of sources().filter((f) => f.startsWith("api/src/conditions/"))) {
    const text = read(file);
    assert.doesNotMatch(text, /\bconsole\b/, file);
    for (const m of text.matchAll(/\blog\.(?:info|warn|error)\(\s*("[^"]*"|[^,)]*)\s*(?:,\s*(\{[^}]*\}))?/g)) {
      events.push(`${file}: ${m[1]}`);
      assert.equal(m[1], '"conditions.read"', `${file} logs ${m[1]}`);
      const keys = [...(m[2] ?? "").matchAll(/(\w+)\s*:/g)].map((k) => k[1]);
      assert.deepEqual(keys, ["source", "reason", "cache"], `${file} passes ${keys}`);
    }
  }
  assert.ok(events.length >= 1, "the scan sees the one log call");
});

test("the log event's fields are words and a yes/no: the schema has no place for a coordinate, a label, a date or a query", () => {
  const schema = readFileSync(join(ROOT, "shared/src/log.ts"), "utf8");
  const line = schema.split("\n").find((l) => l.includes('"conditions.read"'));
  assert.ok(line, "the event is in the schema");
  assert.match(line, /\{\s*source:\s*"word",\s*reason:\s*"word",\s*cache:\s*"bool"\s*\}/);
});

test("no answer of the conditions code carries an upstream host: the parsers keep named fields only", () => {
  const answers = read("shared/src/conditions/open-meteo-answers.ts");
  assert.doesNotMatch(answers, /\bhost\b|\burl\b|api_host|\.\.\.\s*r\.data|\.\.\.\s*json/i);
  const store = read("api/src/conditions/snapshot-store.ts");
  assert.doesNotMatch(store, /\.\.\.\s*raw\b/);
});

test("the detector catches what it should: a host, a request location and a stray log call", () => {
  assert.match(code('const u = "https://api.open-meteo.com/v1";'), HOST_NEEDLES[0]);
  assert.match(code('fetch("https://weather.example/open-meteo.com/v1/forecast")'), HOST_NEEDLES[3]);
  assert.doesNotMatch(code("// see api.open-meteo.com\nconst a = 1;"), HOST_NEEDLES[0]);
  assert.ok(!HOST_NEEDLES.some((n) => n.test(code('const credit = "Weather data by Open-Meteo.com"; const link = "https://open-meteo.com/";'))), "a credit line is not a call");
  assert.match(code("const c = request.cf.city;"), LOCATION_NEEDLES[0]);
  assert.match(code("const c = req?.cf?.latitude;"), LOCATION_NEEDLES[3]);
  assert.match(code("log.info('conditions.read', { lat: 1 })"), /\blog\.info\(/);
});
