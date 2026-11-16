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

/**
 * Checks a run may leave out because its route is not plugged into that app. Each one shows as a todo in the test
 * output, never silently. Only `play` is allowed: `POST /api/play/start` (ghost-engine 5, built).
 */
export type SkippableCheck = "play";

const isNotFound = (r: Reply): boolean => {
  const b = r.body as { ok?: unknown; code?: unknown } | null;
  return r.status === 404 && b !== null && typeof b === "object" && b.ok === false && b.code === "world_not_found";
};
const same = (a: Reply, b: Reply): boolean => a.status === b.status && JSON.stringify(a.body) === JSON.stringify(b.body);
const describeReply = (r: Reply): string => `${r.status} ${JSON.stringify(r.body)}`;

/** Runs every check and returns the violations, in plain words. An empty list means the contract holds. */
export async function checkWorldAccess(h: WorldAccessHarness, skip: readonly SkippableCheck[] = []): Promise<string[]> {
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
  const playChecked = !skip.includes("play");

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
  if (playChecked) {
    mustLookMissing("POST play/start by another visitor", await play(B, W), await play(B, M));
    mustLookMissing("POST play/start with no cookie", await play(NONE, W), await play(NONE, M));
    const ownPlay = await play(A, W);
    if (ownPlay.status !== 200) v.push(`POST play/start: the owner got ${describeReply(ownPlay)}`);
  }

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
  if (playChecked) {
    const galleryPlay = await play(B, G);
    if (galleryPlay.status !== 200) v.push(`POST play/start in a Gallery world (another visitor): ${describeReply(galleryPlay)}`);
  }
  const galleryDelete = await del(B, G);
  if (ok2xx(galleryDelete)) v.push(`DELETE Gallery world by a visitor succeeded (${describeReply(galleryDelete)})`);
  if ((await get(A, G)).status !== 200) v.push("DELETE of a Gallery world by a visitor removed it");

  // The owner can delete it, and after that it is missing for the owner as well.
  const ownDelete = await del(A, W);
  if (!ok2xx(ownDelete)) v.push(`DELETE own world: the owner got ${describeReply(ownDelete)}`);
  mustLookMissing("GET after delete", await get(A, W), await get(A, M));

  return v;
}

/**
 * The share link contract (world-pipeline 9.2, Requirement 9.4). A world is private until its owner turns the link on; then anyone who has
 * the id, with or without a cookie, may read it and its files, and nobody but the owner may delete it or change the link. Turning the link
 * off, or deleting the world, makes it as missing as before. No one but the owner can turn it on, off or find out it exists, and a Gallery
 * or a missing world cannot be shared.
 */
export async function checkWorldSharing(h: WorldAccessHarness, skip: readonly SkippableCheck[] = []): Promise<string[]> {
  const v: string[] = [];
  const A = await h.newVisitor();
  const B = await h.newVisitor();
  const NONE = h.anonymous();
  const W = await h.seedOwnWorld(A);
  const W2 = await h.seedOwnWorld(A);
  const M = h.missingWorldId;
  const G = h.galleryWorldId;

  const get = (who: Headers_, id: string) => h.request(`/api/worlds/${id}`, { method: "GET", headers: who });
  const del = (who: Headers_, id: string) => h.request(`/api/worlds/${id}`, { method: "DELETE", headers: who });
  const share = (who: Headers_, id: string, method: "POST" | "DELETE") => h.request(`/api/worlds/${id}/share`, { method, headers: who });
  const asset = (who: Headers_, id: string) => h.request(h.assetPath!(id), { method: "GET", headers: who });
  const play = (who: Headers_, id: string) => h.request("/api/play/start", { method: "POST", headers: who, body: { worldId: id } });
  const playChecked = !skip.includes("play");
  const ok2xx = (r: Reply) => r.status >= 200 && r.status < 300;
  const mustLookMissing = (what: string, foreign: Reply, missing: Reply) => {
    if (!isNotFound(foreign)) v.push(`${what}: answered ${describeReply(foreign)}, not 404 world_not_found`);
    if (!isNotFound(missing)) v.push(`${what}: a missing world answered ${describeReply(missing)}, not 404 world_not_found`);
    if (!same(foreign, missing)) v.push(`${what}: differs from a missing world (${describeReply(foreign)} vs ${describeReply(missing)})`);
  };
  const readers = [["another visitor", B], ["no cookie", NONE]] as const;

  // Private until the owner says so, and nobody else can say so.
  mustLookMissing("GET before the link is on", await get(B, W), await get(B, M));
  if (playChecked) mustLookMissing("POST play/start before the link is on", await play(B, W), await play(B, M));
  mustLookMissing("POST share by another visitor", await share(B, W, "POST"), await share(B, M, "POST"));
  mustLookMissing("POST share with no cookie", await share(NONE, W, "POST"), await share(NONE, M, "POST"));
  mustLookMissing("DELETE share by another visitor", await share(B, W, "DELETE"), await share(B, M, "DELETE"));
  if ((await get(B, W)).status === 200) v.push("a request to share the owner's world by someone else turned the link on");

  // The owner turns it on: anyone with the id reads it and its files.
  const on = await share(A, W, "POST");
  if (!ok2xx(on)) v.push(`POST share by the owner: ${describeReply(on)}`);
  for (const [name, who] of readers) {
    const r = await get(who, W);
    if (r.status !== 200) v.push(`GET shared world (${name}): ${describeReply(r)}`);
    if (h.assetPath !== undefined) {
      const a = await asset(who, W);
      if (a.status !== 200) v.push(`GET asset of a shared world (${name}): ${describeReply(a)}`);
    }
    // A reader may play the place they were given the link to (ghost-engine 5, through the same access rule).
    if (playChecked) {
      const p = await play(who, W);
      if (p.status !== 200) v.push(`POST play/start in a shared world (${name}): ${describeReply(p)}`);
    }
  }

  // A reader through the link changes nothing.
  mustLookMissing("DELETE of a shared world by a reader", await del(B, W), await del(B, M));
  mustLookMissing("DELETE of a shared world with no cookie", await del(NONE, W), await del(NONE, M));
  mustLookMissing("DELETE share by a reader", await share(B, W, "DELETE"), await share(B, M, "DELETE"));
  mustLookMissing("POST share by a reader", await share(B, W, "POST"), await share(B, M, "POST"));
  if ((await get(A, W)).status !== 200) v.push("a reader's request removed or changed the owner's world");
  if ((await get(B, W)).status !== 200) v.push("a reader's request turned the link off");

  // The owner turns it off: it is missing again, and still the owner's.
  const off = await share(A, W, "DELETE");
  if (!ok2xx(off)) v.push(`DELETE share by the owner: ${describeReply(off)}`);
  mustLookMissing("GET after the link is off", await get(B, W), await get(B, M));
  mustLookMissing("GET with no cookie after the link is off", await get(NONE, W), await get(NONE, M));
  if (playChecked) {
    mustLookMissing("POST play/start after the link is off", await play(B, W), await play(B, M));
    mustLookMissing("POST play/start with no cookie after the link is off", await play(NONE, W), await play(NONE, M));
    if ((await play(A, W)).status !== 200) v.push("turning the link off stopped the owner from playing in their own world");
  }
  if (h.assetPath !== undefined) mustLookMissing("GET asset after the link is off", await asset(B, W), await asset(B, M));
  if ((await get(A, W)).status !== 200) v.push("turning the link off took the world from its owner");

  // Deleting the world ends the link.
  if (!ok2xx(await share(A, W2, "POST"))) v.push("POST share of a second world by the owner failed");
  if ((await get(B, W2)).status !== 200) v.push("GET of a second shared world failed");
  if (!ok2xx(await del(A, W2))) v.push("DELETE of a shared world by its owner failed");
  mustLookMissing("GET of a deleted shared world", await get(B, W2), await get(B, M));

  // A Gallery world or a missing one cannot be shared, not even by someone who owns other worlds.
  mustLookMissing("POST share of a Gallery world", await share(A, G, "POST"), await share(A, M, "POST"));
  mustLookMissing("DELETE share of a Gallery world", await share(A, G, "DELETE"), await share(A, M, "DELETE"));

  return v;
}

/** Registers the contract as a test for one app. Used by every route set that serves worlds. */
export function worldAccessContract(
  label: string,
  makeHarness: () => Promise<WorldAccessHarness>,
  options: { skip?: readonly SkippableCheck[] } = {},
): void {
  describe(`world access contract: ${label}`, () => {
    it("serves an own world only to its Session, and answers a foreign id like a missing one", async () => {
      expect(await checkWorldAccess(await makeHarness(), options.skip)).toEqual([]);
    });
    it("shares a world only while its owner's link is on, and changes nothing for a reader", async () => {
      expect(await checkWorldSharing(await makeHarness(), options.skip)).toEqual([]);
    });
    for (const check of options.skip ?? []) it.todo(`${check}: not checked yet`);
  });
}
