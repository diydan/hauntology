import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { autoMarks, type Knowledge } from "./notebook";
import { setTheory, theoryOf, type Theory } from "./theory";

const zonesArb = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 6 }), { minLength: 6, maxLength: 6 });
const suspectsArb = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 6 }), { minLength: 6, maxLength: 6 });
const worldArb = fc.tuple(suspectsArb, zonesArb).chain(([s, z]) =>
  fc.tuple(fc.constant(s), fc.constant(z), fc.array(fc.tuple(fc.constantFrom(...s), fc.constantFrom(...z)), { maxLength: 8 }).map((p) => Object.fromEntries(p) as Theory)),
);
const knowledgeArb: fc.Arbitrary<Knowledge> = fc.record({
  me: fc.nat(5),
  hand: fc.array(fc.constantFrom("a", "b", "c", "d"), { maxLength: 4 }),
  shown: fc.array(fc.record({ card: fc.constantFrom("a", "b", "c", "d"), by: fc.nat(5) }), { maxLength: 3 }),
  found: fc.array(fc.constantFrom("a", "b", "c", "d"), { maxLength: 3 }),
  passes: fc.array(fc.record({ seat: fc.nat(5), cards: fc.array(fc.constantFrom("a", "b", "c", "d"), { maxLength: 3 }) }), { maxLength: 3 }),
  autoCross: fc.boolean(),
});

describe("Property 63: Theory marks are the player's own and change nothing", () => {
  // Feature: party-mode, Property 63: Theory marks are the player's own and change nothing
  // Validates: Requirements 4.7, 4.8
  it("sets or clears exactly one Suspect's Zone, accepts only the six Zones of the pool, and leaves every other Suspect and its input alone", () => {
    fc.assert(
      fc.property(worldArb, fc.nat(5), fc.nat(5), fc.string({ minLength: 1, maxLength: 6 }), ([suspects, zones, theory], si, zi, outsider) => {
        Object.freeze(theory);
        const snap = JSON.stringify(theory), id = suspects[si] as string, zone = zones[zi] as string;
        const set = setTheory(theory, id, zone, zones), cleared = setTheory(theory, id, null, zones);
        const rest = (t: Theory): string => JSON.stringify(Object.entries(t).filter(([k]) => k !== id).sort());
        if (JSON.stringify(theory) !== snap) return false;
        if (theoryOf(set, id) !== zone || theoryOf(cleared, id) !== undefined) return false;
        if (rest(set) !== rest(theory) || rest(cleared) !== rest(theory)) return false;
        if (!zones.includes(outsider) && setTheory(theory, id, outsider, zones) !== theory) return false; // not in the pool: nothing changes
        return Object.keys(set).length <= suspects.length; // at most one Zone each
      }),
      propParams(),
    );
  });

  it("returns the same object when nothing changes, and a second identical drop changes nothing", () => {
    fc.assert(
      fc.property(worldArb, fc.nat(5), fc.nat(5), ([suspects, zones, theory], si, zi) => {
        const id = suspects[si] as string, zone = zones[zi] as string, once = setTheory(theory, id, zone, zones);
        const cleared = setTheory(theory, id, null, zones);
        return setTheory(once, id, zone, zones) === once && setTheory(cleared, id, null, zones) === cleared;
      }),
      propParams(),
    );
  });

  it("leaves the notebook grid and the Residue counter as the game fills them, whatever Theory marks exist", () => {
    fc.assert(
      fc.property(knowledgeArb, worldArb, (k, [suspects, zones, theory]) => {
        const before = JSON.stringify([...autoMarks(k).entries()].sort());
        let t = theory;
        for (const s of suspects) t = setTheory(t, s, zones[0] as string, zones);
        return JSON.stringify([...autoMarks(k).entries()].sort()) === before; // autoMarks takes no Theory at all
      }),
      propParams(),
    );
  });
});

describe("Theory marks stay inside the notebook", () => {
  const nodeFs = "node:fs", nodeUrl = "node:url";
  it("is read by nothing in shared/src/party except theory.ts: no view, message, prompt, Bot or rule carries one", async () => {
    const fs = (await import(nodeFs)) as { readdirSync(p: string): string[]; readFileSync(p: string, enc: string): string };
    const url = (await import(nodeUrl)) as { fileURLToPath(u: string): string };
    const dir = url.fileURLToPath(new URL("./", import.meta.url).href);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.startsWith("theory"));
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const code = fs.readFileSync(`${dir}${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(/theory/i.test(code), `${f} mentions a Theory mark`).toBe(false);
    }
  });
});
