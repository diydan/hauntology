/**
 * A TEST-ONLY stand-in for the World Labs World API, for running the real adapter on `wrangler dev` without spending
 * (`node dev/fake-world-api.mjs <port>`; the check Worker is then started with `--var WORLD_API_BASE:http://127.0.0.1:<port>`
 * and `--var WLT_API_KEY:test-live-key`). It answers with the shapes in `shared/fixtures/worldlabs/docs-examples.json`
 * (copied from the documentation, not recorded), serves its files from itself over loopback, and logs what it was asked so a
 * test can check that the key went only to the API paths. Not a model of the real service: it only has what the adapter needs.
 *
 * The last byte of the picture picks what happens (the `salt` of `/dev/seed-image`): 201 the request is refused (422),
 * 202 there are no credits (402), 204 the world is never finished, anything else a full world after two polls.
 *
 * Its files exercise every way the adapter reads a file: `500k.spz` with a length, `100k.spz` chunked with none,
 * `full_res.spz` compressed in transit (so its length is not the file's), and a collider, a panorama and a thumbnail.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";

const KEY = "test-live-key";
const port = Number(process.argv[2]);
const examples = JSON.parse(readFileSync(new URL("../../shared/fixtures/worldlabs/docs-examples.json", import.meta.url), "utf8"));

/** Deterministic bytes, so the test can compare what came out of R2 with what was served. */
const make = (n, seed) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) % 251);
const FILES = {
  "500k.spz": { type: "application/octet-stream", bytes: make(2 * 1024 * 1024, 1), mode: "length" },
  "100k.spz": { type: "application/octet-stream", bytes: make(300_000, 2), mode: "chunked" },
  "full_res.spz": { type: "application/octet-stream", bytes: new Uint8Array(1024 * 1024).fill(7), mode: "gzip" },
  "collider.glb": { type: "model/gltf-binary", bytes: make(4096, 3), mode: "length" },
  "pano.png": { type: "image/png", bytes: make(8192, 4), mode: "length" },
  "thumb.jpg": { type: "image/jpeg", bytes: make(512, 5), mode: "length" },
};
const sha = (b) => createHash("sha256").update(b).digest("hex");
const EXPECT = Object.fromEntries(Object.entries(FILES).map(([n, f]) => [n, { bytes: f.bytes.length, sha256: sha(f.bytes) }]));

const ops = new Map(); // operation id -> { salt, polls }
const log = [];
let counter = 0;

const send = (res, status, body, headers = {}) => {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text), ...headers });
  res.end(text);
};

createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const hasKey = req.headers["wlt-api-key"] === KEY;
  if (url.pathname !== "/__log" && url.pathname !== "/__expect") log.push({ method: req.method, path: url.pathname, key: req.headers["wlt-api-key"] !== undefined ? (hasKey ? "right" : "wrong") : "none", auth: req.headers.authorization !== undefined });

  if (url.pathname === "/__log") return send(res, 200, log);
  if (url.pathname === "/__expect") return send(res, 200, EXPECT);

  const file = /^\/files\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (file !== null && req.method === "GET") {
    const f = FILES[file[2]];
    if (f === undefined) return send(res, 404, { detail: "no such file" });
    if (f.mode === "length") {
      res.writeHead(200, { "Content-Type": f.type, "Content-Length": f.bytes.length });
      return res.end(Buffer.from(f.bytes));
    }
    if (f.mode === "chunked") {
      res.writeHead(200, { "Content-Type": f.type });
      for (let i = 0; i < f.bytes.length; i += 65_536) res.write(Buffer.from(f.bytes.subarray(i, i + 65_536)));
      return res.end();
    }
    const gz = gzipSync(Buffer.from(f.bytes));
    res.writeHead(200, { "Content-Type": f.type, "Content-Encoding": "gzip", "Content-Length": gz.length });
    return res.end(gz);
  }

  if (!hasKey) return send(res, 401, { detail: "bad key" });

  if (req.method === "POST" && url.pathname === "/marble/v1/worlds:generate") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return send(res, 422, { detail: "bad json" }); }
      const prompt = body.world_prompt?.image_prompt;
      const ok = body.permission?.public === false && body.world_prompt?.type === "image" && prompt?.source === "data_base64" && typeof prompt.data_base64 === "string" && ["jpg", "png", "webp"].includes(prompt.extension) && typeof body.display_name === "string" && body.display_name.length <= 64;
      if (!ok) return send(res, 422, examples.error422);
      const image = Buffer.from(prompt.data_base64, "base64");
      const salt = image[image.length - 1];
      if (salt === 201) return send(res, 422, examples.error422);
      if (salt === 202) return send(res, 402, examples.error402);
      const id = `op-${++counter}-${Date.now().toString(36)}`;
      ops.set(id, { salt, polls: 0, model: body.model, name: body.display_name, extension: prompt.extension });
      return send(res, 200, { ...examples.generate, operation_id: id });
    });
    return;
  }

  const op = /^\/marble\/v1\/operations\/([^/]+)$/.exec(url.pathname);
  if (req.method === "GET" && op !== null) {
    const o = ops.get(op[1]);
    if (o === undefined) return send(res, 404, { detail: "no such operation" });
    o.polls++;
    if (o.salt === 204 || o.polls <= 2) return send(res, 200, { ...examples.operationInProgress, operation_id: op[1] });
    const base = `http://127.0.0.1:${port}/files/${op[1]}`;
    const done = structuredClone(examples.operationDone);
    done.operation_id = op[1];
    const a = done.response.assets;
    a.splats.spz_urls = { "500k": `${base}/500k.spz?sig=X`, "100k": `${base}/100k.spz?sig=X`, full_res: `${base}/full_res.spz?sig=X` };
    a.mesh.collider_mesh_url = `${base}/collider.glb?sig=X`;
    a.imagery.pano_url = `${base}/pano.png?sig=X`;
    a.thumbnail_url = `${base}/thumb.jpg?sig=X`;
    return send(res, 200, done);
  }

  return send(res, 404, { detail: "not here" });
}).listen(port, "127.0.0.1", () => console.log(`fake world api on ${port}`));
