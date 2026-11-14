import { describe, expect, it } from "vitest";
import app from "./app.css?raw";
import tokens from "./tokens.css?raw";

const palette = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of tokens.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]!] = m[2]!;
  return out;
};

/** WCAG relative luminance and contrast ratio. */
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe("tokens", () => {
  it("has the palette from the visual style", () => {
    expect(palette()).toEqual({ ink: "#0b0d10", bone: "#e9e4d8", lantern: "#e0a43a", ghost: "#9fe8d0", dust: "#6b6f76", alarm: "#d4604a" });
  });

  it("keeps text at 4.5:1 or more on --ink, and button text on --lantern too", () => {
    const p = palette();
    for (const text of ["bone", "lantern", "ghost", "alarm"]) expect(contrast(p[text]!, p.ink!), text).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.ink!, p.lantern!)).toBeGreaterThanOrEqual(4.5);
  });

  it("--dust is below 4.5:1, so it is never used for text", () => {
    const p = palette();
    expect(contrast(p.dust!, p.ink!)).toBeLessThan(4.5);
    const dustUses = [...app.matchAll(/([a-z-]+):\s*[^;]*var\(--dust\)/g)].map((m) => m[1]);
    expect(dustUses.length).toBeGreaterThan(0);
    for (const property of dustUses) expect(property, "--dust used as a text colour").not.toBe("color");
  });

  it("has one fade of 300 to 600 ms that falls to 150 ms or less under reduced motion", () => {
    const fade = /--fade:\s*(\d+)ms/.exec(tokens);
    expect(Number(fade![1])).toBeGreaterThanOrEqual(300);
    expect(Number(fade![1])).toBeLessThanOrEqual(600);
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*{\s*:root\s*{\s*--fade:\s*(\d+)ms/.exec(tokens);
    expect(Number(reduced![1])).toBeLessThanOrEqual(150);
  });

  it("every animation and transition uses the fade token", () => {
    const motion = [...app.matchAll(/(animation|transition)(-duration)?:\s*([^;]+);/g)].map((m) => m[3]!);
    expect(motion.length).toBeGreaterThan(0);
    for (const value of motion) expect(value).toContain("var(--fade)");
  });

  it("names no other origin: no URL, no import, no font file from elsewhere", () => {
    for (const css of [app, tokens]) {
      expect(css).not.toMatch(/https?:\/\//);
      expect(css).not.toMatch(/@import/);
      expect(css).not.toMatch(/url\(/);
    }
  });
});

describe("app styles", () => {
  it("shows a lantern focus ring on every focusable thing", () => {
    expect(app).toMatch(/:focus-visible\s*{[^}]*outline:\s*3px solid var\(--lantern\)/);
  });

  it("makes touch targets at least 44 px", () => {
    expect(tokens).toMatch(/--target:\s*44px/);
    expect(app).toMatch(/\.button\s*{[^}]*min-height:\s*var\(--target\)[^}]*min-width:\s*var\(--target\)/);
  });

  it("puts the Chat in a bottom sheet below 900 px and a side panel from 900 px, by container query", () => {
    expect(app).toMatch(/\.play-layout\s*{[^}]*container-type:\s*inline-size/);
    expect(app).toMatch(/@container play \(min-width:\s*900px\)\s*{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*22rem/);
    // The narrow layout is one column with the Chat in the second row.
    expect(app).toMatch(/\.play-layout\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
    expect(app).toMatch(/\.play-layout \.chat\s*{[^}]*grid-row:\s*2/);
  });

  it("has nothing that forces a page wider than 320 px", () => {
    // A fixed width of 321 px or more on any rule would scroll sideways at 320 px.
    for (const m of app.matchAll(/(?<![-\w])width:\s*(\d+)px/g)) expect(Number(m[1])).toBeLessThanOrEqual(320);
    expect(app).toMatch(/overflow-wrap:\s*anywhere/);
    expect(app).toMatch(/img,\s*canvas,\s*video\s*{[^}]*max-width:\s*100%/);
    expect(app).toMatch(/\.screen\s*{[^}]*max-width:\s*48rem/);
  });
});
