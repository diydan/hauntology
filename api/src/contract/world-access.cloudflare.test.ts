import { PlayIndex } from "../do/play-index";
import { PlaySession } from "../do/play-session";
import { CloudflarePlaySessions } from "../play/cloudflare";
import { CloudflareWorldStore } from "../worlds/cloudflare-store";
import { FakeJobs, FakeNamespace, FakeR2 } from "../worlds/fake-cloudflare";
import { BYTES, appKit, sampleManifest } from "../worlds/test-kit";
import { worldAccessContract, type WorldAccessHarness } from "./world-access";

/**
 * Shell task 3.3 again, over the real store: the same contract, with R2 and the `WorldJob` Durable Object
 * behind the routes (as fakes that follow the documented behaviour), and the games kept in `PlaySession` objects (the real class over a fake namespace):
 * the play checks run, and a reader of a shared world may play it (ghost-engine 5).
 */
const GALLERY = "greenhouse";
const MISSING = "w-does-not-exist-123456";

async function cloudflareHarness(): Promise<WorldAccessHarness> {
  const bucket = new FakeR2();
  const jobs = new FakeJobs();
  const index = new FakeNamespace((state) => new PlayIndex(state));
  const plays = new CloudflarePlaySessions(new FakeNamespace((state) => new PlaySession(state, { PLAY_INDEX: index })), index);
  const kit = appKit(new CloudflareWorldStore({ bucket, jobs, playSessions: plays }), undefined, { play: { sessions: plays } });

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

worldAccessContract("R2, WorldJob and PlaySession (fakes of all three)", cloudflareHarness);
