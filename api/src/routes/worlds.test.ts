import { API_SCHEMAS, WorldStatusSchema } from "@hauntology/shared/app/api-schemas";
import { JobStatusSchema, progressLabel } from "@hauntology/shared/world/responses";
import { JOB_STATES } from "@hauntology/shared/app/types";
import { describe, expect, it } from "vitest";
import { BYTES, NOW, sampleManifest, worldsKit } from "../worlds/test-kit";

const ID = "w-aaaaaaaaaaaaaaaaaaaaaaaa";
const GALLERY = "greenhouse";
const MISSING = "w-does-not-exist-123456";

const bytesOf = async (kit: ReturnType<typeof worldsKit>, path: string, headers: Record<string, string>, extra: Record<string, string> = {}) => {
  const res = await kit.app.request(`http://app.test${path}`, { headers: { ...headers, ...extra } }, { HMAC_SECRET: "test-secret-0123456789abcdef-test" });
  return { status: res.status, headers: res.headers, bytes: new Uint8Array(await res.arrayBuffer()) };
};

describe("GET /api/worlds/:id", () => {
  it("answers the owner with the status the shell reads, and the manifest of a ready world", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    kit.readyWorld(ID, owner);
    const r = await kit.send(`/api/worlds/${ID}`, { headers: owner.headers });
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(WorldStatusSchema.parse(r.json)).toMatchObject({ id: ID, status: "ready", title: "The kitchen", thumbUrl: `/api/worlds/${ID}/assets/thumb.jpg` });
    expect(JobStatusSchema.parse(r.json)).toMatchObject({ label: "Ready", manifest: sampleManifest(ID) });
    expect((r.json as { manifest: unknown }).manifest).toEqual(sampleManifest(ID));
  });

  it("answers every state, to the owner, a reader and anyone, in the shape of JobStatusSchema (world-pipeline 3.1, Requirements 7.3 and 8.2)", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    const stranger = await kit.visitor();
    const failure = { code: "upstream_rejected", quotaReturned: true, retryAllowed: false } as const;
    let n = 0;
    for (const status of JOB_STATES) {
      for (const shared of [false, true]) {
        const id = `w-matrix-${n++}-0000000000`;
        if (status === "ready") kit.readyWorld(id, owner, { shared });
        else kit.store.putWorld({ id, kind: "user", ownerSid: owner.sid, status, manifest: sampleManifest(id), ...(status === "failed" ? { failure } : {}) });
        const own = await kit.send(`/api/worlds/${id}`, { headers: owner.headers });
        expect(own.status, id).toBe(200);
        const parsed = JobStatusSchema.parse(own.json);
        expect(parsed.label, id).toBe(progressLabel(status));
        expect(parsed.manifest === undefined, id).toBe(status !== "ready");
        expect(parsed.shared, id).toBe(status === "ready" ? shared : false);
        expect(WorldStatusSchema.parse(own.json).id).toBe(id);
        // A reader of a shared world gets the same shape, without `shared`.
        const reader = await kit.send(`/api/worlds/${id}`, { headers: stranger.headers });
        if (status === "ready" && shared) {
          expect(JobStatusSchema.parse(reader.json).shared).toBeUndefined();
          expect(JSON.stringify(reader.json)).not.toContain(owner.sid);
        } else {
          expect(reader.status, id).toBe(404);
        }
      }
    }
    // A Gallery world is a ready world with its manifest, in the same shape.
    kit.store.putWorld({ id: "greenhouse", kind: "gallery", status: "ready", manifest: { ...sampleManifest("greenhouse"), source: "gallery", attribution: { credit: "A", licence: "CC0" } } });
    expect(JobStatusSchema.parse((await kit.send("/api/worlds/greenhouse")).json)).toMatchObject({ id: "greenhouse", status: "ready", label: "Ready" });
  });

  it("never puts an upstream address or a key in a status: every address in it is on this origin, and every asset is a file name", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    kit.readyWorld(ID, owner, { shared: true });
    const text = (await kit.send(`/api/worlds/${ID}`, { headers: owner.headers })).text;
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toMatch(/worldlabs|wlt_|api[-_]?key/i);
  });

  it("answers a world that is still being made with its state and no manifest", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    kit.store.putWorld({ id: ID, kind: "user", ownerSid: owner.sid, status: "generating", manifest: sampleManifest(ID) });
    const r = await kit.send(`/api/worlds/${ID}`, { headers: owner.headers });
    // The owner is always told whether the link is on; a world still being made is simply not shared.
    expect(r.json).toEqual({ id: ID, status: "generating", label: "Dreaming", shared: false });
  });

  it("reports a failed world with its code and whether the allowance came back", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    kit.store.putWorld({ id: ID, kind: "user", ownerSid: owner.sid, status: "failed", failure: { code: "upstream_rejected", quotaReturned: true, retryAllowed: false } });
    const r = await kit.send(`/api/worlds/${ID}`, { headers: owner.headers });
    expect(r.json).toEqual({ id: ID, status: "failed", failure: { code: "upstream_rejected", quotaReturned: true, retryAllowed: false }, label: "It did not work", shared: false });
  });

  it("sends the failure only for a failed world", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    kit.store.putWorld({ id: ID, kind: "user", ownerSid: owner.sid, status: "queued", failure: { code: "timeout", quotaReturned: true, retryAllowed: true } });
    expect(((await kit.send(`/api/worlds/${ID}`, { headers: owner.headers })).json as object)).not.toHaveProperty("failure");
  });

  it("reports a ready world whose manifest does not fit as a failed ingest", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    kit.store.putWorld({ id: ID, kind: "user", ownerSid: owner.sid, status: "ready", manifest: { ...sampleManifest(ID), assets: { splat: [] } } });
    kit.store.putWorld({ id: "w-nomanifest-0000000000", kind: "user", ownerSid: owner.sid, status: "ready" });
    for (const id of [ID, "w-nomanifest-0000000000"]) {
      const r = await kit.send(`/api/worlds/${id}`, { headers: owner.headers });
      expect(r.json).toEqual({ id, status: "failed", label: "It did not work", failure: { code: "ingest_failed", quotaReturned: false, retryAllowed: false } });
    }
  });

  it("leaks no upstream URL and no key, whatever the record holds", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    const dirty = {
      ...kit.readyWorld(ID, owner),
      apiKey: "WLT-SENTINEL-KEY",
      upstreamUrl: "https://cdn.worldlabs.ai/w/1.spz",
      manifest: { ...sampleManifest(ID), upstreamUrl: "https://api.worldlabs.ai/x", apiKey: "WLT-SENTINEL-KEY" },
    };
    kit.store.putWorld(dirty);
    for (const path of [`/api/worlds/${ID}`, `/api/worlds/${ID}/assets/world.json`]) {
      const r = await kit.send(path, { headers: owner.headers });
      expect(r.status).toBe(200);
      expect(r.text).not.toMatch(/WLT-SENTINEL-KEY|worldlabs|https?:\/\//i);
    }
  });

  it("serves a Gallery world to anyone, with no cookie too", async () => {
    const kit = worldsKit();
    kit.readyWorld(GALLERY, null, { kind: "gallery" });
    for (const headers of [(await kit.visitor()).headers, kit.anonymous()]) {
      const r = await kit.send(`/api/worlds/${GALLERY}`, { headers });
      expect(r.status).toBe(200);
      expect((r.json as { status: string }).status).toBe("ready");
    }
  });

  it("answers a foreign world, a missing world, a bad id and no cookie with one and the same 404", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    const other = await kit.visitor();
    kit.readyWorld(ID, owner);
    kit.readyWorld("w-ownerless-000000000000", null);
    const tooLong = "x".repeat(200);
    const answers = [
      await kit.send(`/api/worlds/${ID}`, { headers: other.headers }),
      await kit.send(`/api/worlds/${ID}`, { headers: kit.anonymous() }),
      await kit.send(`/api/worlds/${MISSING}`, { headers: other.headers }),
      await kit.send(`/api/worlds/${MISSING}`, { headers: owner.headers }),
      await kit.send(`/api/worlds/w-ownerless-000000000000`, { headers: owner.headers }),
      await kit.send(`/api/worlds/${tooLong}`, { headers: owner.headers }),
      await kit.send(`/api/worlds/has%20space`, { headers: owner.headers }),
    ];
    for (const a of answers) {
      expect(a.status).toBe(404);
      expect(a.json).toEqual({ ok: false, code: "world_not_found" });
      expect(a.headers.get("Cache-Control")).toBe("no-store");
    }
  });

  it("does not hand a stranger a Session that owns the world, however often they ask", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    kit.readyWorld(ID, owner);
    for (let i = 0; i < 5; i++) expect((await kit.send(`/api/worlds/${ID}`)).status).toBe(404);
  });
});

describe("GET /api/worlds/:id/assets/:name", () => {
  const setup = async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    kit.readyWorld(ID, owner);
    return { kit, owner };
  };

  it("streams a whole file with its type, size and a cache that never expires, private for an own world", async () => {
    const { kit, owner } = await setup();
    const r = await bytesOf(kit, `/api/worlds/${ID}/assets/splat-500k.spz`, owner.headers);
    expect(r.status).toBe(200);
    expect(r.bytes).toEqual(BYTES["splat-500k.spz"]);
    expect(r.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(r.headers.get("Content-Length")).toBe("10");
    expect(r.headers.get("Accept-Ranges")).toBe("bytes");
    expect(r.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect((await bytesOf(kit, `/api/worlds/${ID}/assets/collider.glb`, owner.headers)).headers.get("Content-Type")).toBe("model/gltf-binary");
    expect((await bytesOf(kit, `/api/worlds/${ID}/assets/thumb.jpg`, owner.headers)).headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("makes a Gallery asset public to cache", async () => {
    const kit = worldsKit();
    kit.readyWorld(GALLERY, null, { kind: "gallery" });
    const r = await bytesOf(kit, `/api/worlds/${GALLERY}/assets/thumb.jpg`, kit.anonymous());
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });

  it("writes no Session cookie on a response anyone may cache, even for a visitor with no Session", async () => {
    const kit = worldsKit();
    kit.readyWorld(GALLERY, null, { kind: "gallery" });
    const whole = await bytesOf(kit, `/api/worlds/${GALLERY}/assets/thumb.jpg`, kit.anonymous());
    expect(whole.headers.get("Cache-Control")).toMatch(/^public/);
    expect(whole.headers.get("Set-Cookie")).toBeNull();
    const part = await bytesOf(kit, `/api/worlds/${GALLERY}/assets/splat-500k.spz`, kit.anonymous(), { Range: "bytes=0-1" });
    expect(part.status).toBe(206);
    expect(part.headers.get("Set-Cookie")).toBeNull();
    // A page that is not cacheable still gives a new visitor a Session.
    const status = await kit.app.request("http://app.test/api/worlds/" + GALLERY, { headers: kit.anonymous() }, { HMAC_SECRET: "test-secret-0123456789abcdef-test" });
    expect(status.headers.get("Set-Cookie")).toMatch(/^hw_session=/);
  });

  it("answers a range with 206 and the bytes asked for", async () => {
    const { kit, owner } = await setup();
    const r = await bytesOf(kit, `/api/worlds/${ID}/assets/splat-500k.spz`, owner.headers, { Range: "bytes=2-5" });
    expect(r.status).toBe(206);
    expect(r.bytes).toEqual(Uint8Array.from([2, 3, 4, 5]));
    expect(r.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect(r.headers.get("Content-Length")).toBe("4");
    const tail = await bytesOf(kit, `/api/worlds/${ID}/assets/splat-500k.spz`, owner.headers, { Range: "bytes=-3" });
    expect(tail.bytes).toEqual(Uint8Array.from([7, 8, 9]));
    expect(tail.headers.get("Content-Range")).toBe("bytes 7-9/10");
    const open = await bytesOf(kit, `/api/worlds/${ID}/assets/splat-500k.spz`, owner.headers, { Range: "bytes=8-" });
    expect(open.bytes).toEqual(Uint8Array.from([8, 9]));
  });

  it("answers a range past the end with 416 and the size", async () => {
    const { kit, owner } = await setup();
    const r = await bytesOf(kit, `/api/worlds/${ID}/assets/splat-500k.spz`, owner.headers, { Range: "bytes=10-20" });
    expect(r.status).toBe(416);
    expect(r.headers.get("Content-Range")).toBe("bytes */10");
    expect(r.bytes.byteLength).toBe(0);
  });

  it("sends the whole file when the Range header is not one it understands", async () => {
    const { kit, owner } = await setup();
    for (const range of ["items=0-3", "bytes=0-1,4-5", "bytes=banana"]) {
      const r = await bytesOf(kit, `/api/worlds/${ID}/assets/splat-500k.spz`, owner.headers, { Range: range });
      expect(r.status, range).toBe(200);
      expect(r.bytes.byteLength).toBe(10);
    }
  });

  it("answers 404, not an empty 200, when the file goes missing between the size check and the read", async () => {
    const { kit, owner } = await setup();
    kit.store.read = async () => null;
    for (const range of [undefined, "bytes=0-3"]) {
      const r = await kit.send(`/api/worlds/${ID}/assets/splat-500k.spz`, { headers: { ...owner.headers, ...(range ? { Range: range } : {}) } });
      expect(r.status).toBe(404);
      expect(r.json).toEqual({ ok: false, code: "world_not_found" });
    }
  });

  it("serves the manifest as world.json, parsed, and never cached", async () => {
    const { kit, owner } = await setup();
    const r = await kit.send(`/api/worlds/${ID}/assets/world.json`, { headers: owner.headers });
    expect(r.status).toBe(200);
    expect(r.json).toEqual(sampleManifest(ID));
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });

  it("serves only the manifest and the files it names", async () => {
    const { kit, owner } = await setup();
    kit.store.putBundleFile(ID, "secret-notes.txt", Uint8Array.from([1]), NOW);
    for (const name of ["secret-notes.txt", "nope.spz", "%2e%2e%2fother", "a%2Fb", ".hidden"]) {
      const r = await kit.send(`/api/worlds/${ID}/assets/${name}`, { headers: owner.headers });
      expect(r.status, name).toBe(404);
      expect(r.json).toEqual({ ok: false, code: "world_not_found" });
    }
    // The URL parser collapses `..` before any route sees it, so no world is looked up at all.
    expect((await kit.send(`/api/worlds/${ID}/assets/..`, { headers: owner.headers })).status).toBe(404);
  });

  it("answers a file the manifest names but the store lacks, and a world that is not ready, with the same 404", async () => {
    const { kit, owner } = await setup();
    kit.store.objects.delete(`worlds/${ID}/collider.glb`);
    expect((await kit.send(`/api/worlds/${ID}/assets/collider.glb`, { headers: owner.headers })).status).toBe(404);
    kit.store.putWorld({ id: "w-queued-000000000000000", kind: "user", ownerSid: owner.sid, status: "queued", manifest: sampleManifest("w-queued-000000000000000") });
    expect((await kit.send(`/api/worlds/w-queued-000000000000000/assets/world.json`, { headers: owner.headers })).status).toBe(404);
  });

  it("answers another visitor, no cookie and a missing world alike", async () => {
    const { kit } = await setup();
    const other = await kit.visitor();
    for (const name of ["world.json", "splat-500k.spz", "thumb.jpg"]) {
      for (const headers of [other.headers, kit.anonymous()]) {
        const r = await kit.send(`/api/worlds/${ID}/assets/${name}`, { headers });
        expect(r.status, name).toBe(404);
        expect(r.json).toEqual({ ok: false, code: "world_not_found" });
      }
    }
    expect((await kit.send(`/api/worlds/${MISSING}/assets/world.json`, { headers: other.headers })).json).toEqual({ ok: false, code: "world_not_found" });
  });
});

describe("DELETE /api/worlds/:id", () => {
  it("removes the whole world for its owner, and the Session forgets it", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    kit.readyWorld(ID, owner);
    kit.store.putObject(`uploads/${ID}`, "upload", NOW, Uint8Array.from([1]), ID);
    kit.store.putObject(`sprites/${ID}`, "sprite", NOW, Uint8Array.from([1]), ID);
    kit.store.addPlaySession(ID, "p-1");
    const r = await kit.send(`/api/worlds/${ID}`, { method: "DELETE", headers: owner.headers });
    expect(r.status).toBe(204);
    expect(r.text).toBe("");
    expect(kit.store.records.has(ID)).toBe(false);
    expect([...kit.store.objects.keys()].filter((k) => kit.store.objects.get(k)?.worldId === ID)).toEqual([]);
    expect(kit.store.playSessions.has(ID)).toBe(false);
    expect((await kit.send(`/api/worlds/${ID}`, { headers: owner.headers })).status).toBe(404);
  });

  it("clears the world from the Session record", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    kit.readyWorld(ID, owner);
    // The cookie of the delete response is the new one; the world id must be gone from it.
    const res = await kit.app.request("http://app.test/api/worlds/" + ID, { method: "DELETE", headers: owner.headers }, { HMAC_SECRET: "test-secret-0123456789abcdef-test" });
    const cookie = (res.headers.get("Set-Cookie") as string).split(";")[0] as string;
    const session = await kit.send("/api/session", { headers: { Cookie: cookie, Origin: "http://app.test" } });
    expect(session.json).not.toHaveProperty("lastWorldId");
  });

  it("leaves everyone else's worlds alone", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    const mine = kit.readyWorld(ID, owner);
    const other = kit.readyWorld("w-bbbbbbbbbbbbbbbbbbbbbbbb", await kit.visitor());
    await kit.send(`/api/worlds/${mine.id}`, { method: "DELETE", headers: owner.headers });
    expect(kit.store.records.has(other.id)).toBe(true);
    expect(kit.store.objects.has(`worlds/${other.id}/thumb.jpg`)).toBe(true);
  });

  it("answers another visitor, no cookie and a missing world alike, and deletes nothing", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    const other = await kit.visitor();
    kit.readyWorld(ID, owner);
    for (const [headers, id] of [[other.headers, ID], [kit.anonymous(), ID], [other.headers, MISSING]] as const) {
      const r = await kit.send(`/api/worlds/${id}`, { method: "DELETE", headers });
      expect(r.status).toBe(404);
      expect(r.json).toEqual({ ok: false, code: "world_not_found" });
    }
    expect(kit.store.records.has(ID)).toBe(true);
    expect(kit.store.objects.has(`worlds/${ID}/thumb.jpg`)).toBe(true);
  });

  it("never deletes a Gallery world, for a visitor or for no one", async () => {
    const kit = worldsKit();
    kit.readyWorld(GALLERY, null, { kind: "gallery" });
    for (const headers of [(await kit.visitor()).headers, kit.anonymous()]) {
      const r = await kit.send(`/api/worlds/${GALLERY}`, { method: "DELETE", headers });
      expect(r.status).toBe(404);
    }
    expect(kit.store.records.has(GALLERY)).toBe(true);
  });

  it("refuses a delete from another origin before it reads the world", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    kit.readyWorld(ID, owner);
    const r = await kit.send(`/api/worlds/${ID}`, { method: "DELETE", headers: { ...owner.headers, Origin: "http://evil.test" } });
    expect(r.status).toBe(403);
    expect(r.json).toEqual({ ok: false, code: "bad_origin" });
    expect(kit.store.records.has(ID)).toBe(true);
  });
});

describe("the share link: POST and DELETE /api/worlds/:id/share (world-pipeline 9.2, Requirement 9.4)", () => {
  const share = (kit: ReturnType<typeof worldsKit>, id: string, who: { headers: Record<string, string> }, method: "POST" | "DELETE" = "POST") => kit.send(`/api/worlds/${id}/share`, { method, headers: who.headers });
  const NOT_FOUND = { ok: false, code: "world_not_found" };

  it("is off until the owner turns it on: a stranger gets the answer for a world nobody has", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    const stranger = await kit.visitor();
    kit.readyWorld(ID, owner);
    const r = await kit.send(`/api/worlds/${ID}`, { headers: stranger.headers });
    expect(r.status).toBe(404);
    expect(r.json).toEqual(NOT_FOUND);
  });

  it("lets the owner turn it on, and then a stranger, and a request with no cookie, read the world and its files", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    const stranger = await kit.visitor();
    kit.readyWorld(ID, owner);
    const on = await share(kit, ID, owner);
    expect(on.status).toBe(200);
    expect(on.json).toEqual({ ok: true, shared: true });
    expect(on.headers.get("Cache-Control")).toBe("no-store");
    for (const who of [stranger, { headers: { Origin: "http://app.test" } }]) {
      const r = await kit.send(`/api/worlds/${ID}`, { headers: who.headers });
      expect(r.status).toBe(200);
      expect(WorldStatusSchema.parse(r.json)).toMatchObject({ id: ID, status: "ready", title: "The kitchen" });
      expect(r.json).not.toHaveProperty("shared");
      expect(r.text).not.toContain(owner.sid);
      const asset = await bytesOf(kit, `/api/worlds/${ID}/assets/splat-500k.spz`, who.headers, { Range: "bytes=2-4" });
      expect(asset.status).toBe(206);
      expect([...asset.bytes]).toEqual([2, 3, 4]);
    }
  });

  it("keeps a shared world out of every shared cache: its files are private, and a reader is given a Session like any visitor", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    kit.readyWorld(ID, owner, { shared: true });
    const r = await bytesOf(kit, `/api/worlds/${ID}/assets/thumb.jpg`, { Origin: "http://app.test" });
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
    expect(r.headers.get("Set-Cookie")).not.toBeNull();
  });

  it("answers in the shapes the shell reads: the share call, and the owner's status with `shared`", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    kit.readyWorld(ID, owner);
    expect(API_SCHEMAS.shareWorld.parse((await share(kit, ID, owner)).json)).toEqual({ shared: true });
    expect(API_SCHEMAS.world.parse((await kit.send(`/api/worlds/${ID}`, { headers: owner.headers })).json)).toMatchObject({ id: ID, status: "ready", shared: true });
    expect(API_SCHEMAS.shareWorld.parse((await share(kit, ID, owner, "DELETE")).json)).toEqual({ shared: false });
  });

  it("tells only the owner whether the link is on or off, so the shell can tell the owner from a reader", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    kit.readyWorld(ID, owner, { shared: true });
    expect((await kit.send(`/api/worlds/${ID}`, { headers: owner.headers })).json).toMatchObject({ id: ID, shared: true });
    const stranger = await kit.visitor();
    expect((await kit.send(`/api/worlds/${ID}`, { headers: stranger.headers })).json).not.toHaveProperty("shared");
    const off = worldsKit();
    const o2 = await off.visitor();
    off.readyWorld(ID, o2);
    const own = await off.send(`/api/worlds/${ID}`, { headers: o2.headers });
    expect(own.json).toMatchObject({ id: ID, shared: false });
    expect(WorldStatusSchema.parse(own.json).shared).toBe(false);
    // A world that is not shared is not open to anyone else, so a stranger gets no status, and so no `shared` either.
    const other = await off.visitor();
    expect((await off.send(`/api/worlds/${ID}`, { headers: other.headers })).status).toBe(404);
  });

  it("lets nobody but the owner delete a shared world or change its link; each refusal is the answer for a world nobody has", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    const stranger = await kit.visitor();
    kit.readyWorld(ID, owner, { shared: true });
    const missing = await share(kit, MISSING, stranger);
    for (const r of [await kit.send(`/api/worlds/${ID}`, { method: "DELETE", headers: stranger.headers }), await share(kit, ID, stranger), await share(kit, ID, stranger, "DELETE"), await share(kit, ID, { headers: { Origin: "http://app.test" } })]) {
      expect(r.status).toBe(404);
      expect(r.json).toEqual(NOT_FOUND);
      expect(r.json).toEqual(missing.json);
    }
    expect(kit.store.records.get(ID)).toMatchObject({ shared: true });
    expect(kit.store.objects.size).toBeGreaterThan(0);
  });

  it("ends when the owner turns it off: the stranger gets the 404 again, the owner keeps the world", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    const stranger = await kit.visitor();
    kit.readyWorld(ID, owner);
    await share(kit, ID, owner);
    expect((await kit.send(`/api/worlds/${ID}`, { headers: stranger.headers })).status).toBe(200);
    const off = await share(kit, ID, owner, "DELETE");
    expect(off.status).toBe(200);
    expect(off.json).toEqual({ ok: true, shared: false });
    expect((await kit.send(`/api/worlds/${ID}`, { headers: stranger.headers })).status).toBe(404);
    expect((await bytesOf(kit, `/api/worlds/${ID}/assets/thumb.jpg`, stranger.headers)).status).toBe(404);
    expect((await kit.send(`/api/worlds/${ID}`, { headers: owner.headers })).status).toBe(200);
  });

  it("ends when the owner deletes the world", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    const stranger = await kit.visitor();
    kit.readyWorld(ID, owner);
    await share(kit, ID, owner);
    expect((await kit.send(`/api/worlds/${ID}`, { method: "DELETE", headers: owner.headers })).status).toBe(204);
    expect((await kit.send(`/api/worlds/${ID}`, { headers: stranger.headers })).json).toEqual(NOT_FOUND);
  });

  it("can be turned on and off again and again, with the same answer", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    kit.readyWorld(ID, owner);
    for (const [method, shared] of [["POST", true], ["POST", true], ["DELETE", false], ["DELETE", false], ["POST", true]] as const) {
      const r = await share(kit, ID, owner, method);
      expect(r.json).toEqual({ ok: true, shared });
    }
  });

  it("shares only a ready world, and never a Gallery world", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    for (const status of ["queued", "generating", "ingesting", "failed"] as const) {
      kit.store.putWorld({ id: `w-${status}-0000000000000`, kind: "user", ownerSid: owner.sid, status, manifest: sampleManifest(`w-${status}-0000000000000`) });
      const r = await share(kit, `w-${status}-0000000000000`, owner);
      expect(r.status, status).toBe(404);
      expect(kit.store.records.get(`w-${status}-0000000000000`)).not.toHaveProperty("shared");
    }
    kit.store.putWorld({ id: "w-nomanifest-0000000000", kind: "user", ownerSid: owner.sid, status: "ready" });
    expect((await share(kit, "w-nomanifest-0000000000", owner)).status).toBe(404);
    kit.store.putWorld({ id: GALLERY, kind: "gallery", status: "ready", manifest: sampleManifest(GALLERY) });
    expect((await share(kit, GALLERY, owner)).status).toBe(404);
    expect(kit.store.records.get(GALLERY)).not.toHaveProperty("shared");
  });

  it("answers a missing world, a bad id and a request that comes from another origin without touching anything", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    kit.readyWorld(ID, owner);
    expect((await share(kit, MISSING, owner)).status).toBe(404);
    expect((await share(kit, "bad%20id", owner)).status).toBe(404);
    const foreign = await kit.send(`/api/worlds/${ID}/share`, { method: "POST", headers: { ...owner.headers, Origin: "https://evil.example" } });
    expect(foreign.status).toBeGreaterThanOrEqual(400);
    expect(kit.store.records.get(ID)).not.toHaveProperty("shared");
  });

  it("answers the 404 when the record is gone between the check and the change", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    kit.readyWorld(ID, owner);
    kit.store.update = async () => null;
    for (const method of ["POST", "DELETE"] as const) {
      const r = await share(kit, ID, owner, method);
      expect(r.status, method).toBe(404);
      expect(r.json).toEqual(NOT_FOUND);
    }
  });

  it("never lists a shared world in the Gallery", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    kit.readyWorld(ID, owner);
    await share(kit, ID, owner);
    expect((await kit.send("/api/gallery")).json).toEqual([]);
  });
});
