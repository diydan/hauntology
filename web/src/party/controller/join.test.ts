import { describe, expect, it } from "vitest";
import { CODE_ALPHABET } from "@hauntology/shared/party/roomCode";
import { CODE_HINT, NICKNAME_MAX, inCode, readJoin, refusalWords, typedCode } from "./join";

describe("what a Player typed becomes what the Room is asked", () => {
  it("reads a Room Code in any case, with spaces or dashes, as the Room itself does", () => {
    for (const typed of ["k7m2", "K7M2", " k7 m2 ", "K7-M2", "k-7-m-2"]) expect(readJoin(typed, "Ann"), typed).toEqual({ ok: true, code: "K7M2", nickname: "Ann" });
    expect(typedCode("k7m2")).toBe("K7M2");
  });

  it("never sends a code that cannot be a code: wrong length, or a letter that looks like another (no 0, O, 1, I or L)", () => {
    for (const bad of ["", "K7M", "K7M22", "K7M0", "K7MO", "K7M1", "K7MI", "K7ML", "K7M!", "K 7"]) {
      const ask = readJoin(bad, "Ann");
      expect(ask.ok, bad).toBe(false);
      if (!ask.ok) expect(ask.words).toMatch(/4 letters or numbers/);
    }
    expect([...CODE_ALPHABET].every((ch) => inCode(ch))).toBe(true);
    for (const ch of "0O1IL") expect(inCode(ch), ch).toBe(false);
    expect(CODE_HINT).toMatch(/No 0, O, 1, I or L/);
  });

  it("cleans the nickname the way the Room does before it is sent: no markup, no links, at most 16 characters, and Player when nothing is left", () => {
    const name = (raw: string): string => { const a = readJoin("K7M2", raw); if (!a.ok) throw new Error("code"); return a.nickname; };
    expect(name("  Ann  ")).toBe("Ann");
    expect(name("<b>Ann</b>")).toBe("Ann");
    expect(name("Ann www.example.com")).toBe("Ann");
    expect(name("A".repeat(40))).toBe("A".repeat(NICKNAME_MAX));
    expect(name("")).toBe("Player");
    expect(name("<script></script>")).toBe("Player");
    expect(name("Ann\u0007\u0000")).toBe("Ann");
  });
});

describe("the Room's refusals in plain words", () => {
  it("has its own words for each refusal, and they say the same whatever is inside the Room", () => {
    const full = refusalWords("room_full");
    const started = refusalWords("game_started");
    const unknown = refusalWords("room_unknown");
    const away = refusalWords("unreachable");
    expect(new Set([full.title, started.title, unknown.title, away.title]).size).toBe(4);
    expect(unknown.title).toMatch(/code/i);
    expect(full.title).toMatch(/full/i);
    expect(started.title).toMatch(/begun|started/i);
    expect(away.title).toMatch(/reach/i);
    // nothing about who is in a Room, how many, or what they are playing
    for (const words of [full, started, unknown, away]) expect(`${words.title} ${words.body}`).not.toMatch(/\d|player|seat|world|nickname/i);
  });
});
