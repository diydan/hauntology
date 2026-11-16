import { MemoryPlaySessions } from "../play/memory";
import { worldsKit } from "../worlds/test-kit";
import { worldAccessContract, type WorldAccessHarness } from "./world-access";

/**
 * Shell task 3.3: the world access contract against the real world routes (`routes/worlds.ts`) over the
 * in-memory store, with `POST /api/play/start` plugged in (ghost-engine 5): the play checks run too, and a reader of a shared world may play it.
 */
const GALLERY = "greenhouse";
const MISSING = "w-does-not-exist-123456";

async function realHarness(): Promise<WorldAccessHarness> {
  const kit = worldsKit(undefined, { play: { sessions: new MemoryPlaySessions() } });
  kit.readyWorld(GALLERY, null, { kind: "gallery" });
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
      kit.readyWorld(id, owner);
      return id;
    },
    galleryWorldId: GALLERY,
    missingWorldId: MISSING,
    assetPath: (id) => `/api/worlds/${id}/assets/world.json`,
  };
}

worldAccessContract("real world routes over the in-memory store", realHarness);
