import { describe, expect, it } from "vitest";
import { cleanupExpired } from "./cleanup";
import { MemoryWorldStore } from "./memory-store";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = 1_800_000_000_000;
const B = Uint8Array.from([1]);

describe("cleanupExpired", () => {
  it("deletes uploads past 24 hours and a user's world past 7 days, and keeps the rest and every Gallery object", async () => {
    const s = new MemoryWorldStore();
    s.putObject("uploads/old", "upload", NOW - 25 * HOUR, B);
    s.putObject("uploads/new", "upload", NOW - 23 * HOUR, B);
    s.putObject("candidates/old", "candidate", NOW - 30 * HOUR, B);
    s.putObject("candidates/new", "candidate", NOW - 1 * HOUR, B);
    s.putWorld({ id: "old", kind: "user", ownerSid: "s1", status: "ready" }).putBundleFile("old", "world.json", B, NOW - 8 * DAY);
    s.putWorld({ id: "new", kind: "user", ownerSid: "s1", status: "ready" }).putBundleFile("new", "world.json", B, NOW - 6 * DAY);
    s.putWorld({ id: "gal", kind: "gallery", status: "ready" }).putObject("worlds/gal/world.json", "gallery", NOW - 900 * DAY, B, "gal");

    const result = await cleanupExpired(s, NOW);

    expect(result).toEqual({ objects: 3, worlds: 1 });
    expect([...s.objects.keys()].sort()).toEqual(["candidates/new", "uploads/new", "worlds/gal/world.json", "worlds/new/world.json"]);
    expect([...s.records.keys()].sort()).toEqual(["gal", "new"]);
  });

  it("forgets the whole world, its sprite and its play sessions, when the bundle expires", async () => {
    const s = new MemoryWorldStore();
    s.putWorld({ id: "w", kind: "user", ownerSid: "s1", status: "ready" }).putBundleFile("w", "world.json", B, NOW - 8 * DAY);
    s.putObject("sprites/w", "sprite", NOW - 7 * DAY + HOUR, B, "w"); // not yet expired by itself
    s.addPlaySession("w", "p1");
    await cleanupExpired(s, NOW);
    expect(s.records.size).toBe(0);
    expect(s.objects.size).toBe(0);
    expect(s.playSessions.size).toBe(0);
  });

  it("does not purge a world because only its sprite expired", async () => {
    const s = new MemoryWorldStore();
    s.putWorld({ id: "w", kind: "user", ownerSid: "s1", status: "ready" }).putBundleFile("w", "world.json", B, NOW - 7 * DAY + HOUR);
    s.putObject("sprites/w", "sprite", NOW - 7 * DAY - 1, B, "w");
    const result = await cleanupExpired(s, NOW);
    expect(result).toEqual({ objects: 1, worlds: 0 });
    expect(s.records.has("w")).toBe(true);
    expect(s.objects.has("worlds/w/world.json")).toBe(true);
  });

  it("does nothing, and calls nothing, when nothing has expired", async () => {
    const s = new MemoryWorldStore();
    s.putObject("uploads/new", "upload", NOW, B);
    const calls: string[] = [];
    const spy = Object.assign(Object.create(s), {
      removeObjects: async () => void calls.push("remove"),
      purge: async () => void calls.push("purge"),
      inventory: () => s.inventory(),
    });
    expect(await cleanupExpired(spy, NOW)).toEqual({ objects: 0, worlds: 0 });
    expect(calls).toEqual([]);
  });

  it("uses the retention it is given", async () => {
    const s = new MemoryWorldStore();
    s.putObject("uploads/a", "upload", NOW - 2 * HOUR, B);
    expect(await cleanupExpired(s, NOW, { uploadMs: HOUR, worldMs: DAY })).toEqual({ objects: 1, worlds: 0 });
  });

  it("can run twice", async () => {
    const s = new MemoryWorldStore();
    s.putObject("uploads/a", "upload", NOW - 2 * DAY, B);
    await cleanupExpired(s, NOW);
    expect(await cleanupExpired(s, NOW)).toEqual({ objects: 0, worlds: 0 });
  });
});
