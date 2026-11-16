import { describe, expect, it } from "vitest";
import css from "./controller.css?raw";

// Source rules for the phone Controller (party-mode group 9): it keeps nothing of its own on the phone except through `device/`, talks to the Room only
// through the port, and is built from the design system: one main button on the join page, none on the frame.
const files = import.meta.glob(["./**/*.ts", "./**/*.tsx", "!./**/*.test.ts", "!./**/*.test.tsx"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const all = Object.keys(files).sort();
const rel = (p: string): string => p.replace(/^\.\//, "");
const code = (p: string): string => (files[p] ?? "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const shell = all.filter((p) => !rel(p).startsWith("demo/"));

describe("web/src/party/controller source rules", () => {
  it("finds the files", () => {
    expect(all.map(rel)).toEqual(expect.arrayContaining(["Controller.tsx", "JoinPage.tsx", "SeatedFrame.tsx", "MenuSheet.tsx", "LockArea.tsx", "controller-port.ts", "standin-port.ts", "join.ts"]));
  });

  it("stores, sends and reports nothing itself: no storage, no network, no cookies, no console, no raw HTML", () => {
    const banned = [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /sendBeacon/, /localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/, /\bconsole\./, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/];
    for (const p of all) for (const re of banned) expect(re.test(code(p)), `${rel(p)} uses ${re}`).toBe(false);
  });

  it("keeps the phone's settings only through useDeviceSettings (the Controller's one way to remember a choice)", () => {
    expect(code("./Controller.tsx")).toMatch(/useDeviceSettings\(\)/);
    expect(code("./Controller.tsx")).toMatch(/from "\.\.\/\.\.\/device\/device-settings"/);
    for (const p of shell.filter((q) => rel(q) !== "Controller.tsx")) expect(/device\/device-settings/.test(code(p)), `${rel(p)} reaches into the device store`).toBe(false);
  });

  it("imports nothing from the web app shell or the api, and the sensors only through the feel layer", () => {
    for (const p of all) {
      const specs = [...code(p).matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1] ?? "");
      for (const s of specs) expect(/(^|\/)app(\/|$)|@hauntology\/(api|web)|(^|\/)api\//.test(s) && !s.startsWith("@hauntology/shared/app/"), `${rel(p)} imports ${s}`).toBe(false);
    }
    for (const p of all) expect(/navigator\.vibrate|\bAudioContext\b|getUserMedia|deviceorientation|devicemotion/i.test(code(p)), rel(p)).toBe(false);
  });

  it("has one main button: Join. The frame and the menu have none (a Lock brings its own)", () => {
    const primaries = shell.map((p) => [rel(p), (code(p).match(/ui-button--primary/g) ?? []).length] as const).filter(([, n]) => n > 0);
    expect(primaries).toEqual([["JoinPage.tsx", 1]]);
  });

  it("makes every button and box on its page at least 48 px (--pc-target), in layout-only CSS", () => {
    expect(css).toMatch(/\.pc-page \{[^}]*--pc-target: max\(48px, var\(--target\)\);/);
    expect(css).toMatch(/\.pc-page \.ui-button, \.pc-page \.ui-input \{ min-height: var\(--pc-target\); \}/);
    expect(css).toMatch(/@media \(orientation: landscape\) and \(max-height: 32rem\) \{[\s\S]*?\.pc-pad \{ grid-template-columns: repeat\(3,/);
    expect(css).toMatch(/min-height: 100vh; min-height: 100dvh;/); // dvh with the vh fallback
    expect(css).not.toMatch(/:hover/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});
