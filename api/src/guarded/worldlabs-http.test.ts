import { describe, expect, it } from "vitest";
import examples from "../../../shared/fixtures/worldlabs/docs-examples.json";
import recordedDraft from "../../../shared/fixtures/worldlabs/marble-1.0-draft-20261116-212208.json";
import recordedStandard from "../../../shared/fixtures/worldlabs/marble-1.1-20261116-212757.json";
import { WorldManifestSchema } from "@hauntology/shared/world/manifest";
import { FakeR2 } from "../worlds/fake-cloudflare";
import { WorldIngestor } from "../worlds/ingest";
import type { SourceAsset } from "../worlds/ports";
import { generateWorld, pollWorld } from "./worldlabs";
import {
  BUFFERED_LIMIT, DEFAULT_MODEL, HttpWorldLabs, MAX_IMAGE_BYTES, MODELS, WORLD_API_BASE, acceptableAssetUrl, checkBase, imageFormatOf, readWorld,
} from "./worldlabs-http";

/**
 * The adapter over examples taken from the World Labs documentation (`shared/fixtures/worldlabs/docs-examples.json`)
 * and over the two worlds recorded by Spike 1.1 (2026-11-16, addresses scrubbed and put back as examples in the
 * "recorded worlds" tests). Nothing here talks to the service: a scripted `fetch` answers.
 */

const KEY = "wlt_test_KEY_0123456789";
const OP = "20bffbb1-4ba7-453f-a116-93eab1a6843e";
const A = "https://cdn.example.test/w/dc2c65e4";

type Seen = { url: string; method: string; headers: Headers; body: string | undefined; init: RequestInit };
type Reply = Response | Error | ((seen: Seen) => Response | Promise<Response>);

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const bytes = (n: number, v = 7): Uint8Array => new Uint8Array(n).fill(v);
const stream = (chunks: Uint8Array[], onCancel?: () => void): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const x of chunks) c.enqueue(x);
      c.close();
    },
    cancel: () => onCancel?.(),
  });

/** A `fetch` that answers from a queue, in order, and keeps what it was asked. */
function scripted(...replies: Reply[]) {
  const seen: Seen[] = [];
  const queue = [...replies];
  const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const s: Seen = { url: String(input), method: init.method ?? "GET", headers, body: typeof init.body === "string" ? init.body : undefined, init };
    seen.push(s);
    const next = queue.shift();
    if (next === undefined) throw new Error("no more replies");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(s) : next;
  }) as typeof fetch;
  return { fetcher, seen };
}

const make = (opts: Partial<ConstructorParameters<typeof HttpWorldLabs>[0]> = {}, ...replies: Reply[]) => {
  const f = scripted(...replies);
  return { ...f, api: new HttpWorldLabs({ apiKey: KEY, fetch: f.fetcher, ...opts }) };
};

const PHOTO = { image: Uint8Array.from([1, 2, 3, 250, 251, 252]), contentType: "image/jpeg", name: "w-aaaaaaaaaaaaaaaaaaaaaa" };
const mutate = <T>(v: T, f: (copy: any) => void): T => {
  const copy = structuredClone(v);
  f(copy);
  return copy;
};

describe("generate", () => {
  it("starts a world with the documented request: private, inline, the world's own id as its name, no text from the visitor", async () => {
    const t = make({}, json(examples.generate));
    expect(await t.api.generate(PHOTO)).toEqual({ ok: true, operationId: examples.generate.operation_id });
    expect(t.seen).toHaveLength(1);
    const s = t.seen[0]!;
    expect(s.url).toBe("https://api.worldlabs.ai/marble/v1/worlds:generate");
    expect(s.method).toBe("POST");
    expect(s.headers.get("WLT-Api-Key")).toBe(KEY);
    expect(s.headers.get("Content-Type")).toBe("application/json");
    const body = JSON.parse(s.body!);
    expect(Object.keys(body).sort()).toEqual(["display_name", "model", "permission", "world_prompt"]);
    expect(body.display_name).toBe("w-aaaaaaaaaaaaaaaaaaaaaa");
    expect(body.model).toBe("marble-1.1");
    expect(body.permission).toEqual({ public: false, allow_id_access: false, allowed_readers: [], allowed_writers: [] });
    expect(body.world_prompt).toEqual({
      type: "image",
      image_prompt: { source: "data_base64", data_base64: btoa(String.fromCharCode(1, 2, 3, 250, 251, 252)), extension: "jpg" },
      is_pano: "auto",
    });
    // No text prompt, tags or seed.
    expect(body.world_prompt).not.toHaveProperty("text_prompt");
    expect(body).not.toHaveProperty("tags");
  });

  it("fits the request schema of the OpenAPI file: a name of at most 64 characters, a known model, an image prompt with data_base64 and a bare extension", async () => {
    const t = make({}, json(examples.generate));
    await t.api.generate({ ...PHOTO, name: "n".repeat(200) });
    const body = JSON.parse(t.seen[0]!.body!);
    expect(body.display_name).toHaveLength(64);
    expect(MODELS).toContain(body.model);
    expect(["auto", true, false]).toContain(body.world_prompt.is_pano);
    expect(body.world_prompt.image_prompt.extension).not.toMatch(/\./);
    expect(typeof body.world_prompt.image_prompt.data_base64).toBe("string");
  });

  it("sends a picture that is bigger than one chunk of the encoder, byte for byte", async () => {
    const image = Uint8Array.from({ length: 100_003 }, (_, i) => (i * 31) % 256);
    const t = make({}, json(examples.generate));
    await t.api.generate({ ...PHOTO, image });
    const sent = atob(JSON.parse(t.seen[0]!.body!).world_prompt.image_prompt.data_base64);
    expect(sent).toHaveLength(image.length);
    expect(Uint8Array.from(sent, (c) => c.charCodeAt(0))).toEqual(image);
  });

  it("names the extension from the content type, and refuses a type the service does not list without calling it", async () => {
    for (const [type, ext] of [["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]] as const) {
      const t = make({}, json(examples.generate));
      await t.api.generate({ ...PHOTO, contentType: type });
      expect(JSON.parse(t.seen[0]!.body!).world_prompt.image_prompt.extension).toBe(ext);
    }
    for (const type of ["image/gif", "image/svg+xml", "application/octet-stream", "", "constructor", "toString", "__proto__"]) {
      const t = make({});
      expect(await t.api.generate({ ...PHOTO, contentType: type }), type).toEqual({ ok: false, kind: "rejected" });
      expect(t.seen).toHaveLength(0);
    }
  });

  it("refuses an empty picture and one past 10 MB without calling, and sends one of exactly 10 MB", async () => {
    const none = make({});
    expect(await none.api.generate({ ...PHOTO, image: new Uint8Array(0) })).toEqual({ ok: false, kind: "rejected" });
    expect(await none.api.generate({ ...PHOTO, image: bytes(MAX_IMAGE_BYTES + 1) })).toEqual({ ok: false, kind: "rejected" });
    expect(none.seen).toHaveLength(0);
    const edge = make({}, json(examples.generate));
    expect(await edge.api.generate({ ...PHOTO, image: bytes(MAX_IMAGE_BYTES) })).toMatchObject({ ok: true });
  });

  it("uses the model it is given, and starts only with a model the service lists", async () => {
    expect(DEFAULT_MODEL).toBe("marble-1.1");
    const t = make({ model: "marble-1.0-draft" }, json(examples.generate));
    await t.api.generate(PHOTO);
    expect(JSON.parse(t.seen[0]!.body!).model).toBe("marble-1.0-draft");
    expect(() => new HttpWorldLabs({ apiKey: KEY, model: "marble-9" as never })).toThrow();
  });

  describe("what the service answers", () => {
    it("reads 402 as out of credits (the documented body)", async () => {
      expect(await make({}, json(examples.error402, 402)).api.generate(PHOTO)).toEqual({ ok: false, kind: "no_credits" });
    });

    it("reads 429 as a rate limit, with the wait it asks for", async () => {
      expect(await make({}, json({}, 429, { "Retry-After": "7" })).api.generate(PHOTO)).toEqual({ ok: false, kind: "rate_limited", retryAfterMs: 7000 });
      expect(await make({}, json({}, 429, { "Retry-After": " 0.5 " })).api.generate(PHOTO)).toEqual({ ok: false, kind: "rate_limited", retryAfterMs: 500 });
      expect(await make({}, json({}, 429, { "Retry-After": "0" })).api.generate(PHOTO)).toEqual({ ok: false, kind: "rate_limited", retryAfterMs: 0 });
      expect(await make({}, json({}, 429, { "Retry-After": "999999" })).api.generate(PHOTO)).toEqual({ ok: false, kind: "rate_limited", retryAfterMs: 3_600_000 });
      for (const bad of ["", "soon", "-3", "Wed, 21 Oct 2026 07:28:00 GMT", "NaN", "Infinity"]) {
        expect(await make({}, json({}, 429, { "Retry-After": bad })).api.generate(PHOTO), bad).toEqual({ ok: false, kind: "rate_limited" });
      }
      expect(await make({}, json({}, 429)).api.generate(PHOTO)).toEqual({ ok: false, kind: "rate_limited" });
    });

    it("reads a client error as a refusal for good", async () => {
      for (const status of [400, 401, 403, 404, 409, 413, 422]) {
        expect(await make({}, json(examples.error422, status)).api.generate(PHOTO), String(status)).toEqual({ ok: false, kind: "rejected" });
      }
    });

    it("reads a timeout and a server fault as a fault that may pass", async () => {
      for (const status of [408, 500, 502, 503, 504]) expect(await make({}, json({}, status)).api.generate(PHOTO), String(status)).toEqual({ ok: false, kind: "transient" });
    });

    it("does not follow a redirect, because the key would go with it", async () => {
      for (const status of [301, 302, 303, 307, 308]) {
        const t = make({}, new Response(null, { status, headers: { Location: "https://evil.example/steal" } }));
        expect(await t.api.generate(PHOTO), String(status)).toEqual({ ok: false, kind: "rejected" });
        expect(t.seen).toHaveLength(1);
        expect(t.seen[0]!.init.redirect).toBe("manual");
      }
    });

    it("reads no network, and a call that takes too long, as a fault", async () => {
      expect(await make({}, new Error("offline")).api.generate(PHOTO)).toEqual({ ok: false, kind: "transient" });
      const slow = make({ apiTimeoutMs: 15 }, (s) => new Promise<Response>((_, reject) => (s.init.signal as AbortSignal).addEventListener("abort", () => reject(new Error("aborted")))));
      expect(await slow.api.generate(PHOTO)).toEqual({ ok: false, kind: "transient" });
      expect((slow.seen[0]!.init.signal as AbortSignal).aborted).toBe(true);
    });

    it("refuses, and does not ask again, when a success has no operation to poll", async () => {
      const bad: Response[] = [
        new Response("<html>ok</html>", { status: 200 }),
        json({}), json([]), json(null), json("op"),
        json({ operation_id: "" }), json({ operation_id: 5 }), json({ operation_id: "../x" }), json({ operation_id: "a b" }), json({ operation_id: "o".repeat(201) }),
        json({ ...examples.generate, operation_id: undefined }),
      ];
      for (const r of bad) expect(await make({}, r).api.generate(PHOTO)).toEqual({ ok: false, kind: "rejected" });
    });

    it("does not read an answer that is far bigger than any answer of the service, even when it is valid JSON", async () => {
      const huge = JSON.stringify({ ...examples.generate, padding: "x".repeat(2_000_001) });
      expect(await make({}, new Response(huge, { status: 200 })).api.generate(PHOTO)).toEqual({ ok: false, kind: "rejected" });
      expect(await make({}, new Response(huge, { status: 200 })).api.poll(OP)).toEqual({ ok: false, kind: "transient" });
    });

    it("keeps an operation id of the shapes a service may use", async () => {
      for (const id of ["20bffbb1-4ba7-453f-a116-93eaw1a6843e", "op_123", "op:1.2", "A"]) {
        expect(await make({}, json({ ...examples.generate, operation_id: id })).api.generate(PHOTO)).toEqual({ ok: true, operationId: id });
      }
    });
  });
});

describe("poll", () => {
  it("reads the documented operation answers: in progress, done, and failed", async () => {
    const t = make({}, json(examples.operationInProgress), json(examples.operationDone), json(examples.operationFailed));
    expect(await t.api.poll(OP)).toEqual({ ok: true, state: "pending" });
    expect(await t.api.poll(OP)).toEqual({ ok: true, state: "done" });
    expect(await t.api.poll(OP)).toEqual({ ok: true, state: "failed" });
    for (const s of t.seen) {
      expect(s.url).toBe(`https://api.worldlabs.ai/marble/v1/operations/${OP}`);
      expect(s.method).toBe("GET");
      expect(s.headers.get("WLT-Api-Key")).toBe(KEY);
      expect(s.body).toBeUndefined();
    }
  });

  it("reads the just-started operation (done false, nothing else) as pending", async () => {
    expect(await make({}, json(examples.generate)).api.poll(OP)).toEqual({ ok: true, state: "pending" });
  });

  it("reads an error as a failure whether or not the operation says it is done, and a done with no world as a failure", async () => {
    expect(await make({}, json(mutate(examples.operationFailed, (o) => (o.done = false)))).api.poll(OP)).toEqual({ ok: true, state: "failed" });
    expect(await make({}, json(mutate(examples.operationDone, (o) => (o.response = null)))).api.poll(OP)).toEqual({ ok: true, state: "failed" });
    expect(await make({}, json(mutate(examples.operationDone, (o) => delete o.response))).api.poll(OP)).toEqual({ ok: true, state: "failed" });
    expect(await make({}, json(mutate(examples.operationDone, (o) => (o.response = "world")))).api.poll(OP)).toEqual({ ok: true, state: "failed" });
  });

  it("calls an operation done only when done is the boolean true", async () => {
    for (const done of ["true", 1, "yes", null, undefined]) {
      expect(await make({}, json(mutate(examples.operationDone, (o) => (o.done = done)))).api.poll(OP), String(done)).toEqual({ ok: true, state: "pending" });
    }
  });

  it("refuses an id that is not one the service made, without calling", async () => {
    const t = make({});
    for (const id of ["", "a/b", "../x", "a b", "a?b", "a#b", "o".repeat(201), "a\nb"]) expect(await t.api.poll(id), JSON.stringify(id)).toEqual({ ok: false, kind: "rejected" });
    expect(t.seen).toHaveLength(0);
  });

  it("maps the statuses the way generate does: 404 refused, 429 with its wait, 5xx a fault, 402 out of credits", async () => {
    expect(await make({}, json({}, 404)).api.poll(OP)).toEqual({ ok: false, kind: "rejected" });
    expect(await make({}, json({}, 429, { "Retry-After": "3" })).api.poll(OP)).toEqual({ ok: false, kind: "rate_limited", retryAfterMs: 3000 });
    expect(await make({}, json({}, 502)).api.poll(OP)).toEqual({ ok: false, kind: "transient" });
    expect(await make({}, json(examples.error402, 402)).api.poll(OP)).toEqual({ ok: false, kind: "no_credits" });
    expect(await make({}, new Error("offline")).api.poll(OP)).toEqual({ ok: false, kind: "transient" });
  });

  it("tries a read again when the answer is not JSON or not an object, since a read costs nothing", async () => {
    for (const r of [new Response("<html>bad gateway</html>", { status: 200 }), json([]), json(null), json("x"), new Response("", { status: 200 })]) {
      expect(await make({}, r).api.poll(OP)).toEqual({ ok: false, kind: "transient" });
    }
  });
});

describe("fetchWorld", () => {
  it("reads the documented finished world into the files and the pose", async () => {
    const t = make({}, json(examples.operationDone));
    const r = await t.api.fetchWorld(OP);
    expect(r).toEqual({
      ok: true,
      world: {
        splats: [
          { role: "splat", format: "spz", lod: "500k", url: `${A}/500k.spz?sig=EXAMPLE` },
          { role: "splat", format: "spz", lod: "100k", url: `${A}/100k.spz?sig=EXAMPLE` },
          { role: "splat", format: "spz", lod: "full", url: `${A}/full_res.spz?sig=EXAMPLE` },
        ],
        collider: { role: "collider", format: "glb", url: `${A}/collider.glb?sig=EXAMPLE` },
        pano: { role: "pano", format: "png", url: `${A}/pano.png?sig=EXAMPLE` },
        thumb: { role: "thumb", format: "jpg", url: `${A}/thumb.jpg?sig=EXAMPLE` },
        pose: { frame: "marble_raw_opencv", metricScaleFactor: 1.23, groundPlaneOffset: 0.42 },
      },
    });
    expect(t.seen[0]!.url).toBe(`https://api.worldlabs.ai/marble/v1/operations/${OP}`);
  });

  it("reads the world whether it names itself id (the example) or world_id (the schema), because the id is not used", async () => {
    const r = mutate(examples.operationDone, (o) => {
      o.response.world_id = o.response.id;
      delete o.response.id;
    });
    expect(await make({}, json(r)).api.fetchWorld(OP)).toMatchObject({ ok: true, world: { splats: [{}, {}, {}] } });
  });

  it("tries again later when the operation is not done, and refuses one that failed or has no world", async () => {
    expect(await make({}, json(examples.operationInProgress)).api.fetchWorld(OP)).toEqual({ ok: false, kind: "transient" });
    expect(await make({}, json(examples.operationFailed)).api.fetchWorld(OP)).toEqual({ ok: false, kind: "rejected" });
    // An error beats a world that is also there.
    expect(await make({}, json(mutate(examples.operationDone, (o) => (o.error = { code: 500, message: "late failure" })))).api.fetchWorld(OP)).toEqual({ ok: false, kind: "rejected" });
    expect(await make({}, json(mutate(examples.operationDone, (o) => (o.response = null)))).api.fetchWorld(OP)).toEqual({ ok: false, kind: "rejected" });
    expect(await make({}, json([])).api.fetchWorld(OP)).toEqual({ ok: false, kind: "transient" });
    expect(await make({}, json({}, 404)).api.fetchWorld(OP)).toEqual({ ok: false, kind: "rejected" });
    expect(await make({}, json({}, 429)).api.fetchWorld(OP)).toEqual({ ok: false, kind: "rate_limited" });
    expect(await make({}, json({}, 503)).api.fetchWorld(OP)).toEqual({ ok: false, kind: "transient" });
    expect(await make({}, json({}, 200)).api.fetchWorld("a/b")).toEqual({ ok: false, kind: "rejected" });
  });

  it("lists no splat for a world that has none, so the ingest fails it, and keeps the pose", async () => {
    const r = await make({}, json(mutate(examples.operationDone, (o) => (o.response.assets = {})))).api.fetchWorld(OP);
    expect(r).toEqual({ ok: true, world: { splats: [], pose: { frame: "marble_raw_opencv", metricScaleFactor: undefined, groundPlaneOffset: undefined } } });
  });

  it("is still a world without a collider, panorama or thumbnail", async () => {
    const r = await make({}, json(mutate(examples.operationDone, (o) => {
      delete o.response.assets.mesh;
      delete o.response.assets.imagery;
      delete o.response.assets.thumbnail_url;
    }))).api.fetchWorld(OP);
    expect(r.ok && r.world.splats).toHaveLength(3);
    expect(r.ok && r.world).not.toHaveProperty("collider");
    expect(r.ok && r.world).not.toHaveProperty("pano");
    expect(r.ok && r.world).not.toHaveProperty("thumb");
  });

  it("leaves out the file whose address is the documentation's placeholder, not https, with a user name, local or numeric", async () => {
    const bad = ["<500k_spz_url>", "", "http://cdn.example.test/a.spz", "ftp://cdn.example.test/a.spz", "https://user:pw@cdn.example.test/a.spz", "https://:pw@cdn.example.test/a.spz", "https://localhost/a.spz", "https://127.0.0.1/a.spz", "https://10.0.0.5/a.spz", "https://[::1]/a.spz", "https://metadata.internal/a.spz", "https://printer.local/a.spz", "https://x.localhost/a.spz", "javascript:alert(1)", "data:text/plain,hi", "//cdn.example.test/a.spz", "/a.spz", 5, null, {}];
    for (const url of bad) {
      const r = await make({}, json(mutate(examples.operationDone, (o) => (o.response.assets.splats.spz_urls = { "500k": url, "100k": `${A}/100k.spz` })))).api.fetchWorld(OP);
      expect(r.ok && r.world.splats, String(url)).toEqual([{ role: "splat", format: "spz", lod: "100k", url: `${A}/100k.spz` }]);
    }
  });

  it("takes a panorama or thumbnail only when its address ends in a picture format, and names jpeg as jpg", async () => {
    const world = (pano: string, thumb: string) => mutate(examples.operationDone, (o) => {
      o.response.assets.imagery.pano_url = pano;
      o.response.assets.thumbnail_url = thumb;
    });
    const ok = await make({}, json(world(`${A}/pano.JPEG?x=1`, `${A}/t.webp`))).api.fetchWorld(OP);
    expect(ok.ok && ok.world.pano?.format).toBe("jpg");
    expect(ok.ok && ok.world.thumb?.format).toBe("webp");
    for (const odd of [`${A}/pano`, `${A}/pano.gif`, `${A}/pano.svg`, `${A}/pano.jpg.exe`, `${A}/pano.`, `${A}/pano.jpg/`]) {
      const r = await make({}, json(world(odd, odd))).api.fetchWorld(OP);
      expect(r.ok && r.world, odd).not.toHaveProperty("pano");
      expect(r.ok && r.world, odd).not.toHaveProperty("thumb");
    }
  });

  it("reads the 150k splat level (seen on a real marble-1.1 world, Spike 1.1)", async () => {
    const r = await make({}, json(mutate(examples.operationDone, (o) => {
      o.response.assets.splats.spz_urls = { "500k": `${A}/500k.spz`, "150k": `${A}/150k.spz`, "100k": `${A}/100k.spz`, full_res: `${A}/full_res.spz` };
    }))).api.fetchWorld(OP);
    expect(r.ok && r.world.splats.map((s) => s.lod)).toEqual(["500k", "150k", "100k", "full"]);
  });

  it("reads the splat levels by their own names only, and nothing from a name that is not one", async () => {
    const r = await make({}, json(mutate(examples.operationDone, (o) => {
      o.response.assets.splats.spz_urls = { "500k": `${A}/a.spz`, "1m": `${A}/b.spz`, constructor: `${A}/c.spz`, toString: `${A}/d.spz`, __proto__: `${A}/e.spz` };
    }))).api.fetchWorld(OP);
    expect(r.ok && r.world.splats.map((s) => s.lod)).toEqual(["500k"]);
    // A response that is a JSON array, or has arrays where objects belong, has nothing.
    expect(readWorld({ assets: { splats: [] } }, false)).toMatchObject({ splats: [] });
    expect(readWorld({ assets: { splats: { spz_urls: [`${A}/a.spz`] } } }, false)).toMatchObject({ splats: [] });
    expect(readWorld([], false)).toBeNull();
    expect(readWorld(null, false)).toBeNull();
    expect(readWorld("w", false)).toBeNull();
  });

  it("reads a pose that is partly or wholly missing, and numbers only", async () => {
    const pose = async (meta: unknown) => {
      const r = await make({}, json(mutate(examples.operationDone, (o) => (o.response.assets.splats.semantics_metadata = meta)))).api.fetchWorld(OP);
      return r.ok ? r.world.pose : undefined;
    };
    expect(await pose({ metric_scale_factor: 2 })).toEqual({ frame: "marble_raw_opencv", metricScaleFactor: 2, groundPlaneOffset: undefined });
    expect(await pose({ ground_plane_offset: -0.3 })).toEqual({ frame: "marble_raw_opencv", metricScaleFactor: undefined, groundPlaneOffset: -0.3 });
    expect(await pose({ metric_scale_factor: "2", ground_plane_offset: null })).toEqual({ frame: "marble_raw_opencv", metricScaleFactor: undefined, groundPlaneOffset: undefined });
    expect(await pose(null)).toEqual({ frame: "marble_raw_opencv", metricScaleFactor: undefined, groundPlaneOffset: undefined });
    expect(await pose([1, 2])).toEqual({ frame: "marble_raw_opencv", metricScaleFactor: undefined, groundPlaneOffset: undefined });
  });

  it("reads a number past the range of a double (JSON 1e999 is infinity) as missing", async () => {
    const raw = JSON.stringify(examples.operationDone).replace('"metric_scale_factor":1.23', '"metric_scale_factor":1e999').replace('"ground_plane_offset":0.42', '"ground_plane_offset":-1e999');
    expect(raw).toContain("1e999");
    const r = await make({}, new Response(raw, { status: 200 })).api.fetchWorld(OP);
    expect(r.ok && r.world.pose).toEqual({ frame: "marble_raw_opencv", metricScaleFactor: undefined, groundPlaneOffset: undefined });
  });

  it("accepts a loopback address for a file only when the API is a loopback stand-in", async () => {
    const local = mutate(examples.operationDone, (o) => (o.response.assets.splats.spz_urls = { "500k": "http://127.0.0.1:9000/a.spz" }));
    const real = await make({}, json(local)).api.fetchWorld(OP);
    expect(real.ok && real.world.splats).toEqual([]);
    const stand = await make({ baseUrl: "http://127.0.0.1:8788" }, json(local)).api.fetchWorld(OP);
    expect(stand.ok && stand.world.splats).toHaveLength(1);
  });

  describe("the recorded worlds (Spike 1.1, 2026-11-16)", () => {
    // The recordings keep no address (every one is `<url>`), so each asset gets an example address
    // with the format its summary recorded; the shape, levels and numbers are the service's own.
    const resurrect = (recording: unknown): unknown =>
      (mutate(recording, (o) => {
        const a = o.response.assets;
        for (const k of Object.keys(a.splats.spz_urls)) a.splats.spz_urls[k] = `${A}/${k}.spz`;
        a.mesh.collider_mesh_url = `${A}/collider.glb`;
        if (a.imagery.pano_url !== null) a.imagery.pano_url = `${A}/pano.png`;
        a.thumbnail_url = `${A}/thumbnail.webp`;
      }) as { response: unknown }).response;

    it("reads the recorded marble-1.1 world: four splat levels, pano, thumb and the reported pose", () => {
      const w = readWorld(resurrect(recordedStandard), false);
      expect(w).not.toBeNull();
      expect(w!.splats.map((s) => s.lod)).toEqual(["500k", "150k", "100k", "full"]);
      expect(w!.collider?.format).toBe("glb");
      expect(w!.pano?.format).toBe("png");
      expect(w!.thumb?.format).toBe("webp");
      expect(w!.pose).toEqual({ frame: "marble_raw_opencv", metricScaleFactor: 1.438571, groundPlaneOffset: 1.414676 });
    });

    it("reads the recorded draft world: no pano, and no scale or ground reported", () => {
      const w = readWorld(resurrect(recordedDraft), false);
      expect(w).not.toBeNull();
      expect(w!.splats.map((s) => s.lod)).toEqual(["500k", "100k", "full"]);
      expect(w).not.toHaveProperty("pano");
      expect(w!.thumb?.format).toBe("webp");
      expect(w!.pose).toEqual({ frame: "marble_raw_opencv", metricScaleFactor: undefined, groundPlaneOffset: undefined });
    });
  });
});

describe("fetchAsset", () => {
  const SPLAT: SourceAsset = { role: "splat", format: "spz", lod: "500k", url: `${A}/500k.spz?sig=EXAMPLE` };

  it("gets the file from its own address with no key, and gives a file of known length as a stream, unread", async () => {
    const body = stream([bytes(4), bytes(6)]);
    const t = make({}, new Response(body, { status: 200, headers: { "Content-Length": "10" } }));
    const r = await t.api.fetchAsset(SPLAT);
    expect(t.seen[0]!.url).toBe(SPLAT.url);
    expect(t.seen[0]!.method).toBe("GET");
    expect([...t.seen[0]!.headers.keys()]).toEqual([]);
    expect(r.ok && r.size).toBe(10);
    expect(r.ok && !(r.body instanceof Uint8Array)).toBe(true);
    // The stream holds the bytes, which the caller reads.
    if (r.ok && !(r.body instanceof Uint8Array)) expect((await new Response(r.body).arrayBuffer()).byteLength).toBe(10);
  });

  it("reads the file whole when its length is not stated, or is not to be believed, and gives the real size", async () => {
    const parts = [bytes(3, 1), bytes(2, 2), bytes(4, 3)];
    const cases: [string, Record<string, string>][] = [
      ["no length", {}],
      ["blank length", { "Content-Length": " " }],
      ["junk length", { "Content-Length": "lots" }],
      ["negative length", { "Content-Length": "-4" }],
      ["fraction", { "Content-Length": "2.5" }],
      ["re-encoded", { "Content-Length": "4", "Content-Encoding": "gzip" }],
      ["br", { "Content-Length": "4", "Content-Encoding": "br" }],
    ];
    for (const [name, headers] of cases) {
      const r = await make({}, new Response(stream(parts), { status: 200, headers })).api.fetchAsset(SPLAT);
      expect(r.ok && r.size, name).toBe(9);
      expect(r.ok && r.body instanceof Uint8Array && [...r.body], name).toEqual([1, 1, 1, 2, 2, 3, 3, 3, 3]);
    }
  });

  it("believes a stated length with no or identity encoding, and a zero length", async () => {
    for (const enc of [undefined, "identity", " Identity "]) {
      const headers: Record<string, string> = { "Content-Length": "5", ...(enc !== undefined ? { "Content-Encoding": enc } : {}) };
      const r = await make({}, new Response(stream([bytes(5)]), { status: 200, headers })).api.fetchAsset(SPLAT);
      expect(r.ok && r.size, String(enc)).toBe(5);
      expect(r.ok && r.body instanceof Uint8Array, String(enc)).toBe(false);
    }
    const zero = await make({}, new Response(stream([]), { status: 200, headers: { "Content-Length": "0" } })).api.fetchAsset(SPLAT);
    expect(zero.ok && zero.size).toBe(0);
  });

  it("gives an empty file when there is no body, so the ingest can leave it out", async () => {
    const r = await make({}, new Response(null, { status: 200 })).api.fetchAsset(SPLAT);
    expect(r.ok && r.size).toBe(0);
    expect(r.ok && r.body).toEqual(new Uint8Array(0));
  });

  it("stops reading a file of unknown length once it is too big to hold, and cancels it", async () => {
    let cancelled = false;
    const mib = bytes(1024 * 1024);
    const chunks = Array.from({ length: BUFFERED_LIMIT / mib.byteLength + 2 }, () => mib);
    const r = await make({}, new Response(stream(chunks, () => (cancelled = true)), { status: 200 })).api.fetchAsset(SPLAT);
    expect(r).toEqual({ ok: false, kind: "rejected" });
    expect(cancelled).toBe(true);
    // Exactly the limit is still held.
    const exact = Array.from({ length: BUFFERED_LIMIT / mib.byteLength }, () => mib);
    const ok = await make({}, new Response(stream(exact), { status: 200 })).api.fetchAsset(SPLAT);
    expect(ok.ok && ok.size).toBe(BUFFERED_LIMIT);
  });

  it("reads a failing stream as a fault", async () => {
    const broken = new ReadableStream<Uint8Array>({ start: (c) => c.error(new Error("reset")) });
    expect(await make({}, new Response(broken, { status: 200 })).api.fetchAsset(SPLAT)).toEqual({ ok: false, kind: "transient" });
  });

  it("maps the statuses: gone or refused is a refusal, a limit is a limit, a fault is a fault, and the body of a failure is dropped", async () => {
    for (const status of [400, 401, 403, 404, 410]) expect(await make({}, new Response("denied", { status })).api.fetchAsset(SPLAT), String(status)).toEqual({ ok: false, kind: "rejected" });
    expect(await make({}, new Response("slow", { status: 429, headers: { "Retry-After": "2" } })).api.fetchAsset(SPLAT)).toEqual({ ok: false, kind: "rate_limited", retryAfterMs: 2000 });
    for (const status of [408, 500, 503]) expect(await make({}, new Response("oops", { status })).api.fetchAsset(SPLAT), String(status)).toEqual({ ok: false, kind: "transient" });
    expect(await make({}, new Error("offline")).api.fetchAsset(SPLAT)).toEqual({ ok: false, kind: "transient" });
    const slow = make({ assetTimeoutMs: 15 }, (s) => new Promise<Response>((_, reject) => (s.init.signal as AbortSignal).addEventListener("abort", () => reject(new Error("aborted")))));
    expect(await slow.api.fetchAsset(SPLAT)).toEqual({ ok: false, kind: "transient" });
  });

  it("cancels the body of a failed answer instead of leaving it open, from a file and from the API", async () => {
    let cancels = 0;
    const open = (status: number) => new Response(stream([bytes(3)], () => cancels++), { status });
    await make({}, open(500)).api.fetchAsset(SPLAT);
    await make({}, open(404)).api.fetchAsset(SPLAT);
    await make({}, open(402)).api.generate(PHOTO);
    await make({}, open(503)).api.poll(OP);
    expect(cancels).toBe(4);
  });

  it("refuses an address it would not fetch, without calling", async () => {
    const t = make({});
    for (const url of ["http://cdn.example.test/a.spz", "https://127.0.0.1/a", "https://u:p@cdn.example.test/a", "https://:p@cdn.example.test/a", "<500k_spz_url>", "", "file:///etc/passwd"]) {
      expect(await t.api.fetchAsset({ ...SPLAT, url }), url).toEqual({ ok: false, kind: "rejected" });
    }
    expect(t.seen).toHaveLength(0);
  });
});

describe("keeping the key and the addresses private", () => {
  it("sends the key to the API only: never in a file request, and the API host is the real one", async () => {
    const t = make({}, json(examples.generate), json(examples.operationDone), new Response(bytes(3), { status: 200, headers: { "Content-Length": "3" } }));
    await t.api.generate(PHOTO);
    await t.api.fetchWorld(OP);
    await t.api.fetchAsset({ role: "splat", format: "spz", lod: "500k", url: `${A}/500k.spz` });
    expect(t.seen.map((s) => s.headers.get("WLT-Api-Key"))).toEqual([KEY, KEY, null]);
    expect(t.seen[0]!.url.startsWith(`${WORLD_API_BASE}/`)).toBe(true);
    for (const s of t.seen) expect(s.url).not.toContain(KEY);
  });

  it("puts neither the key nor an address nor the picture in any answer, even when the network error mentions them", async () => {
    const leak = new Error(`connect failed with key ${KEY} to ${A}/500k.spz?sig=EXAMPLE`);
    const answers = [
      await make({}, leak).api.generate(PHOTO),
      await make({}, leak).api.poll(OP),
      await make({}, leak).api.fetchWorld(OP),
      await make({}, leak).api.fetchAsset({ role: "splat", format: "spz", lod: "500k", url: `${A}/500k.spz` }),
      await make({}, json(examples.error402, 402)).api.generate(PHOTO),
      await make({}, new Response(`bad key ${KEY}`, { status: 401 })).api.poll(OP),
      await make({}, json(examples.operationDone)).api.poll(OP),
    ];
    const all = JSON.stringify(answers);
    expect(all).not.toContain(KEY);
    expect(all).not.toContain("cdn.example.test");
    expect(all).not.toContain("sig=");
  });

  it("will send the key only to the real host or a loopback address", () => {
    expect(checkBase("https://api.worldlabs.ai")).toEqual({ origin: "https://api.worldlabs.ai", loopback: false });
    expect(checkBase("https://api.worldlabs.ai/")).toEqual({ origin: "https://api.worldlabs.ai", loopback: false });
    expect(checkBase("http://127.0.0.1:8788")).toEqual({ origin: "http://127.0.0.1:8788", loopback: true });
    expect(checkBase("http://localhost:1")).toEqual({ origin: "http://localhost:1", loopback: true });
    expect(checkBase("http://[::1]:8788")).toEqual({ origin: "http://[::1]:8788", loopback: true });
    for (const bad of [
      "https://evil.example", "https://api.worldlabs.ai.evil.example", "https://evilapi.worldlabs.ai", "https://api.worldlabs.ai@evil.example", "https://user:pw@api.worldlabs.ai",
      "http://api.worldlabs.ai", "https://api.worldlabs.ai/marble", "https://api.worldlabs.ai:8443", "http://127.0.0.1.evil.example", "http://user:pw@127.0.0.1:1", "http://:pw@127.0.0.1:1", "https://:pw@api.worldlabs.ai", "https://127.0.0.1", "http://10.0.0.1", "ftp://127.0.0.1", "not a url", "",
    ]) {
      expect(() => checkBase(bad), bad).toThrow();
    }
  });

  it("refuses to be built with a key that is empty or has a space or a line break, or a base that is not the API", () => {
    for (const key of ["", " ", "a b", "a\nb", "a\tb", "kéy", undefined as never, 5 as never]) expect(() => new HttpWorldLabs({ apiKey: key }), String(key)).toThrow();
    expect(() => new HttpWorldLabs({ apiKey: KEY, baseUrl: "https://evil.example" })).toThrow();
    expect(() => new HttpWorldLabs({ apiKey: KEY })).not.toThrow();
  });

  it("builds an address with the base the key may be sent to", async () => {
    const t = make({ baseUrl: "http://127.0.0.1:8788" }, json(examples.generate));
    await t.api.generate(PHOTO);
    expect(t.seen[0]!.url).toBe("http://127.0.0.1:8788/marble/v1/worlds:generate");
  });

  it("uses the global fetch when none is given", async () => {
    const original = globalThis.fetch;
    const seen: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return json(examples.generate);
    }) as typeof fetch;
    try {
      expect(await new HttpWorldLabs({ apiKey: KEY }).generate(PHOTO)).toMatchObject({ ok: true });
    } finally {
      globalThis.fetch = original;
    }
    expect(seen).toEqual(["https://api.worldlabs.ai/marble/v1/worlds:generate"]);
  });
});

describe("acceptableAssetUrl and imageFormatOf", () => {
  it("takes an https address on an ordinary host, and a loopback address only when allowed", () => {
    expect(acceptableAssetUrl("https://cdn.example.test/a.spz?sig=1", false)).toBe(true);
    expect(acceptableAssetUrl("https://a.b.c.example/a", false)).toBe(true);
    expect(acceptableAssetUrl("http://127.0.0.1:9/a", false)).toBe(false);
    expect(acceptableAssetUrl("http://127.0.0.1:9/a", true)).toBe(true);
    expect(acceptableAssetUrl("http://localhost:9/a", true)).toBe(true);
    expect(acceptableAssetUrl("http://10.0.0.1/a", true)).toBe(false);
    expect(acceptableAssetUrl("http://cdn.example.test/a", true)).toBe(false);
    expect(acceptableAssetUrl("https://cdn.example.test:8443/a", false)).toBe(true);
  });

  it("finds the picture format in the path and not in the query, and not from a path that only looks like one", () => {
    expect(imageFormatOf("https://c.example/a/pano.png?x=photo.jpg")).toBe("png");
    expect(imageFormatOf("https://c.example/a/pano?x=photo.jpg")).toBeUndefined();
    expect(imageFormatOf("https://c.example/a/pano.PNG")).toBe("png");
    expect(imageFormatOf("https://c.example/a.tar.webp")).toBe("webp");
    expect(imageFormatOf("not a url")).toBeUndefined();
  });
});

/** The bucket the ingest step writes to, over the in-memory R2: a stream is read to the end, as R2 does. */
const bucketOf = (r2: FakeR2) => ({
  put: async (k: string, v: ReadableStream<Uint8Array> | Uint8Array) => void r2.put(k, v instanceof Uint8Array ? v : new Uint8Array(await new Response(v).arrayBuffer())),
  head: (k: string) => r2.head(k),
  list: (o: { prefix: string; cursor?: string; limit?: number }) => r2.list(o),
  delete: (k: string | string[]) => r2.delete(k),
});

describe("through the guarded calls and the real ingest", () => {
  const ticket = { id: "t-1", meter: "world" as const, sessionId: "sid-a", issuedAt: 1 };

  it("starts and polls through the guarded wrappers, which still ask for a ticket", async () => {
    const t = make({}, json(examples.generate), json(examples.operationDone));
    expect(await generateWorld(t.api, ticket, PHOTO)).toEqual({ ok: true, operationId: examples.generate.operation_id });
    expect(await pollWorld(t.api, ticket, OP)).toEqual({ ok: true, state: "done" });
    expect(() => generateWorld(t.api, { ...ticket, meter: "image" } as never, PHOTO)).toThrow();
    expect(t.seen).toHaveLength(2);
  });

  it("copies a finished world into the bundle, with the pose from the service, and no address of the service in the manifest or the bundle", async () => {
    const files: Record<string, Uint8Array> = {
      [`${A}/500k.spz?sig=EXAMPLE`]: bytes(50, 5), [`${A}/100k.spz?sig=EXAMPLE`]: bytes(10, 1), [`${A}/full_res.spz?sig=EXAMPLE`]: bytes(90, 9),
      [`${A}/collider.glb?sig=EXAMPLE`]: bytes(20, 2), [`${A}/pano.png?sig=EXAMPLE`]: bytes(30, 3), [`${A}/thumb.jpg?sig=EXAMPLE`]: bytes(4, 4),
    };
    const serve: Reply = (s) => {
      if (s.url.startsWith(WORLD_API_BASE)) return json(examples.operationDone);
      const f = files[s.url];
      return f === undefined ? new Response("gone", { status: 404 }) : new Response(f, { status: 200, headers: { "Content-Length": String(f.byteLength) } });
    };
    const t = make({}, ...Array.from({ length: 7 }, () => serve));
    const r2 = new FakeR2();
    const ingestor = new WorldIngestor(t.api, bucketOf(r2));
    const WORLD = "w-aaaaaaaaaaaaaaaaaaaaaa";
    const r = await ingestor.ingest({ worldId: WORLD, operationId: OP, ownerSid: "sid-a", title: "The kitchen", brief: "A narrow kitchen.", source: "upload", createdAt: 1_800_000_000_000 });
    expect(r.ok).toBe(true);
    if (!r.ok || !("manifest" in r)) return;
    expect(WorldManifestSchema.safeParse(r.manifest).success).toBe(true);
    expect(r.manifest.assets.splat.map((s) => [s.path, s.lod, s.bytes])).toEqual([["splat-500k.spz", "500k", 50], ["splat-100k.spz", "100k", 10], ["splat-full.spz", "full", 90]]);
    expect(r.manifest.assets.collider).toMatchObject({ path: "collider.glb", bytes: 20 });
    expect(r.manifest.assets.pano).toMatchObject({ path: "pano.png", bytes: 30 });
    expect(r.manifest.assets.thumb).toMatchObject({ path: "thumb.jpg", bytes: 4 });
    // Documented numbers: scale 1.23, ground 0.42 -> the half turn about x, the floor at -0.42, the eyes 1.6 m above it.
    expect(r.manifest.orientation).toEqual({ upFix: [1, 0, 0, 0], scale: 1.23 });
    expect(r.manifest.floorY).toBeCloseTo(-0.42, 10);
    expect(r.manifest.spawn.position[1]).toBeCloseTo(1.6 - 0.42, 10);
    expect([...r2.objects.keys()].sort()).toEqual(["collider.glb", "pano.png", "splat-100k.spz", "splat-500k.spz", "splat-full.spz", "thumb.jpg", "world.json"].map((n) => `worlds/${WORLD}/${n}`));
    const stored = [...r2.objects.values()].map((o) => new TextDecoder("latin1").decode(o.bytes).slice(0, 4000)).join("");
    expect(stored).not.toContain("cdn.example.test");
    expect(stored).not.toContain("worldlabs");
    // The key reached only the one call that read the world.
    expect(t.seen.filter((s) => s.headers.get("WLT-Api-Key") !== null)).toHaveLength(1);
  });

  it("hands a refused file back as left out: a missing thumbnail leaves a ready world, a missing splat fails it", async () => {
    const serve = (gone: string): Reply => (s) => {
      if (s.url.startsWith(WORLD_API_BASE)) return json(examples.operationDone);
      return s.url.includes(gone) ? new Response("gone", { status: 404 }) : new Response(bytes(8), { status: 200, headers: { "Content-Length": "8" } });
    };
    const job = { worldId: "w-aaaaaaaaaaaaaaaaaaaaaa", operationId: OP, ownerSid: "sid-a", title: "t", brief: "", source: "upload" as const, createdAt: 1 };

    const noThumb = make({}, ...Array.from({ length: 7 }, () => serve("thumb")));
    expect(await new WorldIngestor(noThumb.api, bucketOf(new FakeR2())).ingest(job)).toMatchObject({ ok: true });

    const noSplats = make({}, ...Array.from({ length: 7 }, () => serve(".spz")));
    expect(await new WorldIngestor(noSplats.api, bucketOf(new FakeR2())).ingest(job)).toEqual({ ok: false, code: "ingest_failed" });
  });
});
