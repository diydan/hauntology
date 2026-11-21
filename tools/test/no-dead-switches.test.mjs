import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * integration 7.3 and Requirement 7.3: "a cut layer SHALL leave no dead switch or screen behind". Every switch the Room accepts from the Master (the
 * keys of the `settings` and `roomSettings` messages in `shared/src/party/protocol.ts`) must have a control on the phone that sends it, and the
 * Room must read it somewhere. A switch with no control is a layer nobody can turn on; a control for a key the Room ignores is a dead switch.
 *
 * KNOWN_GAPS lists a switch that is missing its control today, with the task that owns it. A gap that closes fails the test until it is taken off the list.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), "utf8");

function* walk(dir) {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const path = join(dir, e.name);
    if (e.isDirectory()) yield* walk(path);
    else yield path;
  }
}
const nonTest = (f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f);

const KNOWN_GAPS = new Map([["selfies", "party-mode 9.24: the Master's selfies switch is still to be built in the menu"]]);

/** The top-level keys of one message in the protocol: the text of its `z.object({ ... })`, read by matching braces so a nested object's keys are not counted. */
function keysOf(protocol, t) {
  const at = protocol.indexOf(`t: z.literal("${t}")`);
  assert.ok(at > 0, `${t} is in the protocol`);
  const open = protocol.lastIndexOf("z.object({", at) + "z.object(".length;
  let depth = 0;
  let end = open;
  for (let i = open; i < protocol.length; i++) {
    const c = protocol[i];
    if (c === "{" || c === "(" || c === "[") depth++;
    if (c === "}" || c === ")" || c === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = protocol.slice(open + 1, end).replace(/\/\*\*[\s\S]*?\*\//g, "");
  const keys = [];
  let d = 0;
  let word = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "{" || c === "(" || c === "[") d++;
    else if (c === "}" || c === ")" || c === "]") d--;
    else if (d === 0 && c === ":" && /^[a-zA-Z]+$/.test(word) && word !== "t") { keys.push(word); word = ""; continue; }
    if (d === 0 && /[a-zA-Z]/.test(c)) word += c;
    else if (d === 0) word = "";
  }
  return keys;
}

const protocol = read("shared/src/party/protocol.ts");
const SWITCHES = [...keysOf(protocol, "settings").map((k) => ["settings", k]), ...keysOf(protocol, "roomSettings").map((k) => ["roomSettings", k])];

const controller = [...walk("web/src/party/controller")].filter(nonTest).map((f) => [f, read(f)]);
const roomSide = [...walk("shared/src/party")].filter(nonTest).filter((f) => !/protocol\.ts$/.test(f)).map((f) => [f, read(f)]);
const cap = (k) => k[0].toUpperCase() + k.slice(1);

/** How a control sends a key: `set({ key`, `room({ key`, a port setter (`setKey`), or a message built with the key. */
const sends = (k) => {
  const re = new RegExp(`(?:\\bset|\\broom)\\(\\{\\s*${k}\\s*[,}:]|\\bset${cap(k)}\\b|\\{\\s*t:\\s*"(?:settings|roomSettings)",\\s*${k}\\s*[,}:]`);
  return controller.some(([, text]) => re.test(text));
};
/** How the Room reads a key: `settings.key`, `switches.key`, `.key` after either, or `raw.key` where the switches are read. */
const reads = (k) => {
  const re = new RegExp(`(?:settings|switches|raw|cur|x\\.switches|s\\.settings)\\??\\.${k}\\b|\\b${k}\\s*:\\s*bool\\(raw|\\b${k}\\??:`);
  return roomSide.some(([, text]) => re.test(text));
};

test("the protocol still has the switches this test reads (so it cannot pass by finding nothing)", () => {
  const keys = SWITCHES.map(([, k]) => k);
  for (const must of ["preset", "nudges", "frames", "sounds", "puzzles", "cluePlace", "errands", "hourStrike", "lightBar", "rattle", "stitch"]) assert.ok(keys.includes(must), must);
  assert.ok(SWITCHES.length >= 16, `${SWITCHES.length} switches`);
});

for (const [message, key] of SWITCHES) {
  test(`${message}.${key}: a control on the phone sends it, and the Room reads it`, () => {
    if (KNOWN_GAPS.has(key)) {
      assert.ok(!sends(key), `${key} now has a control: take it off KNOWN_GAPS (${KNOWN_GAPS.get(key)})`);
      assert.ok(reads(key), `${key} is not read by the Room`);
      return;
    }
    assert.ok(sends(key), `no control in web/src/party/controller sends ${message}.${key}`);
    assert.ok(reads(key), `nothing in shared/src/party reads ${key}`);
  });
}

test("the check can disagree: a made-up switch has neither a control nor a reader", () => {
  assert.equal(sends("zzNoSuchSwitch"), false);
  assert.equal(reads("zzNoSuchSwitch"), false);
});

test("the gaps listed are real switches of the protocol", () => {
  const keys = new Set(SWITCHES.map(([, k]) => k));
  for (const k of KNOWN_GAPS.keys()) assert.ok(keys.has(k), `${k} is not a switch any more: take it off KNOWN_GAPS`);
  assert.ok(relative(ROOT, ROOT) === "");
});
