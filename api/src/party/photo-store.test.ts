import { describe, expect, it } from "vitest";
import { R2PhotoStore, type PartyBucket } from "./photo-store";

class FakeBucket implements PartyBucket {
  objects = new Map<string, Uint8Array>();
  page = 2;
  async get(): Promise<null> { return null; }
  async put(key: string, value: ArrayBuffer | ArrayBufferView): Promise<void> { this.objects.set(key, new Uint8Array(value as ArrayBuffer)); }
  async delete(key: string): Promise<void> { this.objects.delete(key); }
  async list(o: { prefix?: string; cursor?: string } = {}): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }> {
    const keys = [...this.objects.keys()].filter((k) => k.startsWith(o.prefix ?? "") && (o.cursor === undefined || k > o.cursor)).sort();
    const slice = keys.slice(0, this.page);
    const more = keys.length > this.page;
    return { objects: slice.map((key) => ({ key })), truncated: more, ...(more ? { cursor: slice[slice.length - 1] as string } : {}) };
  }
}

describe("R2PhotoStore (party-mode 10.4)", () => {
  it("keeps a photo under the Room's private prefix and deletes the Room's photos, ghosts and Sprites across pages, and nothing of another Room", async () => {
    const b = new FakeBucket(); const s = new R2PhotoStore(b);
    for (const id of ["a", "b", "c", "d", "e"]) await s.put(id, new Uint8Array([1]), { contentType: "image/jpeg", room: "room-ABCD", seat: 1 });
    await s.put("z", new Uint8Array([1]), { contentType: "image/jpeg", room: "room-WXYZ", seat: 1 });
    await b.put("worlds/room-ABCD-2/ghost.json", new Uint8Array([2]));
    await b.put("sprites/room-ABCD-2", new Uint8Array([2]));
    await b.put("worlds/room-ABCD-6/ghost.json", new Uint8Array([2]));
    await b.put("sprites/room-WXYZ-2", new Uint8Array([2]));
    await b.put("worlds/room-ABCD-22/ghost.json", new Uint8Array([2])); // not a seat of this Room
    expect([...b.objects.keys()].filter((k) => k.startsWith("party/room-ABCD/"))).toHaveLength(5);
    await s.deleteRoom("room-ABCD");
    expect([...b.objects.keys()].sort()).toEqual(["party/room-WXYZ/photos/z", "sprites/room-WXYZ-2", "worlds/room-ABCD-22/ghost.json"]);
  });
  it("makes an object name from the photo id that cannot climb out of the prefix", async () => {
    const b = new FakeBucket(); const s = new R2PhotoStore(b);
    await s.put("../../uploads/x", new Uint8Array([1]), { contentType: "image/jpeg", room: "room-ABCD", seat: 1 });
    expect([...b.objects.keys()]).toEqual(["party/room-ABCD/photos/______uploads_x"]);
  });
});
