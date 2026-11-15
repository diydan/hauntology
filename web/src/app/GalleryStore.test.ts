import type { ApiResult, GalleryItem } from "@hauntology/shared/app/api";
import { describe, expect, it, vi } from "vitest";
import { createGalleryStore } from "./GalleryStore";

const items: GalleryItem[] = [{ id: "a", title: "A", description: "d", thumbUrl: "/t/a.svg", attribution: "x" }];
const ok = (v: GalleryItem[] = items): ApiResult<GalleryItem[]> => ({ ok: true, value: v });

describe("GalleryStore", () => {
  it("starts idle and asks for nothing until load()", () => {
    const api = { gallery: vi.fn(async () => ok()) };
    const store = createGalleryStore(api);
    expect(store.getSnapshot()).toEqual({ status: "idle" });
    expect(api.gallery).not.toHaveBeenCalled();
  });

  it("asks once however many callers load, and keeps the list", async () => {
    const api = { gallery: vi.fn(async () => ok()) };
    const store = createGalleryStore(api);
    const results = await Promise.all([store.load(), store.load(), store.load()]);
    await store.load();
    expect(api.gallery).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({ status: "ready", items });
    for (const r of results) expect(r).toBe(store.getSnapshot());
  });

  it("is loading while the answer is out", async () => {
    let release!: (r: ApiResult<GalleryItem[]>) => void;
    const store = createGalleryStore({ gallery: () => new Promise((r) => { release = r; }) });
    const done = store.load();
    expect(store.getSnapshot()).toEqual({ status: "loading" });
    release(ok());
    await done;
    expect(store.getSnapshot().status).toBe("ready");
  });

  it("fails with the code and the advised delay, does not ask again by itself, and asks once more on retry", async () => {
    const gallery = vi.fn<() => Promise<ApiResult<GalleryItem[]>>>();
    gallery.mockResolvedValueOnce({ ok: false, code: "rate_limited", retryAfterSec: 8 }).mockResolvedValue(ok());
    const store = createGalleryStore({ gallery });
    await store.load();
    expect(store.getSnapshot()).toEqual({ status: "failed", code: "rate_limited", retryAfterSec: 8 });
    await store.load();
    expect(gallery).toHaveBeenCalledTimes(1);
    await Promise.all([store.retry(), store.retry()]);
    expect(gallery).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot()).toEqual({ status: "ready", items });
  });

  it("a failure without a delay carries no retryAfterSec, and retry after success does not ask again", async () => {
    const gallery = vi.fn<() => Promise<ApiResult<GalleryItem[]>>>().mockResolvedValueOnce({ ok: false, code: "network_error" }).mockResolvedValue(ok());
    const store = createGalleryStore({ gallery });
    await store.load();
    expect("retryAfterSec" in store.getSnapshot()).toBe(false);
    await store.retry();
    await store.retry();
    expect(gallery).toHaveBeenCalledTimes(2);
  });

  it("tells subscribers about each change until they stop", async () => {
    const store = createGalleryStore({ gallery: async () => ok() });
    const a = vi.fn();
    const stop = store.subscribe(a);
    await store.load();
    expect(a).toHaveBeenCalledTimes(2);
    stop();
    await store.retry();
    expect(a).toHaveBeenCalledTimes(2);
  });
});
