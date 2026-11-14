import { describe, expect, it } from "vitest";

/**
 * The world access contract. An own world belongs to the Session that made it: no other Session,
 * and no request without a cookie, may read it, delete it, start a play session in it or fetch its
 * assets, and the answer for someone else's world id must be exactly the answer for an id that does
 * not exist, so ids cannot be probed. Gallery worlds are public to read and play, and are never
 * deletable by a visitor.
 *
 * The suite is independent of the routes: a harness says how to send a request, how to get a new
 * visitor, and how to make a ready world for one. Plug in the real app once `GET` and `DELETE`
 * `/api/worlds/:id` and `POST /api/play/start` exist (world-pipeline 7.4 and 8.1, ghost-engine 5).
 */

export type Headers_ = Record<string, string>;
export type Reply = { status: number; body: unknown };

export type WorldAccessHarness = {
  request(path: string, init: { method: string; headers: Headers_; body?: unknown }): Promise<Reply>;
  /** Headers (Cookie, Origin) of a brand-new visitor with their own Session. */
  newVisitor(): Promise<Headers_>;
  /** Headers of a request that carries no Session cookie at all (Origin only). */
  anonymous(): Headers_;
  /** Makes a world the visitor owns, ready to play, and returns its id. */
  seedOwnWorld(visitor: Headers_): Promise<string>;
  galleryWorldId: string;
  /** A well-formed id that no world has. */
  missingWorldId: string;
  /** Optional: the path of an asset of a world, for the asset checks. */
  assetPath?: (worldId: string) => string;
};

const isNotFound = (r: Reply): boolean => {
  const b = r.body as { ok?: unknown; code?: unknown } | null;
  return r.status === 404 && b !== null && typeof b === "object" && b.ok === false && b.code === "world_not_found";
};
const same = (a: Reply, b: Reply): boolean => a.status === b.status && JSON.stringify(a.body) === JSON.stringify(b.body);
const describeReply = (r: Reply): string => `${r.status} ${JSON.stringify(r.body)}`;

/** Runs every check and returns the violations, in plain words. An empty list means the contract holds. */
export async function checkWorldAccess(h: WorldAccessHarness): Promise<string[]> {
  const v: string[] = [];
  const A = await h.newVisitor();
  const B = await h.newVisitor();
  const NONE = h.anonymous();
  const W = await h.seedOwnWorld(A);
  const M = h.missingWorldId;
  const G = h.galleryWorldId;

  const get = (who: Headers_, id: string) => h.request(`/api/worlds/${id}`, { method: "GET", headers: who });
  const del = (who: Headers_, id: string) => h.request(`/api/worlds/${id}`, { method: "DELETE", headers: who });
  const play = (who: Headers_, id: string) => h.request("/api/play/start", { method: "POST", headers: who, body: { worldId: id } });
  const asset = (who: Headers_, id: string) => h.request(h.assetPath!(id), { method: "GET", headers: who });
  const ok2xx = (r: Reply) => r.status >= 200 && r.status < 300;

  /** A request for someone else's world must look exactly like a request for a missing one. */
  const mustLookMissing = (what: string, foreign: Reply, missing: Reply) => {
    if (!isNotFound(foreign)) v.push(`${what}: a foreign world answered ${describeReply(foreign)}, not 404 world_not_found`);
    if (!isNotFound(missing)) v.push(`${what}: a missing world answered ${describeReply(missing)}, not 404 world_not_found`);
    if (!same(foreign, missing)) v.push(`${what}: a foreign world and a missing world answer differently (${describeReply(foreign)} vs ${describeReply(missing)})`);
  };

  // The owner reads their own world.
  const own = await get(A, W);
  if (own.status !== 200) v.push(`GET own world: the owner got ${describeReply(own)}`);

  // Another visitor, and a request with no cookie, read it as if it were missing.
  mustLookMissing("GET by another visitor", await get(B, W), await get(B, M));
  mustLookMissing("GET with no cookie", await get(NONE, W), await get(NONE, M));

  // Another visitor cannot delete it, and the world is still there afterwards.
  mustLookMissing("DELETE by another visitor", await del(B, W), await del(B, M));
  mustLookMissing("DELETE with no cookie", await del(NONE, W), await del(NONE, M));
  if ((await get(A, W)).status !== 200) v.push("DELETE by another visitor removed the owner's world");

  // Another visitor cannot start a play session in it.
  mustLookMissing("POST play/start by another visitor", await play(B, W), await play(B, M));
  mustLookMissing("POST play/start with no cookie", await play(NONE, W), await play(NONE, M));
  const ownPlay = await play(A, W);
  if (ownPlay.status !== 200) v.push(`POST play/start: the owner got ${describeReply(ownPlay)}`);

  // Its assets are private too.
  if (h.assetPath !== undefined) {
    mustLookMissing("GET asset by another visitor", await asset(B, W), await asset(B, M));
    mustLookMissing("GET asset with no cookie", await asset(NONE, W), await asset(NONE, M));
    const ownAsset = await asset(A, W);
    if (ownAsset.status !== 200) v.push(`GET asset: the owner got ${describeReply(ownAsset)}`);
  }

  // A Gallery world is public to read and to play, and nobody can delete it.
  for (const [name, who] of [["owner", A], ["another visitor", B], ["no cookie", NONE]] as const) {
    const r = await get(who, G);
    if (r.status !== 200) v.push(`GET Gallery world (${name}): ${describeReply(r)}`);
  }
  const galleryPlay = await play(B, G);
  if (galleryPlay.status !== 200) v.push(`POST play/start in a Gallery world (another visitor): ${describeReply(galleryPlay)}`);
  const galleryDelete = await del(B, G);
  if (ok2xx(galleryDelete)) v.push(`DELETE Gallery world by a visitor succeeded (${describeReply(galleryDelete)})`);
  if ((await get(A, G)).status !== 200) v.push("DELETE of a Gallery world by a visitor removed it");

  // The owner can delete it, and after that it is missing for the owner as well.
  const ownDelete = await del(A, W);
  if (!ok2xx(ownDelete)) v.push(`DELETE own world: the owner got ${describeReply(ownDelete)}`);
  mustLookMissing("GET after delete", await get(A, W), await get(A, M));

  return v;
}

/** Registers the contract as a test for one app. Used by every route set that serves worlds. */
export function worldAccessContract(label: string, makeHarness: () => Promise<WorldAccessHarness>): void {
  describe(`world access contract: ${label}`, () => {
    it("serves an own world only to its Session, and answers a foreign id like a missing one", async () => {
      expect(await checkWorldAccess(await makeHarness())).toEqual([]);
    });
  });
}
