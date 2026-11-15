import { describe, expect, it } from "vitest";

// Source-level rules for the phone screens (task 9.4): every sensor goes through the feel layer, nothing is recorded, sent
// or stored, and a Kind screen never talks to the browser's sensors, audio, speech or network itself.
const files = import.meta.glob(["./**/*.ts", "./**/*.tsx", "!./**/*.test.ts", "!./**/*.test.tsx"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const all = Object.keys(files).sort();
const rel = (p: string): string => p.replace(/^\.\//, "");
/** Source with comments removed, so a rule is about code and not about prose. */
const code = (p: string): string => (files[p] ?? "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const screens = all.filter((p) => /^kinds\/[A-Za-z-]+\.tsx?$/.test(rel(p)) && !rel(p).endsWith("types.ts") && !rel(p).endsWith("registry.tsx"));

describe("web/src/puzzles source rules", () => {
  it("finds the files", () => {
    expect(all.length).toBeGreaterThan(30);
    expect(screens.filter((p) => p.endsWith(".tsx")).length).toBeGreaterThanOrEqual(11);
  });

  it("records no audio or video anywhere: no MediaRecorder, and no stream is kept", () => {
    for (const p of all) {
      const c = code(p);
      expect(c.includes("MediaRecorder"), rel(p)).toBe(false);
      expect(/createMediaStreamDestination|captureStream|ScriptProcessor|AudioWorklet/.test(c), rel(p)).toBe(false);
    }
  });

  it("sends, stores and reports nothing: no network, no storage, no cookies, no analytics, no console", () => {
    const banned = [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /sendBeacon/, /localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/, /\bconsole\./, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/];
    for (const p of all) for (const re of banned) expect(re.test(code(p)), `${rel(p)} uses ${re}`).toBe(false);
  });

  it("keeps the sensors in the feel layer: only feel/ and the demo touch vibration, audio, the microphone and motion events", () => {
    const sensors = [/navigator\.vibrate/, /\bAudioContext\b/, /webkitAudioContext/, /getUserMedia/, /deviceorientation/i, /devicemotion/i, /DeviceOrientationEvent/, /DeviceMotionEvent/];
    for (const p of all.filter((q) => !rel(q).startsWith("feel/"))) for (const re of sensors) expect(re.test(code(p)), `${rel(p)} uses ${re}`).toBe(false);
  });

  it("keeps speech in speech.ts, and a Kind screen never reaches for the browser's speech or sensors", () => {
    for (const p of all.filter((q) => rel(q) !== "speech.ts")) expect(/speechSynthesis|SpeechSynthesisUtterance/.test(code(p)), rel(p)).toBe(false);
    for (const p of screens) {
      expect(/\bnavigator\b/.test(code(p)), `${rel(p)} uses navigator`).toBe(false);
      expect(/\.(vibrate|requestPermission)\b/.test(code(p)), `${rel(p)} buzzes or asks for permission itself`).toBe(false);
    }
  });

  it("starts every frame loop through useFrame, so none runs while the page is hidden", () => {
    for (const p of all.filter((q) => rel(q) !== "hooks.ts")) expect(/requestAnimationFrame/.test(code(p)), rel(p)).toBe(false);
  });

  it("imports nothing from the rest of the web app or the api", () => {
    for (const p of all) {
      const specs = [...code(p).matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1] ?? "");
      for (const s of specs) expect(/(^|\/)app(\/|$)|@hauntology\/(api|web)|(^|\/)api\//.test(s), `${rel(p)} imports ${s}`).toBe(false);
    }
  });
});
