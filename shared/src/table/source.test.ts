import { describe, expect, it } from "vitest";

// Source-level rules for the Spirit table's logic (spirit-table 1.3, 3.1, 3.3, 3.4, 5.1): it is pure and it can only see what
// the phone may already see. Nothing here imports the Solution, a Hand, a Residue position or the Room seed, sends a message,
// stores anything, or touches the browser, the clock, the camera or the platform's random numbers.
const nodeFs = "node:fs";
const nodeUrl = "node:url";
const fs = (await import(nodeFs)) as { readdirSync(p: string): string[]; readFileSync(p: string, enc: string): string };
const url = (await import(nodeUrl)) as { fileURLToPath(u: string): string };
const dir = url.fileURLToPath(new URL("./", import.meta.url).href);
const sources = fs.readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".arb.ts"));
const code = (f: string): string => fs.readFileSync(`${dir}${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("shared/src/table source rules", () => {
  it("finds all pure logic files", () => {
    expect(sources).toEqual(expect.arrayContaining(["data.ts", "hash.ts", "layout.ts", "marks.ts", "notebook.ts", "pawns.ts", "place.ts", "plan.ts", "rag.ts", "whisper.ts"]));
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

  it("never names a Hand, a Residue position, the Room seed or party/solution; data.ts reads ending.solution only after phase === 'ended'", () => {
    const alwaysBanned = [/\bhand\b/i, /\bhands\b/i, /\bseed\b/i, /residue(?!")/i, /\bresidueAt\b/i, /\bdeal\b/i, /\bsealed\b/i, /shownToMe/i, /party\/solution/i];
    for (const f of sources) {
      const stripped = code(f);
      for (const word of alwaysBanned) expect(word.test(stripped), `${f} uses ${word}`).toBe(false);
      if (f === "data.ts") {
        const matches = [...stripped.matchAll(/solution/gi)];
        expect(matches.length).toBeGreaterThan(0);
        for (const m of matches) {
          const ctx = stripped.slice(Math.max(0, (m.index ?? 0) - 32), (m.index ?? 0) + 16);
          expect(/(?:TableEnding\s*=\s*Readonly<\{\s*solution|pub\.ending\.solution)/.test(ctx), `${f} uses solution outside ending: ${ctx}`).toBe(true);
        }
        expect(/pub\.phase\s*===\s*"ended"/.test(stripped)).toBe(true);
      } else {
        expect(/solution/i.test(stripped), `${f} uses /solution/i`).toBe(false);
      }
    }
  });

  it("uses no browser, network, storage, clock, camera or platform random: the table's logic depends on its input alone", () => {
    const banned = [
      /\bwindow\b/, /\bdocument\b/, /\bnavigator\b/, /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bsendBeacon\b/,
      /\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/, /document\.cookie/, /Math\.random\s*\(/, /Date\.now\s*\(/,
      /new Date\b/, /\bperformance\.now\b/, /getUserMedia/, /MediaRecorder/, /ImageCapture/, /getDisplayMedia/,
    ];
    for (const f of sources) for (const re of banned) expect(re.test(code(f)), `${f} uses ${re}`).toBe(false);
  });
});
