import { GalleryItemSchema } from "@hauntology/shared/app/api-schemas";
import type { WorldManifest } from "@hauntology/shared/world/manifest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { MemoryWorldStore } from "../worlds/memory-store";
import { sampleManifest, worldsKit } from "../worlds/test-kit";

const galleryManifest = (id: string, over: Partial<WorldManifest> = {}): WorldManifest => ({
  ...sampleManifest(id),
  title: `The ${id}`,
  source: "gallery",
  attribution: { credit: "Photo by A. Person", licence: "CC BY 4.0", url: "https://example.com/p/1" },
  ...over,
});
const addGallery = (kit: ReturnType<typeof worldsKit>, id: string, over: Partial<WorldManifest> = {}) => kit.store.putWorld({ id, kind: "gallery", status: "ready", title: `The ${id}`, manifest: galleryManifest(id, over) });

describe("GET /api/gallery", () => {
  it("lists the Gallery Worlds as the shell reads them: id, title, description, thumbnail and credit, sorted by id", async () => {
    const kit = worldsKit();
    addGallery(kit, "greenhouse");
    addGallery(kit, "attic-room");
    const r = await kit.send("/api/gallery");
    expect(r.status).toBe(200);
    expect(r.json).toEqual([
      { id: "attic-room", title: "The attic-room", description: "A narrow kitchen with a window over the sink.", thumbUrl: "/api/worlds/attic-room/assets/thumb.jpg", attribution: "Photo by A. Person · CC BY 4.0" },
      { id: "greenhouse", title: "The greenhouse", description: "A narrow kitchen with a window over the sink.", thumbUrl: "/api/worlds/greenhouse/assets/thumb.jpg", attribution: "Photo by A. Person · CC BY 4.0" },
    ]);
    for (const item of r.json as unknown[]) expect(GalleryItemSchema.safeParse(item).success).toBe(true);
  });

  it("is an empty list when there is no Gallery yet", async () => {
    const kit = worldsKit();
    const r = await kit.send("/api/gallery");
    expect(r.status).toBe(200);
    expect(r.json).toEqual([]);
  });

  it("lists Gallery Worlds only: never a user's world, ready, shared or not", async () => {
    const kit = worldsKit();
    const owner = await kit.visitor();
    addGallery(kit, "greenhouse");
    // Made so that they could be listed in every other way: a thumbnail and a credit. Only that they are a user's keeps them out.
    const listable = (id: string) => ({ manifest: galleryManifest(id) });
    kit.readyWorld("w-aaaaaaaaaaaaaaaaaaaaaa", owner, listable("w-aaaaaaaaaaaaaaaaaaaaaa"));
    kit.readyWorld("w-bbbbbbbbbbbbbbbbbbbbbb", owner, { shared: true, ...listable("w-bbbbbbbbbbbbbbbbbbbbbb") });
    const r = await kit.send("/api/gallery", { headers: owner.headers });
    expect((r.json as { id: string }[]).map((i) => i.id)).toEqual(["greenhouse"]);
    expect(r.text).not.toContain("w-aaaa");
    expect(r.text).not.toContain("w-bbbb");
  });

  it("leaves out a world with no thumbnail or no credit, and one whose manifest names another id", async () => {
    const kit = worldsKit();
    const { thumb: _t, ...noThumb } = galleryManifest("x").assets;
    const { attribution: _a, ...noCredit } = galleryManifest("y");
    addGallery(kit, "no-thumb", { assets: noThumb });
    kit.store.putWorld({ id: "no-credit", kind: "gallery", status: "ready", manifest: { ...noCredit, id: "no-credit" } as WorldManifest });
    kit.store.putWorld({ id: "mismatch", kind: "gallery", status: "ready", manifest: galleryManifest("other-id") });
    addGallery(kit, "fine-world");
    expect(((await kit.send("/api/gallery")).json as { id: string }[]).map((i) => i.id)).toEqual(["fine-world"]);
  });

  it("holds only the five listed fields: no source address, no pose, no preset, no owner", async () => {
    const kit = worldsKit();
    addGallery(kit, "greenhouse", { ghostPreset: "wistful-cook" });
    const r = await kit.send("/api/gallery");
    expect(Object.keys((r.json as object[])[0] as object).sort()).toEqual(["attribution", "description", "id", "thumbUrl", "title"]);
    expect(r.text).not.toMatch(/example\.com|wistful|spawn|ownerSid/);
  });

  it("is public: any cache may keep it for a minute, and no Session cookie is written, even for a visitor with none", async () => {
    const kit = worldsKit();
    addGallery(kit, "greenhouse");
    const r = await kit.send("/api/gallery");
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(r.headers.get("Set-Cookie")).toBeNull();
  });

  it("works while worlds are closed, with no key and with every cap spent (Requirement 9.3)", async () => {
    const store = new MemoryWorldStore();
    store.putWorld({ id: "greenhouse", kind: "gallery", status: "ready", manifest: galleryManifest("greenhouse") });
    const app = createApp({ worlds: { store }, worldGenAvailable: false, spend: async () => ({ world: 0, image: 0, llm: 0, tts: 0, stt: 0, live: 0, killed: true, dayCapReached: true, totalCapReached: true }) as never });
    const res = await app.request("http://app.test/api/gallery", {}, { WORLD_GEN_ENABLED: "false", HMAC_SECRET: "test-secret-0123456789abcdef-test" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { id: string }[]).map((i) => i.id)).toEqual(["greenhouse"]);
  });

  it("is not in the way of the world routes: a Gallery world is still read at its own address", async () => {
    const kit = worldsKit();
    addGallery(kit, "greenhouse");
    expect((await kit.send("/api/worlds/greenhouse")).status).toBe(200);
  });
});
