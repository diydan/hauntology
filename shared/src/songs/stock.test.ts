import { describe, expect, it } from "vitest";
import { CURATED_ZONE_NAMES, RELICS } from "../party/pool";
import { PRESET_GHOSTS } from "../party/preset-ghosts";
import { BOT_NAMES } from "../party/solo";
import { FORBIDDEN_WORDS, STOCK_SONGS, whenOf } from "./stock";

describe("when each Stock Song plays", () => {
  it("every Stock Song has a rule", () => {
    for (const s of STOCK_SONGS) expect(whenOf(s), s.id).not.toBe("Not used");
  });
});

describe("Stock Songs (game-songs 6.1, 6.3, 6.4)", () => {
  it("has the whole catalogue, once each", () => {
    const count = (k: string) => STOCK_SONGS.filter((s) => s.kind === k).length;
    expect([count("title"), count("lobby"), count("haunt"), count("sting"), count("fallback")]).toEqual([1, 1, 3, 3, 5]);
    expect(count("relic")).toBe(RELICS.length);
    expect(count("zone")).toBe(CURATED_ZONE_NAMES.length);
    expect(count("ghost")).toBe(PRESET_GHOSTS.length);
    expect(STOCK_SONGS).toHaveLength(13 + 6 + 12 + 8);
    expect(new Set(STOCK_SONGS.map((s) => s.id)).size).toBe(STOCK_SONGS.length);
  });

  it("no prompt or lyric names a real maker or another work, or a Player", () => {
    for (const s of STOCK_SONGS) {
      const text = `${s.title}\n${s.style}\n${s.lyrics ?? ""}`.toLowerCase();
      for (const w of FORBIDDEN_WORDS) expect(text, `${s.id}: ${w}`).not.toContain(w);
      for (const n of BOT_NAMES) expect(text, `${s.id}: ${n}`).not.toContain(n.toLowerCase());
      expect(text).not.toMatch(/\byou\b.*\bseat\b/);
    }
  });

  it("a Relic or Zone song names only its own Relic or Zone", () => {
    for (const s of STOCK_SONGS.filter((x) => x.kind === "zone")) {
      const others = CURATED_ZONE_NAMES.filter((z) => z !== s.title);
      for (const z of others) expect(s.lyrics).not.toContain(z);
    }
    for (const s of STOCK_SONGS.filter((x) => x.kind === "relic")) {
      const others = RELICS.filter((r) => !s.title.toLowerCase().includes(r.name));
      for (const r of others) expect(s.lyrics!.toLowerCase()).not.toContain(r.name);
    }
  });

  it("every sung song says who sings; instrumentals have no voice", () => {
    for (const s of STOCK_SONGS) {
      if (s.lyrics === null) expect(s.voice).toBeUndefined();
      else { expect(s.voice).toMatch(/^lead vocal: /); expect(s.style).toContain(s.voice); }
    }
    const male = ["preset-1", "preset-4", "preset-7"].map((id) => STOCK_SONGS.find((s) => s.id === `ghost-${id}`)!.voice);
    for (const v of male) expect(v).toMatch(/\bmale\b/);
  });
});

