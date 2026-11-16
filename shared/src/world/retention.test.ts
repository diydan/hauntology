import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import {
  DEFAULT_RETENTION, OBJECT_KINDS, expiredKeys, expiredObjects, retentionFromEnv, ttlOf,
  type ObjectKind, type StoredObject,
} from "./retention";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = 1_800_000_000_000;
const obj = (kind: ObjectKind, ageMs: number, key = `${kind}-${ageMs}`): StoredObject => ({ key, kind, createdAt: NOW - ageMs });

describe("expiredKeys", () => {
  it("keeps an object that is exactly as old as its time, and lists one that is a millisecond older", () => {
    expect(expiredKeys([obj("upload", 24 * HOUR)], NOW)).toEqual([]);
    expect(expiredKeys([obj("upload", 24 * HOUR + 1)], NOW)).toEqual(["upload-86400001"]);
    expect(expiredKeys([obj("world", 7 * DAY)], NOW)).toEqual([]);
    expect(expiredKeys([obj("world", 7 * DAY + 1)], NOW)).toEqual(["world-604800001"]);
  });

  it("gives uploads and candidates 24 hours and worlds and sprites 7 days", () => {
    expect(ttlOf("upload")).toBe(24 * HOUR);
    expect(ttlOf("candidate")).toBe(24 * HOUR);
    expect(ttlOf("world")).toBe(7 * DAY);
    expect(ttlOf("sprite")).toBe(7 * DAY);
    expect(ttlOf("gallery")).toBeNull();
    const two = [obj("candidate", 2 * DAY, "c"), obj("sprite", 2 * DAY, "s")];
    expect(expiredKeys(two, NOW)).toEqual(["c"]);
  });

  it("never lists a Gallery object, however old", () => {
    expect(expiredKeys([obj("gallery", 5000 * DAY)], NOW)).toEqual([]);
  });

  it("returns the objects themselves, with the world each belongs to", () => {
    const o: StoredObject = { key: "worlds/w1/world.json", kind: "world", createdAt: NOW - 8 * DAY, worldId: "w1" };
    expect(expiredObjects([o], NOW)).toEqual([o]);
  });

  it("lists nothing when the clock or an age is not a number", () => {
    expect(expiredKeys([obj("upload", 9 * DAY)], Number.NaN)).toEqual([]);
    expect(expiredKeys([{ key: "x", kind: "upload", createdAt: Number.NaN }], NOW)).toEqual([]);
    expect(expiredKeys([{ key: "x", kind: "upload", createdAt: Number.POSITIVE_INFINITY }], NOW)).toEqual([]);
    // An infinite clock or an infinitely old object would otherwise make everything look expired.
    expect(expiredKeys([obj("upload", 9 * DAY)], Number.POSITIVE_INFINITY)).toEqual([]);
    expect(expiredKeys([{ key: "x", kind: "upload", createdAt: Number.NEGATIVE_INFINITY }], NOW)).toEqual([]);
  });

  it("uses a policy it is given", () => {
    const policy = { uploadMs: HOUR, worldMs: 2 * HOUR };
    expect(expiredKeys([obj("upload", 2 * HOUR, "u"), obj("world", 2 * HOUR, "w")], NOW, policy)).toEqual(["u"]);
  });
});

describe("retentionFromEnv", () => {
  it("defaults to 24 hours and 7 days", () => {
    expect(retentionFromEnv(undefined)).toEqual(DEFAULT_RETENTION);
    expect(retentionFromEnv({})).toEqual(DEFAULT_RETENTION);
  });

  it("reads hours and days, and falls back on anything that is not a positive number", () => {
    expect(retentionFromEnv({ UPLOAD_TTL_HOURS: "2", WORLD_TTL_DAYS: "1" })).toEqual({ uploadMs: 2 * HOUR, worldMs: DAY });
    expect(retentionFromEnv({ UPLOAD_TTL_HOURS: " 12 ", WORLD_TTL_DAYS: "0.5" })).toEqual({ uploadMs: 12 * HOUR, worldMs: DAY / 2 });
    for (const bad of ["", "0", "-3", "abc", "NaN", "Infinity"]) {
      expect(retentionFromEnv({ UPLOAD_TTL_HOURS: bad, WORLD_TTL_DAYS: bad })).toEqual(DEFAULT_RETENTION);
    }
  });
});

/** Property 13: retention deletes exactly the expired non-Gallery objects. */
describe("Property 13: retention deletes exactly the expired non-Gallery objects", () => {
  const kind = fc.constantFrom(...OBJECT_KINDS);
  const stored = fc.record({
    kind,
    ageMs: fc.integer({ min: -DAY, max: 40 * DAY }),
    id: fc.integer({ min: 0, max: 1_000_000 }),
  });

  it("returns exactly the upload-class objects over 24 hours and the world-class objects over 7 days, never Gallery", () => {
    fc.assert(
      fc.property(fc.array(stored, { maxLength: 40 }), (rows) => {
        const objects = rows.map((r, i): StoredObject => ({ key: `k${i}-${r.id}`, kind: r.kind, createdAt: NOW - r.ageMs }));
        const got = new Set(expiredKeys(objects, NOW));
        for (const o of objects) {
          const age = NOW - o.createdAt;
          const shouldGo =
            o.kind === "gallery" ? false
            : o.kind === "upload" || o.kind === "candidate" ? age > 24 * HOUR
            : age > 7 * DAY;
          expect(got.has(o.key)).toBe(shouldGo);
        }
        expect(got.size).toBe(expiredKeys(objects, NOW).length); // no key listed twice
      }),
      propParams(),
    );
  });
});
