import { describe, expect, it } from "vitest";

// Source-level rules for the puzzle logic (task 9.4): it is pure, so it imports nothing but itself, the error codes and zod,
// and it never reaches for the browser, the network, the clock or the platform's random numbers.
// The sources are read at run time with Node's file system (the specifier is a variable so no Node types are needed).
const nodeFs = "node:fs";
const nodeUrl = "node:url";
const fs = (await import(nodeFs)) as { readdirSync(p: string): string[]; readFileSync(p: string, enc: string): string };
const url = (await import(nodeUrl)) as { fileURLToPath(u: string): string };
const dir = url.fileURLToPath(new URL("./", import.meta.url).href);
const sources = fs.readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".arb.ts"));
const read = (f: string): string => fs.readFileSync(`${dir}${f}`, "utf8");
/** Source with comments removed, so a rule is about code and not about prose. */
const code = (f: string): string => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("shared/src/puzzles source rules", () => {
  it("finds the logic files", () => {
    expect(sources.length).toBeGreaterThan(15);
    expect(sources).toContain("verify.ts");
    expect(sources).toContain("make.ts");
  });

  it("imports only its own files, the error codes, zod and nothing from web, api or the world", () => {
    for (const f of sources) {
      const specs = [...code(f).matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1] ?? "");
      for (const s of specs) {
        const ok = s.startsWith("./") || s === "../errors" || s === "zod";
        expect(ok, `${f} imports ${s}`).toBe(true);
      }
    }
  });

  it("uses no browser, network, clock or platform random: a Lock depends on its seed alone", () => {
    const banned = [/\bwindow\b/, /\bdocument\b/, /\bnavigator\b/, /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /Math\.random\s*\(/, /Date\.now\s*\(/, /new Date\s*\(/, /performance\.now/, /\bsetTimeout\s*\(/, /\bsetInterval\s*\(/, /\bMediaRecorder\b/, /\bconsole\./];
    for (const f of sources) for (const re of banned) expect(re.test(code(f)), `${f} uses ${re}`).toBe(false);
  });

  it("makeLock never reads a Solution, a Hand or a Residue position", () => {
    const make = code("make.ts");
    for (const word of ["Solution", "solution", "Hand", "residue", "Residue"]) expect(make.includes(word), word).toBe(false);
  });
});
