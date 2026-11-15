import { describe, expect, it } from "vitest";
import tokensCss from "../styles/tokens.css?raw";

// One spacing scale for the puzzle screens: the design tokens --space-1 to --space-4 (4, 8, 12 and 16 px; design/tokens.json writes
// them into tokens.css). Every gap, margin and padding in the puzzle styles is zero, auto, or a size built from those tokens and
// the safe-area insets: no raw rem or px of its own. So two screens never differ by a stray 0.6rem or 1.25rem, and a new rule
// cannot drift off the scale.
const sheets = import.meta.glob(["./**/*.css", "!./demo/**/*.css"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const PROPERTY = /^(gap|row-gap|column-gap|margin(-[a-z]+)*|padding(-[a-z]+)*)$/;

/** The declarations of a sheet as [selector, property, value], with comments removed. */
function declarations(css: string): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const rule of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (rule[1] ?? "").trim();
    for (const decl of (rule[2] ?? "").split(";")) {
      const at = decl.indexOf(":");
      if (at < 0) continue;
      out.push([selector, decl.slice(0, at).trim(), decl.slice(at + 1).trim()]);
    }
  }
  return out;
}
/** The tokens of a value once every function call (var, env, max, min, calc) is taken out: those are checked by their own rule. */
function bare(value: string): string[] {
  let v = value;
  for (let i = 0; i < 6 && /\([^()]*\)/.test(v); i++) v = v.replace(/[a-z-]+\([^()]*\)/g, "FN");
  return v.split(/\s+/).filter((t) => t.length > 0 && t !== "FN" && t !== "!important");
}

describe("puzzle spacing", () => {
  it("finds the style sheets", () => {
    const names = Object.keys(sheets);
    expect(names.length).toBeGreaterThan(8);
    expect(names).toContain("./puzzles.css");
    expect(names.some((n) => n.includes("demo"))).toBe(false);
  });

  it("keeps every gap, margin and padding on the scale (0, auto, or built from a --space token)", () => {
    let checked = 0;
    for (const [name, css] of Object.entries(sheets)) {
      for (const [selector, property, value] of declarations(css)) {
        if (!PROPERTY.test(property)) continue;
        for (const token of bare(value)) {
          checked++;
          const ok = token === "0" || token === "auto";
          expect(ok, `${name}: ${selector} { ${property}: ${value} } uses ${token}`).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it("takes the four steps from the design tokens, which have the values of the scale, and uses no other step and no scale of its own", () => {
    const tokens = Object.fromEntries([...tokensCss.matchAll(/--space-(\d):\s*([0-9.]+rem)/g)].map((m) => [m[1] ?? "", m[2] ?? ""]));
    expect(tokens).toMatchObject({ "1": "0.25rem", "2": "0.5rem", "3": "0.75rem", "4": "1rem" });
    for (const [name, css] of Object.entries(sheets)) {
      expect(css, `${name} defines a scale of its own`).not.toMatch(/--pz-space/);
      for (const m of css.matchAll(/var\(--space-(\d+)\)/g)) expect(["1", "2", "3", "4"], `${name} uses --space-${m[1]}`).toContain(m[1]);
    }
  });

  it("stacks a screen's blocks 12 px apart (the third token) and the things that belong together 8 px apart (the second)", () => {
    const css = sheets["./puzzles.css"] ?? "";
    const rule = (selector: string): string => declarations(css).filter(([s]) => s === selector).map(([, p, v]) => `${p}:${v}`).join(";");
    expect(rule(".pz-stage > div:not(.pz-skeleton)")).toContain("gap:var(--space-3)");
    expect(rule(".pz-host")).toContain("gap:var(--space-3)");
    expect(rule(".pz-field")).toContain("gap:var(--space-2)");
    expect(rule(".pz-twist")).toContain("gap:var(--space-2)");
    expect(rule(".pz-host .pz-card")).toContain("gap:var(--space-3)");
  });
});
