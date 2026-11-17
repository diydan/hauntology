import { describe, expect, it } from "vitest";
import { replyChecksFor, stripPetNames, validateGhostReply } from "./narration";
import type { Directive } from "./types";

// The owner, 2026-11-16: "cut down how often the ghost says dear". The fourth play-through still had a pet name in 12 of 60 replies, because the
// game keeps only two turns of history, so "at most once a visit" could not hold. Now the prompt asks for none, and a pet name used only as a form of
// address is cut out of the reply instead of the whole reply being thrown away.
describe("no pet names for the visitor", () => {
  it("cuts a pet name out where it is only a form of address, and closes the sentence up", () => {
    const cases: [string, string][] = [
      ["Look all you like, dear, the dust will hold still for you.", "Look all you like, the dust will hold still for you."],
      ["Dear, it is close.", "It is close."],
      ["Oh, my dear, it is close.", "Oh, it is close."],
      ["It is here, dearest.", "It is here."],
      ["Go behind you, dear, and keep to the wall.", "Go behind you, and keep to the wall."],
      ["Something waits, dear one. Come.", "Something waits. Come."],
      ["My dear, the room is cold. Darling, look.", "The room is cold. Look."],
      ["A dear little room, kept for you.", "A dear little room, kept for you."],
    ];
    for (const [given, kept] of cases) expect(stripPetNames(given), given).toBe(kept);
  });

  it("shows the reply without the pet name, for every kind of turn, and refuses one it cannot cut cleanly", () => {
    const kinds: Directive[] = [{ kind: "tease", band: "nearer" }, { kind: "ambient" }, { kind: "echo", anchorId: "a1" }, { kind: "ending" }];
    for (const d of kinds) {
      expect(validateGhostReply("The room is quiet, dear. It has noticed you.", replyChecksFor(d)), d.kind).toEqual({ ok: true, text: "The room is quiet. It has noticed you." });
      expect(validateGhostReply("Come closer, my dear friend of the attic.", replyChecksFor(d)), d.kind).toEqual({ ok: false, reason: "pet_name" });
    }
    const hint = replyChecksFor({ kind: "hint", bearing: "ahead-right", band: "very close" });
    expect(validateGhostReply("Ahead and to the right, dear, and it is very close.", hint)).toEqual({ ok: true, text: "Ahead and to the right, and it is very close." });
  });

});
