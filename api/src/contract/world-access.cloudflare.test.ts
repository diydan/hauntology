import { CloudflareWorldStore } from "../worlds/cloudflare-store";
import { FakeJobs, FakeR2 } from "../worlds/fake-cloudflare";
import { BYTES, appKit, sampleManifest } from "../worlds/test-kit";
import { worldAccessContract, type WorldAccessHarness } from "./world-access";

/**
 * Shell task 3.3 again, over the real store: the same contract, with R2 and the `WorldJob` Durable Object
 * behind the routes (as fakes that follow the documented behaviour). Play checks still wait for ghost-engine 5.
 */
const GALLERY = "greenhouse";
const MISSING = "w-does-not-exist-123456";

async function cloudflareHarness(): Promise<WorldAccessHarness> {
  const bucket = new FakeR2();
  const jobs = new FakeJobs();
  const kit = appKit(new CloudflareWorldStore({ bucket, jobs }));

  bucket.put(`gallery/${GALLERY}/world.json`, JSON.stringify(sampleManifest(GALLERY)));
  for (const [name, bytes] of Object.entries(BYTES)) bucket.put(`gallery/${GALLERY}/${name}`, bytes);

  const visitors = new Map<string, Awaited<ReturnType<typeof kit.visitor>>>();
  let seed = 0;
  return {
    request: async (path, init) => {
      const r = await kit.send(path, { method: init.method, headers: init.headers, ...(init.body !== undefined ? { body: init.body } : {}) });
      return { status: r.status, body: r.json };
    },
    newVisitor: async () => {
      const v = await kit.visitor();
      visitors.set(v.headers.Cookie as string, v);
      return v.headers;
    },
    anonymous: () => kit.anonymous(),
    seedOwnWorld: async (headers) => {
      const owner = visitors.get(headers.Cookie as string);
      if (owner === undefined) throw new Error("seedOwnWorld needs a visitor made by newVisitor");
      const id = `w-own-${String(++seed).padStart(8, "0")}-abcdef`;
      await jobs.get(id).fetch("https://world-job/record", { method: "PUT", body: JSON.stringify({ id, kind: "user", ownerSid: owner.sid, status: "ready", manifest: sampleManifest(id) }) });
      for (const [name, bytes] of Object.entries(BYTES)) bucket.put(`worlds/${id}/${name}`, bytes);
      return id;
    },
    galleryWorldId: GALLERY,
    missingWorldId: MISSING,
    assetPath: (id) => `/api/worlds/${id}/assets/world.json`,
  };
}

worldAccessContract("R2 and WorldJob store (fakes of both)", cloudflareHarness, { skip: ["play"] });
