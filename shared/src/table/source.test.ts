import { describe, expect, it } from "vitest";

// Source-level rules for the Spirit table's logic (spirit-table 3.1, 3.4, 5.1): it is pure and it can only see what the
// phone may already see. Nothing here imports the Solution, a Hand, a Residue position or the Room seed, sends a message,
// stores anything, or touches the browser, the clock, the camera or the platform's random numbers.
const nodeFs = "node:fs";
const nodeUrl = "node:url";
const fs = (await import(nodeFs)) as { readdirSync(p: string): string[]; readFileSync(p: string, enc: string): string };
const url = (await import(nodeUrl)) as { fileURLToPath(u: string): string };
const dir = url.fileURLToPath(new URL("./", import.meta.url).href);
const sources = fs.readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".arb.ts"));
const code = (f: string): string => fs.readFileSync(`${dir}${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("shared/src/table source rules", () => {
  it("finds the logic files", () => {
    expect(sources).toEqual(expect.arrayContaining(["marks.ts", "notebook.ts", "rag.ts"]));
  });

  it("imports only its own files and the notebook and Theory marks of the party logic: no Solution, Hand, Residue position, seed, web or api", () => {
    const allowed = new Set(["../party/notebook", "../party/theory"]);
    for (const f of sources) {
      for (const m of code(f).matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
        const spec = m[1] ?? "";
        expect(spec.startsWith("./") || allowed.has(spec), `${f} imports ${spec}`).toBe(true);
      }
    }
  });

  it("never names a Solution, a Hand, a Residue position or the Room seed", () => {
    for (const f of sources) for (const word of [/solution/i, /\bhand\b/i, /\bseed\b/i, /residue(?!")/i]) expect(word.test(code(f)), `${f} uses ${word}`).toBe(false);
  });

  it("uses no browser, network, storage, clock, camera or platform random: the table's logic depends on its input alone", () => {
    const banned = [/\bwindow\b/, /\bdocument\b/, /\bnavigator\b/, /\bfetch\s*\(/, /\bWebSocket\b/, /\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/, /Math\.random\s*\(/, /Date\.now\s*\(/, /new Date\b/, /\bperformance\.now\b/, /getUserMedia/, /MediaRecorder/];
    for (const f of sources) for (const re of banned) expect(re.test(code(f)), `${f} uses ${re}`).toBe(false);
  });
});
