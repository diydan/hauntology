import { describe, expect, it } from "vitest";
import { PRESET_PROFILES } from "@hauntology/shared/creator/presets";
import { randomTraits } from "@hauntology/shared/creator/traits";
import { MemorySpendGuard } from "../worlds/fakes";
import { DEFAULT_CAPS } from "../worlds/fakes";
import { createCreator, type CreatorDeps } from "./service";
import { MemoryCreatorStore } from "./store";

/** The Creator flow over fakes (ghost-creator task 3). Nothing here calls a model. */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 255] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
};
/** zlib with stored (uncompressed) blocks: enough for a PNG the decoder can inflate. */
function zlibStore(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [Uint8Array.from([0x78, 0x01])];
  for (let at = 0; at < data.length || at === 0; at += 65535) {
    const part = data.subarray(at, Math.min(data.length, at + 65535));
    const head = new Uint8Array(5);
    head[0] = at + 65535 >= data.length ? 1 : 0;
    new DataView(head.buffer).setUint16(1, part.length, true);
    new DataView(head.buffer).setUint16(3, 0xffff - part.length, true);
    blocks.push(head, part);
    if (at + 65535 >= data.length) break;
  }
  let a = 1, b = 0;
  for (const byte of data) { a = (a + byte) % 65521; b = (b + a) % 65521; }
  const tail = new Uint8Array(4);
  new DataView(tail.buffer).setUint32(0, (b << 16) | a);
  blocks.push(tail);
  const out = new Uint8Array(blocks.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of blocks) { out.set(p, at); at += p.length; }
  return out;
}

/** A small RGBA PNG whose subject is a centred block at the given coverage/inset (fractions). */
function pngWithSubject(w: number, h: number, insetFrac: number, opaque = true): Uint8Array {
  const raw = new Uint8Array(h * (1 + w * 4));
  const inset = Math.floor(w * insetFrac);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * (1 + w * 4) + 1 + x * 4;
      const inside = x >= inset && x < w - inset && y >= 2 && y < h - 2;
      raw[i] = 200; raw[i + 1] = 220; raw[i + 2] = 210;
      raw[i + 3] = inside || !opaque ? 255 : 0;
      if (!opaque) raw[i + 3] = 255;
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w); v.setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = 6;
  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibStore(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

const NOW = 1_800_000_000_000;
const traits = { ...randomTraits(4), detail: "kept the lighthouse stairs swept" };

function setup(over: { [K in keyof CreatorDeps]?: CreatorDeps[K] | undefined } = {}, caps = DEFAULT_CAPS) {
  const guard = new MemorySpendGuard(caps, () => NOW);
  const store = new MemoryCreatorStore();
  const calls = { portraits: 0, cuts: 0, moderations: 0 };
  const deps: CreatorDeps = {
    guard,
    portraitist: { render: async () => { calls.portraits++; return { ok: true, image: pngWithSubject(520, 640, 0.1) }; } },
    moderator: { check: async () => { calls.moderations++; return { ok: true, verdict: { kind: "safe" } }; } },
    cutter: { cut: async () => { calls.cuts++; return { ok: true, image: pngWithSubject(40, 60, 0.25) }; } },
    store,
    briefFor: async () => "A narrow kitchen with a window over the sink.",
    now: () => NOW,
    random: (n) => new Uint8Array(n).fill(7),
  };
  for (const k of Object.keys(over) as (keyof CreatorDeps)[]) {
    if (over[k] === undefined) delete deps[k];
    else Object.assign(deps, { [k]: over[k] });
  }
  const creator = createCreator(deps);
  return { creator, guard, store, calls };
}

describe("Creator flow (ghost-creator task 3, Property 7)", () => {
  it("happy path: moderate, two candidates, a cut-out, a persisted profile", async () => {
    const { creator, store, calls } = setup();
    const made = await creator.portraits({ traits, worldId: "w1" }, "sid", "ip");
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(made.candidates).toHaveLength(2);
    expect(calls.moderations).toBe(1);
    const done = await creator.sprite({ candidateId: made.candidates[0]!.candidateId, worldId: "w1" }, "sid", "ip");
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.fallback).toBe(false);
    expect(done.profile.spriteUrl).toBe("/api/ghosts/sprite/w1");
    expect(await creator.profileFor("w1")).toEqual(done.profile);
    expect((await store.readSprite("w1"))?.byteLength).toBeGreaterThan(0);
  });

  it("Property 7: every injected failure ends in a usable profile or a field error", async () => {
    // Quota exhausted: a coded refusal with what is left, and presets remain listable.
    const noQuota = setup({}, { ...DEFAULT_CAPS, image: { session: 0, day: 0 } });
    expect((await noQuota.creator.portraits({ traits, worldId: "w1" }, "sid", "ip")).ok).toBe(false);

    // Generation error.
    const broken = setup({ portraitist: { render: async () => ({ ok: false, kind: "failed" }) } });
    expect(await broken.creator.portraits({ traits, worldId: "w1" }, "sid", "ip")).toEqual({ ok: false, code: "portrait_failed" });

    // Invalid sprite twice: a preset profile, marked as the fallback it is.
    const badCut = setup({ cutter: { cut: async () => ({ ok: true, image: pngWithSubject(40, 60, 0, false) }) } });
    const made = await badCut.creator.portraits({ traits, worldId: "w1" }, "sid", "ip");
    if (!made.ok) throw new Error("portraits should work");
    const fallen = await badCut.creator.sprite({ candidateId: made.candidates[0]!.candidateId, worldId: "w1" }, "sid", "ip");
    expect(fallen.ok && fallen.fallback).toBe(true);
    if (fallen.ok) expect(PRESET_PROFILES.map((p) => p.id)).toContain(fallen.profile.id);

    // Moderation unavailable with no detail: no call is needed, portraits proceed.
    const noMod = setup({ moderator: undefined });
    const noDetail = { ...traits, detail: undefined };
    expect((await noMod.creator.portraits({ traits: noDetail, worldId: "w1" }, "sid", "ip")).ok).toBe(true);
    // ...but with a detail it fails closed, as does an unsafe verdict.
    expect(await noMod.creator.portraits({ traits, worldId: "w1" }, "sid", "ip")).toEqual({ ok: false, code: "moderation_unavailable" });
    const unsafe = setup({ moderator: { check: async () => ({ ok: true, verdict: { kind: "unsafe", categories: ["hate"] } }) } });
    expect(await unsafe.creator.portraits({ traits, worldId: "w1" }, "sid", "ip")).toEqual({ ok: false, code: "detail_unsafe" });

    // Field errors name the field; another Session's candidate is not theirs to cut.
    const { creator } = setup();
    expect(await creator.portraits({ traits: { ...traits, epoch: "roman" }, worldId: "w1" }, "sid", "ip"))
      .toEqual({ ok: false, code: "trait_invalid", fields: ["epoch"] });
    const good = await creator.portraits({ traits, worldId: "w1" }, "sid", "ip");
    if (!good.ok) throw new Error("portraits should work");
    expect(await creator.sprite({ candidateId: good.candidates[0]!.candidateId, worldId: "w1" }, "someone-else", "ip"))
      .toEqual({ ok: false, code: "candidate_missing" });
  });
});
