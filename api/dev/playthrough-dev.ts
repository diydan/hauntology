/**
 * The `/dev/` routes of the narrator play-through Worker (`playthrough-worker.ts`, `docs/spikes/4.2.md`), with no import but types, so a plain Node test can run it:
 * the Worker hands it what it needs (the token, the bucket, the guard's room left, the caps, whether the narrator is on) and it answers. LOCAL ONLY, never deployed.
 *
 *   POST /dev/seed-gallery { id }   plants a made-up attic as a Gallery world (a place with no splat: the engine reads only its brief and bounds)
 *   GET  /dev/status                { ready, narrator, aiBinding, caps }   what the Worker can do (spends nothing)
 *   GET  /dev/units                 { used, remaining, cap, exact }   the units `SpendGuard` has counted for the `llm` meter today (spends nothing)
 *
 * Every call needs `RUN_TOKEN` (16 or more characters) in the `x-run-token` header and a loopback host, so nothing else on the machine or the network can plant a place
 * or read the counts. The host is checked first, then the token, then the method and the path.
 */

/** The place is made up: no real photo, place or name. 40 by 40 metres, so that every distance word of a hint can be asked for ("far" is over 15 m). */
export const ATTIC_BRIEF = "A low attic room under the roof, with a round window, a trunk with brass corners and a rocking chair. The air smells of dust and cedar.";
export const FILES: Record<string, Uint8Array> = {
  "splat-500k.spz": Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
  "collider.glb": Uint8Array.from([10, 11, 12, 13]),
  "thumb.jpg": Uint8Array.from([20, 21, 22]),
};
export const atticManifest = (id: string) => ({
  id, title: "A made-up attic", createdAt: 1_800_000_000_000, source: "gallery",
  assets: { splat: [{ path: "splat-500k.spz", bytes: 10, lod: "500k" }], collider: { path: "collider.glb", bytes: 4 }, thumb: { path: "thumb.jpg", bytes: 3 } },
  orientation: { upFix: [0, 0, 0, 1], scale: 1 }, spawn: { position: [0, 1.6, 0], yaw: 0 }, floorY: 0,
  bounds: { min: [-20, 0, -20], max: [20, 3, 20] }, brief: ATTIC_BRIEF,
});

const json = (body: unknown, status = 200): Response => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** Equal strings, compared in time that does not depend on where they differ. */
export function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Only this machine: the `Host` the request was addressed to must be a loopback name. */
export const isLoopbackHost = (hostname: string): boolean => hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";

export const ATTIC_ID = /^pt-[a-z0-9-]{4,40}$/;
export const whole = (v: string | undefined): number | null => (v !== undefined && /^\d{1,6}$/.test(v) ? Number(v) : null);

export type DevDeps = {
  /** `RUN_TOKEN`: at least 16 characters, or the routes answer nothing. */
  token: string;
  bucket: { put(key: string, value: string | Uint8Array): Promise<unknown> };
  galleryKey: (worldId: string, name: string) => string;
  /** What the guard has left for the `llm` meter for a visitor who has used none. */
  llmRemaining: () => Promise<number>;
  caps: { day: string | undefined; session: string | undefined };
  narrator: boolean;
  aiBinding: boolean;
};

export async function dev(request: Request, deps: DevDeps): Promise<Response> {
  const url = new URL(request.url);
  if (!isLoopbackHost(url.hostname)) return json({ error: "this machine only" }, 403);
  if (deps.token.length < 16) return json({ error: "RUN_TOKEN is not set (16+ characters)" }, 500);
  if (!sameToken(request.headers.get("x-run-token") ?? "", deps.token)) return json({ error: "bad token" }, 401);

  const day = whole(deps.caps.day);
  const session = whole(deps.caps.session);

  if (url.pathname === "/dev/status") {
    if (request.method !== "GET") return json({ error: "GET only" }, 405);
    return json({ ready: true, narrator: deps.narrator, aiBinding: deps.aiBinding, caps: { day, session } });
  }
  if (url.pathname === "/dev/units") {
    if (request.method !== "GET") return json({ error: "GET only" }, 405);
    // A visitor who never used the guard has the whole per-visitor cap; the day cap limits them once units are used. With the per-visitor cap at least the day cap, what is left is exactly the day's room.
    const left = await deps.llmRemaining();
    const cap = day !== null && session !== null ? Math.min(day, session) : null;
    const exact = day !== null && session !== null && session >= day;
    return json({ used: cap === null ? null : cap - left, remaining: left, cap, exact });
  }
  if (url.pathname === "/dev/seed-gallery") {
    if (request.method !== "POST") return json({ error: "POST only" }, 405);
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: "the body is not JSON" }, 400); }
    const id = typeof body === "object" && body !== null ? (body as Record<string, unknown>)["id"] : undefined;
    if (typeof id !== "string" || !ATTIC_ID.test(id)) return json({ error: "id is pt- and 4 to 40 lowercase letters, digits or dashes" }, 400);
    await deps.bucket.put(deps.galleryKey(id, "world.json"), JSON.stringify(atticManifest(id)));
    for (const [name, bytes] of Object.entries(FILES)) await deps.bucket.put(deps.galleryKey(id, name), bytes);
    return json({ ok: true, id });
  }
  return json({ error: "not found" }, 404);
}
