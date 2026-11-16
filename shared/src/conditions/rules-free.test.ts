import { describe, expect, it } from "vitest";

// Source-level rule of the conditions spec (design, "The real world never changes a rule"; tasks 5.5; Requirements 4.1 and 5.1): no module that decides a game imports the
// conditions code. The real world comes in only as looks (the Viewer), words (the narrator prompt, three closed enums) and the Public View, never as an input to a rule.
const nodeFs = "node:fs";
const nodeUrl = "node:url";
const fs = (await import(nodeFs)) as { readdirSync(p: string): string[]; readFileSync(p: string, enc: string): string };
const url = (await import(nodeUrl)) as { fileURLToPath(u: string): string };
const src = url.fileURLToPath(new URL("../", import.meta.url).href);
const code = (path: string): string => fs.readFileSync(`${src}${path}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const importsOf = (path: string): string[] => [...code(path).matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1] ?? "");
const reachesConditions = (spec: string): boolean => /(^|\/)conditions(\/|$)/.test(spec);

/** The rules of a game: the ghost engine and the modules it is made of, and every Party Mode module that decides something (the views, the narrator prompt, the server and the wire format only show it). */
const GHOST_RULES = ["engine.ts", "anchors.ts", "pose.ts", "rate.ts", "rng.ts", "seeds.ts", "parse.ts", "types.ts"].map((f) => `ghost/${f}`);
const PARTY_WORDS = new Set(["views.ts", "prompt.ts", "server.ts", "protocol.ts"]);
const partyRules = fs.readdirSync(`${src}party`).filter((f) => f.endsWith(".ts") && !/\.(test|prop\.test|arb)\.ts$/.test(f) && !PARTY_WORDS.has(f)).map((f) => `party/${f}`);

describe("rules stay free of conditions", () => {
  it("finds the modules it checks", () => {
    expect(GHOST_RULES.every((f) => fs.readdirSync(`${src}ghost`).includes(f.slice(6)))).toBe(true);
    expect(partyRules).toEqual(expect.arrayContaining(["party/engine.ts", "party/turns.ts", "party/haunt.ts", "party/clock.ts"]));
    expect(partyRules.length).toBeGreaterThan(15);
  });

  it("no module of the ghost engine's rules imports the conditions code", () => {
    for (const f of GHOST_RULES) for (const spec of importsOf(f)) expect(reachesConditions(spec), `${f} imports ${spec}`).toBe(false);
  });

  it("no Party Mode module that decides something imports the conditions code", () => {
    for (const f of partyRules) for (const spec of importsOf(f)) expect(reachesConditions(spec), `${f} imports ${spec}`).toBe(false);
  });

  it("the detector sees a real import, of the folder or of a file in it, and nothing else", () => {
    expect(reachesConditions("../conditions/snapshot")).toBe(true);
    expect(reachesConditions("../conditions/types")).toBe(true);
    expect(reachesConditions("@hauntology/shared/conditions/time")).toBe(true);
    expect(reachesConditions("../conditions")).toBe(true);
    expect(reachesConditions("./conditionsish")).toBe(false);
    expect(reachesConditions("./engine")).toBe(false);
  });

  it("the conditions code imports nothing of a game: it cannot reach a rule from its side either", () => {
    const own = fs.readdirSync(`${src}conditions`).filter((f) => f.endsWith(".ts") && !f.includes(".test.") && !f.includes(".prop."));
    for (const f of own) for (const spec of importsOf(`conditions/${f}`)) expect(/\/(ghost|party|puzzles|table)\//.test(spec), `${f} imports ${spec}`).toBe(false);
  });
});
