// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFramePhotos } from "./frame-photos";

const framed = [{ zone: "z1", photoId: "pa" }, { zone: "z3", photoId: "pc" }];
const mk = () => {
  const calls: { url: string; auth: string | undefined }[] = [];
  const fetch = vi.fn(async (url: string, init: { headers: Record<string, string> }) => { calls.push({ url, auth: init.headers["Authorization"] }); return url.endsWith("pc") ? { ok: false, blob: async () => new Blob() } : { ok: true, blob: async () => new Blob(["x"]) }; });
  const revoked: string[] = [];
  let n = 0;
  return { calls, revoked, deps: { fetch, urls: { make: () => `blob:https://h.test/${String(++n).padStart(36, "0")}`, revoke: (u: string) => { revoked.push(u); } } } };
};

describe("useFramePhotos (party-mode 8.4)", () => {
  it("fetches each photo once with the Host token, leaves a failed one empty, and gives a Zone to address map", async () => {
    const t = mk();
    const { result, rerender } = renderHook(() => useFramePhotos({ code: "K7M2", hostToken: "t".repeat(32) }, framed, t.deps));
    await waitFor(() => expect(Object.keys(result.current)).toEqual(["z1"]));
    expect(t.calls).toEqual([{ url: "/api/party/K7M2/photo/pa", auth: `Bearer ${"t".repeat(32)}` }, { url: "/api/party/K7M2/photo/pc", auth: `Bearer ${"t".repeat(32)}` }]);
    rerender();
    expect(t.deps.fetch).toHaveBeenCalledTimes(2);
  });
  it("does nothing without deps, a code or a token, and lets the addresses go when the page goes", async () => {
    const off = renderHook(() => useFramePhotos({ code: null, hostToken: null }, framed, null));
    expect(off.result.current).toEqual({});
    const t = mk();
    const on = renderHook(() => useFramePhotos({ code: "K7M2", hostToken: "t".repeat(32) }, framed.slice(0, 1), t.deps));
    await waitFor(() => expect(Object.keys(on.result.current)).toEqual(["z1"]));
    on.unmount();
    expect(t.revoked).toHaveLength(1);
  });
});
