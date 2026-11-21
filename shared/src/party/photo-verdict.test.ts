import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { STYLE_NAMES } from "../ghost/style";
import { parsePhotoVerdict, parseSelfieVerdict, SELFIE_GHOST_PROMPT, PHOTO_VET_SYSTEM, SELFIE_VET_SYSTEM } from "./photo-verdict";

describe("photo verdict (party-mode 3.2, 3.9)", () => {
  it("passes only safe:true with personVisible:false, in an object, a JSON string, a fenced string or the response wrapper", () => {
    const ok = { safe: true, personVisible: false };
    for (const v of [ok, JSON.stringify(ok), "```json\n" + JSON.stringify(ok) + "\n```", `Here you go: ${JSON.stringify(ok)} done`, { response: JSON.stringify(ok) }, { response: ok }]) expect(parsePhotoVerdict(v)).toEqual({ kind: "ok" });
  });
  it("names a person, then unsafe, and treats everything else as unusable (fail closed)", () => {
    expect(parsePhotoVerdict({ safe: true, personVisible: true })).toEqual({ kind: "person_visible" });
    expect(parsePhotoVerdict({ safe: false, personVisible: false })).toEqual({ kind: "unsafe" });
    expect(parsePhotoVerdict({ safe: false, personVisible: true })).toEqual({ kind: "unsafe" });
    for (const v of [null, undefined, 7, "", "nonsense", [], { safe: "true", personVisible: false }, { safe: true }, { safe: true, personVisible: "no" }, { personVisible: false }, { safe: 1, personVisible: 0 }]) expect(parsePhotoVerdict(v), JSON.stringify(v)).toEqual({ kind: "unusable" });
  });
  it("never lets a picture through unless both booleans are exactly right, whatever the shape (property)", () => {
    fc.assert(fc.property(fc.anything(), (v) => { const r = parsePhotoVerdict(v); return r.kind !== "ok" || (typeof v === "object" && v !== null && JSON.stringify(v).includes("\"safe\":true")); }), propParams());
    fc.assert(fc.property(fc.boolean(), fc.boolean(), (safe, person) => (parsePhotoVerdict({ safe, personVisible: person }).kind === "ok") === (safe && !person)), propParams());
  });
});

describe("selfie verdict (party-mode 3.12)", () => {
  it("passes one clear face wholly in frame, and nothing else", () => {
    expect(parseSelfieVerdict({ safe: true, faces: 1, inFrame: true })).toEqual({ kind: "ok" });
    expect(parseSelfieVerdict({ safe: true, faces: 0, inFrame: false })).toEqual({ kind: "no_face" });
    expect(parseSelfieVerdict({ safe: true, faces: 1, inFrame: false })).toEqual({ kind: "no_face" });
    expect(parseSelfieVerdict({ safe: true, faces: 2, inFrame: true })).toEqual({ kind: "many_faces" });
    expect(parseSelfieVerdict({ safe: false, faces: 1, inFrame: true })).toEqual({ kind: "unsafe" });
    for (const v of [null, "x", { safe: true, faces: "1", inFrame: true }, { safe: true, faces: 1.5, inFrame: true }, { safe: true, faces: -1, inFrame: true }, { safe: true, faces: 99, inFrame: true }, { safe: true, faces: 1 }]) expect(parseSelfieVerdict(v), JSON.stringify(v)).toEqual({ kind: "unusable" });
    fc.assert(fc.property(fc.anything(), (v) => { const r = parseSelfieVerdict(v); return r.kind !== "ok" || (typeof v === "object" && v !== null); }), propParams());
  });
});

describe("the fixed selfie prompt and vision instructions", () => {
  it("has no Player text, no digit placeholder, and names no artist or title; the vision prompts treat words in the picture as data", () => {
    expect(SELFIE_GHOST_PROMPT).not.toMatch(STYLE_NAMES);
    expect(SELFIE_GHOST_PROMPT).not.toMatch(/[{}<>$]/);
    expect(SELFIE_GHOST_PROMPT).toContain("no blood or gore");
    for (const s of [PHOTO_VET_SYSTEM, SELFIE_VET_SYSTEM]) expect(s).toMatch(/not instructions/);
  });
});
