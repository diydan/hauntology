import { useEffect, useMemo, useRef, useState } from "react";

export type PhotoFetch = (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; blob(): Promise<Blob> }>;
export type PhotoUrls = Readonly<{ make(b: Blob): string; revoke(u: string): void }>;

/**
 * The Room's photos for the Host's frames (party-mode 8.4). The photo route takes the Host token as a header, which a texture load cannot send, so the
 * Host fetches each picture itself and hands the Viewer a `blob:` address of its own page. One fetch per picture, none when a picture is already held, a
 * failed one is left out (an empty frame stays), and every address is revoked when the Room or the page goes. Gives a Zone id to address map.
 */
export function useFramePhotos(
  ids: Readonly<{ code: string | null; hostToken: string | null }>,
  framed: readonly Readonly<{ zone: string; photoId: string }>[],
  deps: Readonly<{ fetch: PhotoFetch; urls: PhotoUrls }> | null,
): Readonly<Record<string, string>> {
  const [held, setHeld] = useState<Readonly<Record<string, string>>>({}); // photoId -> blob address
  const heldRef = useRef(held); heldRef.current = held;
  const key = framed.map((f) => `${f.zone}:${f.photoId}`).join(",");
  useEffect(() => {
    if (deps === null || ids.code === null || ids.hostToken === null) return;
    let live = true;
    const want = framed.filter((f) => held[f.photoId] === undefined);
    for (const f of want) {
      void deps.fetch(`/api/party/${ids.code}/photo/${f.photoId}`, { headers: { Authorization: `Bearer ${ids.hostToken}` } }).then(async (r) => {
        if (!r.ok) return;
        const url = deps.urls.make(await r.blob());
        if (!live) { deps.urls.revoke(url); return; }
        setHeld((h) => (h[f.photoId] === undefined ? { ...h, [f.photoId]: url } : (deps.urls.revoke(url), h)));
      }).catch(() => undefined);
    }
    return () => { live = false; };
  }, [key, ids.code, ids.hostToken, deps]);
  // the addresses are let go only when the page or the Room goes, never while a frame may still be loading one
  useEffect(() => () => { if (deps !== null) for (const u of Object.values(heldRef.current)) deps.urls.revoke(u); }, [deps]);
  return useMemo(() => Object.fromEntries(framed.flatMap((f) => (held[f.photoId] !== undefined ? [[f.zone, held[f.photoId] as string]] : []))), [key, held]);
}
