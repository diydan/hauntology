import { describe, expect, it } from "vitest";

// Source-level rules for web/src/table/ (spirit-table 1.3, 3.4, 5.1, task 2.13): nothing in web/src/table/ sends a message,
// stores a Mark, a direction or a picture, or records/captures the camera stream.
const files = import.meta.glob(["./**/*.ts", "./**/*.tsx", "!./**/*.test.ts", "!./**/*.test.tsx"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const paths = Object.keys(files).sort();
const code = (p: string): string => (files[p] ?? "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("web/src/table source rules", () => {
  it("finds the table UI files", () => {
    expect(paths).toContain("./TheoryChoice.tsx");
  });

  it("never sends a message or stores a Mark, a direction or a picture, and never records or copies the camera stream", () => {
    const banned = [
      /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bsendBeacon\b/,
      /\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/, /document\.cookie/,
      /\bMediaRecorder\b/, /\bImageCapture\b/, /\bgetDisplayMedia\b/, /drawImage\s*\(\s*video/i,
    ];
    for (const p of paths) {
      const stripped = code(p);
      for (const re of banned) expect(re.test(stripped), `${p} uses ${re}`).toBe(false);
    }
  });
});
