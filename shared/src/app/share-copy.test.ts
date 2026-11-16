import { describe, expect, it } from "vitest";
import { resolveRoute } from "./routes";
import { SHARED_LINE, SHARED_OWN_OFF_LINE, SHARED_OWN_ON_LINE, SHARE_COPIED, SHARE_OFF_LINE, SHARE_ON_LINE, shareUrl } from "./share-copy";

const W = "w-aaaaaaaaaaaaaaaaaaaaaa";

describe("shareUrl", () => {
  it("is the origin and /shared/<world id>, and resolves back to the shared route", () => {
    expect(shareUrl("https://hauntology.example", W)).toBe(`https://hauntology.example/shared/${W}`);
    expect(shareUrl("http://localhost:5173", W)).toBe(`http://localhost:5173/shared/${W}`);
    expect(resolveRoute(new URL(shareUrl("https://hauntology.example", W) as string).pathname)).toEqual({ screen: "shared", worldId: W });
  });

  it("carries nothing but the world id: no query, no fragment, no login", () => {
    const link = shareUrl("https://hauntology.example", W) as string;
    const u = new URL(link);
    expect([u.search, u.hash, u.username, u.password]).toEqual(["", "", "", ""]);
    expect(link.endsWith(W)).toBe(true);
  });

  it("makes no link from an origin that is not one, or a world id that is not one", () => {
    for (const origin of ["", "hauntology.example", "https://", "https://a.example/", "https://a.example/path", "https://a.example?x=1", "https://a.example#top", "https://user@a.example", "ftp://a.example", "javascript:alert(1)", "https://a b.example", "https://a.example\\evil"]) {
      expect(shareUrl(origin, W), origin).toBeNull();
    }
    for (const id of ["", "a b", "a/b", "..", "x".repeat(65), "w-é"]) expect(shareUrl("https://hauntology.example", id), id).toBeNull();
    expect(shareUrl("https://hauntology.example", "x".repeat(64))).not.toBeNull();
  });
});

describe("the words", () => {
  it("say who can open the link and when it stops, and are plain sentences", () => {
    expect(SHARE_ON_LINE).toMatch(/Anyone who has this link/);
    for (const stop of ["stop sharing", "delete the place", "time runs out"]) expect(SHARE_ON_LINE).toContain(stop);
    expect(SHARE_OFF_LINE).toMatch(/off until you turn it on/);
    expect(SHARE_COPIED).toBe("Link copied.");
    expect(SHARED_LINE).toBe("Someone shared this place with you.");
    for (const text of [SHARE_ON_LINE, SHARE_OFF_LINE, SHARED_LINE, SHARED_OWN_ON_LINE, SHARED_OWN_OFF_LINE]) expect(text).not.toMatch(/<|>|\{|\}/);
  });

  it("tell the owner who opens their own link that the place is theirs, and whether anyone else can open the link", () => {
    expect(SHARED_OWN_ON_LINE).toMatch(/^This is your place\./);
    expect(SHARED_OWN_ON_LINE).toMatch(/link is on/);
    expect(SHARED_OWN_ON_LINE).toMatch(/anyone who has it/);
    expect(SHARED_OWN_OFF_LINE).toMatch(/^This is your place\./);
    expect(SHARED_OWN_OFF_LINE).toMatch(/link is off/);
    expect(SHARED_OWN_OFF_LINE).toMatch(/only you/);
    // A visitor's line says nothing of ownership; the three are different.
    expect(SHARED_LINE).not.toMatch(/your place/);
    expect(new Set([SHARED_LINE, SHARED_OWN_ON_LINE, SHARED_OWN_OFF_LINE]).size).toBe(3);
  });
});
