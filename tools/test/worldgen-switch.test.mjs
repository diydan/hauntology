import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { checkBase, run } from "../lib/worldgen-switch.mjs";

const TOKEN = "op-" + "k".repeat(40);

/** A local stand-in of the operator's routes that records what it was sent. */
async function server(handler) {
  const seen = [];
  const srv = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const entry = { method: req.method, url: req.url, auth: req.headers.authorization, body: Buffer.concat(chunks).toString() };
      seen.push(entry);
      handler(entry, res);
    });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${srv.address().port}`, seen, close: () => new Promise((r) => srv.close(r)) };
}
const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};
const OPEN = { worldGen: "open", reasons: [], killed: false, dayCapReached: false, totalCapReached: false };
const capture = () => {
  const out = { log: [], error: [] };
  return { out, io: { log: (t) => out.log.push(t), error: (t) => out.error.push(t) } };
};

test("status asks GET /admin/status with the token in the header only, and prints the switch", async () => {
  const s = await server((_, res) => json(res, 200, { ...OPEN, worldGen: "closed", reasons: ["kill_switch", "no_world_service_key"], dayCapReached: true }));
  try {
    const { out, io } = capture();
    assert.equal(await run([s.url, "status"], { ADMIN_TOKEN: TOKEN }, io), 0);
    assert.deepEqual(s.seen.map((x) => [x.method, x.url, x.auth, x.body]), [["GET", "/admin/status", `Bearer ${TOKEN}`, ""]]);
    assert.equal(out.log.join("\n"), "world making: CLOSED\n  because: kill_switch, no_world_service_key\n  the day cap is reached");
    assert.deepEqual(out.error, []);
  } finally {
    await s.close();
  }
});

test("close posts {on: true} and open posts {on: false}", async () => {
  const s = await server((_, res) => json(res, 200, OPEN));
  try {
    for (const [action, on] of [["close", true], ["open", false]]) {
      const { out, io } = capture();
      assert.equal(await run([s.url, action], { ADMIN_TOKEN: TOKEN }, io), 0);
      const last = s.seen.at(-1);
      assert.deepEqual([last.method, last.url, last.auth, JSON.parse(last.body)], ["POST", "/admin/kill", `Bearer ${TOKEN}`, { on }]);
      assert.equal(out.log.join("\n"), "world making: OPEN");
    }
  } finally {
    await s.close();
  }
});

test("takes the address from HAUNTOLOGY_URL when it is not given, and trims a token saved with a line break", async () => {
  const s = await server((_, res) => json(res, 200, OPEN));
  try {
    const { io } = capture();
    assert.equal(await run(["status"], { ADMIN_TOKEN: `${TOKEN}\n`, HAUNTOLOGY_URL: s.url }, io), 0);
    assert.equal(s.seen[0].auth, `Bearer ${TOKEN}`);
  } finally {
    await s.close();
  }
});

test("refuses to start without a token, an action or an address, and sends nothing", async () => {
  const s = await server((_, res) => json(res, 200, OPEN));
  try {
    for (const [argv, env] of [
      [[s.url, "status"], {}],
      [[s.url, "status"], { ADMIN_TOKEN: "   " }],
      [[s.url], { ADMIN_TOKEN: TOKEN }],
      [[s.url, "explode"], { ADMIN_TOKEN: TOKEN }],
      [["status"], { ADMIN_TOKEN: TOKEN }],
      [[], { ADMIN_TOKEN: TOKEN }],
      [["bogus"], { ADMIN_TOKEN: TOKEN, HAUNTOLOGY_URL: s.url }],
      [[s.url, "constructor"], { ADMIN_TOKEN: TOKEN }],
      [[s.url, "toString"], { ADMIN_TOKEN: TOKEN }],
      [["__proto__"], { ADMIN_TOKEN: TOKEN, HAUNTOLOGY_URL: s.url }],
    ]) {
      const { out, io } = capture();
      assert.equal(await run(argv, env, io), 1, JSON.stringify(argv));
      assert.equal(out.error.length, 1);
      assert.equal(out.log.length, 0);
    }
    assert.deepEqual(s.seen, []);
  } finally {
    await s.close();
  }
});

test("sends the token only over https, or http to a loopback address", () => {
  assert.deepEqual(checkBase("https://hauntology.example.workers.dev"), { ok: true, origin: "https://hauntology.example.workers.dev" });
  assert.deepEqual(checkBase("https://hauntology.example.workers.dev/some/path?x=1"), { ok: true, origin: "https://hauntology.example.workers.dev" });
  assert.equal(checkBase("http://127.0.0.1:8787").ok, true);
  assert.equal(checkBase("http://localhost:8787").ok, true);
  assert.equal(checkBase("http://[::1]:8787").ok, true);
  for (const bad of ["http://hauntology.example.workers.dev", "http://127.0.0.1.evil.example", "ftp://x.example", "https://user:pw@x.example", "https://:pw@x.example", "not a url", "", "//x.example", "http://10.0.0.5"]) {
    assert.equal(checkBase(bad).ok, false, bad);
  }
});

test("does not send the token to a plain http host, and says why", async () => {
  const { out, io } = capture();
  let called = false;
  const code = await run(["http://hauntology.example.workers.dev", "close"], { ADMIN_TOKEN: TOKEN }, { ...io, fetch: async () => { called = true; return new Response("{}"); } });
  assert.equal(code, 1);
  assert.equal(called, false);
  assert.match(out.error[0], /only over https/);
  assert.ok(!out.error.join("").includes(TOKEN));
});

test("does not follow a redirect, because it would carry the token to another host", async () => {
  const other = await server((_, res) => json(res, 200, OPEN));
  const s = await server((_, res) => { res.writeHead(302, { Location: `${other.url}/admin/status` }); res.end(); });
  try {
    const { out, io } = capture();
    assert.equal(await run([s.url, "status"], { ADMIN_TOKEN: TOKEN }, io), 1);
    assert.deepEqual(other.seen, []);
    assert.match(out.error[0], /HTTP 302/);
  } finally {
    await s.close();
    await other.close();
  }
});

test("says what a refusal means without printing anything the server sent, so a reply cannot echo the token", async () => {
  const cases = [
    [401, { ok: false, code: "unauthorized", echo: TOKEN }, /HTTP 401 \(unauthorized\)/],
    [404, "<html>Not Found</html>", /no operator routes there/],
    [502, { ok: false, code: "spend_guard_unavailable" }, /HTTP 502 \(spend_guard_unavailable\)/],
    [500, { ok: false, code: `bad ${TOKEN}` }, /HTTP 500$/],
    [200, { nothing: "useful" }, /HTTP 200$/],
  ];
  for (const [status, body, pattern] of cases) {
    const s = await server((_, res) => (typeof body === "string" ? (res.writeHead(status), res.end(body)) : json(res, status, body)));
    try {
      const { out, io } = capture();
      assert.equal(await run([s.url, "close"], { ADMIN_TOKEN: TOKEN }, io), 1, String(status));
      assert.match(out.error[0], pattern, String(status));
      assert.ok(!out.error.join("\n").includes(TOKEN), "the token is never printed");
      assert.deepEqual(out.log, []);
    } finally {
      await s.close();
    }
  }
});

test("does not take a refusal for success, whatever its body says", async () => {
  for (const status of [401, 403, 500, 502, 302]) {
    const s = await server((_, res) => json(res, status, OPEN));
    try {
      const { out, io } = capture();
      assert.equal(await run([s.url, "close"], { ADMIN_TOKEN: TOKEN }, io), 1, String(status));
      assert.deepEqual(out.log, [], String(status));
    } finally {
      await s.close();
    }
  }
});

test("says so when the Worker cannot be reached", async () => {
  const { out, io } = capture();
  assert.equal(await run(["http://127.0.0.1:1", "status"], { ADMIN_TOKEN: TOKEN }, io), 1);
  assert.deepEqual(out.error, ["could not reach the Worker"]);
});
