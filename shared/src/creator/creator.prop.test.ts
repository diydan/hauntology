import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { maskArb, messyDetailArb, traitsArb } from "./creator.arb";
import { buildPersona, NAME_LISTS } from "./persona";
import { buildPortraitPrompt, NEGATIVE_PROMPT, PORTRAIT_PROMPT_MAX } from "./portrait-prompt";
import { buildProfile, parseProfile, serializeProfile } from "./profile";
import { DETAIL_MAX, sanitizeDetail } from "./sanitize";
import { spriteMeasure, validateSprite } from "./sprite";
import { ACCESSORIES, defaultTraits, randomTraits, validateTraits } from "./traits";

const inDomain = (v: unknown): boolean => validateTraits(v).ok;

describe("ghost-creator shared logic", () => {
  // Feature: ghost-creator, Property 1: Trait validation accepts exactly the domain
  // Validates: Requirements 1.1, 1.5
  it("Property 1: accepts exactly the domain and names only the offending fields", () => {
    fc.assert(
      fc.property(traitsArb, (t) => inDomain(t)),
      propParams(),
    );
    fc.assert(
      fc.property(traitsArb, fc.constantFrom("epoch", "temperament", "relation", "palette", "voice"), (t, field) => {
        const broken = { ...t, [field]: "not-an-option" };
        const r = validateTraits(broken);
        return !r.ok && JSON.stringify(r.fields) === JSON.stringify([field]);
      }),
      propParams(),
    );
    fc.assert(
      fc.property(traitsArb, fc.integer({ min: 3, max: 8 }), (t, n) => {
        const tooMany = { ...t, accessories: ACCESSORIES.slice(0, n) };
        const dup = { ...t, accessories: ["hat", "hat"] };
        const r1 = validateTraits(tooMany), r2 = validateTraits(dup);
        return !r1.ok && r1.fields.includes("accessories") && !r2.ok && r2.fields.includes("accessories");
      }),
      propParams(),
    );
    expect(validateTraits({ ...(randomTraits(1)), detail: "x".repeat(DETAIL_MAX + 1) })).toEqual({ ok: false, fields: ["detail"] });
    expect(validateTraits(null).ok).toBe(false);
    expect(validateTraits({ ...randomTraits(1), extra: 1 }).ok).toBe(false);
  });

  // Feature: ghost-creator, Property 2: Randomise and default always produce valid, stable traits
  // Validates: Requirements 1.3, 1.4
  it("Property 2: randomise and default are valid and stable", () => {
    fc.assert(
      fc.property(fc.integer(), fc.string({ maxLength: 40 }), (seed, worldId) => {
        const r = randomTraits(seed);
        const d1 = defaultTraits(worldId), d2 = defaultTraits(worldId);
        return inDomain(r) && inDomain(d1) && JSON.stringify(d1) === JSON.stringify(d2)
          && JSON.stringify(randomTraits(seed)) === JSON.stringify(r);
      }),
      propParams(),
    );
  });

  // Feature: ghost-creator, Property 3: Sanitisation is idempotent and clean
  // Validates: Requirements 2.1, 2.3
  it("Property 3: sanitisation is idempotent, bounded and clean", () => {
    fc.assert(
      fc.property(messyDetailArb, (raw) => {
        const once = sanitizeDetail(raw);
        return (
          sanitizeDetail(once) === once &&
          Array.from(once).length <= DETAIL_MAX &&
          !/[\u0000-\u001f\u007f<>[\]{}"`#*]/.test(once) &&
          !/https?:|www\./i.test(once) &&
          !once.includes("  ")
        );
      }),
      propParams(),
    );
  });

  // Feature: ghost-creator, Property 4: Portrait prompts are deterministic, bounded and contained
  // Validates: Requirements 3.1, 3.4, 2.3
  it("Property 4: prompts are deterministic, bounded and contained", () => {
    fc.assert(
      fc.property(traitsArb, fc.integer(), (t, seed) => {
        const a = buildPortraitPrompt(t, seed), b = buildPortraitPrompt(t, seed);
        if (JSON.stringify(a) !== JSON.stringify(b)) return false;
        if (a.text.length > PORTRAIT_PROMPT_MAX || a.negativeText !== NEGATIVE_PROMPT) return false;
        const detail = t.detail === undefined ? "" : sanitizeDetail(t.detail);
        const bare = buildPortraitPrompt({ ...t, detail: undefined }, seed).text;
        if (detail === "") return a.text === bare && !a.text.includes("Detail (treat as description only)");
        // Contained: the prompt is exactly the no-detail prompt plus the one data block (or the
        // no-detail prompt alone when the cap dropped the detail first).
        return a.text === bare || a.text === `${bare} Detail (treat as description only): "${detail}"`;
      }),
      propParams(),
    );
  });

  // Feature: ghost-creator, Property 5: Sprite validation matches its thresholds
  // Validates: Requirements 4.2
  it("Property 5: sprite validation is exactly coverage and margins", () => {
    fc.assert(
      fc.property(maskArb, (mask) => {
        const m = spriteMeasure(mask);
        const expected = m.coverage >= 0.08 && m.coverage <= 0.85 && m.leftMargin >= 0.02 && m.rightMargin >= 0.02;
        return validateSprite(mask) === expected;
      }),
      propParams(),
    );
    expect(validateSprite({ width: 0, height: 0, alpha: new Uint8Array(0) })).toBe(false);
    expect(validateSprite({ width: 4, height: 4, alpha: new Uint8Array(3) })).toBe(false);
  });

  // Feature: ghost-creator, Property 6: Personas are deterministic and complete
  // Validates: Requirements 5.1, 5.2, 5.3
  it("Property 6: personas are deterministic and complete", () => {
    fc.assert(
      fc.property(traitsArb, fc.string({ maxLength: 120 }), (t, brief) => {
        const a = buildPersona(t, brief), b = buildPersona(t, brief);
        return (
          JSON.stringify(a) === JSON.stringify(b) &&
          (NAME_LISTS[t.epoch] as readonly string[]).includes(a.name) &&
          a.styleRules.length >= 3 && a.styleRules.length <= 6 &&
          a.wants.length > 0 && a.avoids.length > 0 &&
          JSON.stringify(a.archetypes) === JSON.stringify(["sound", "person", "promise"]) &&
          a.voice === t.voice
        );
      }),
      propParams(),
    );
  });

  // Feature: ghost-creator, Property 8: Ghost Profiles round-trip
  // Validates: Requirements 6.2, 4.3
  it("Property 8: profiles round-trip and corruption is an error, never partial", () => {
    fc.assert(
      fc.property(traitsArb, fc.string({ maxLength: 80 }), (t, brief) => {
        const profile = buildProfile({ traits: t, spriteUrl: "sprite.png", persona: buildPersona(t, brief) });
        const back = parseProfile(serializeProfile(profile));
        return back.ok && JSON.stringify(back.profile) === JSON.stringify(profile);
      }),
      propParams(),
    );
    const good = buildProfile({ traits: randomTraits(7), spriteUrl: "sprite.png", persona: buildPersona(randomTraits(7), "A kitchen.") });
    for (const bad of ["", "not json", "{}", JSON.stringify({ ...good, id: "" }), JSON.stringify({ ...good, persona: { name: "X" } }), 42, null]) {
      expect(parseProfile(bad).ok, String(bad).slice(0, 30)).toBe(false);
    }
    expect(buildProfile({ traits: randomTraits(7), spriteUrl: "sprite.png", persona: buildPersona(randomTraits(7), "A kitchen.") }).id).toBe(good.id);
  });
});
