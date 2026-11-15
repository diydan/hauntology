import { describe, expect, it } from "vitest";

// One spacing scale for the puzzle screens: 4, 8, 12 and 16 px (0.25, 0.5, 0.75 and 1 rem). Every gap, margin and padding in
// the puzzle styles is zero, auto, a --pz-space token, a size built from a token or the safe-area insets, or one of those
// four rem values. So two screens never differ by a stray 0.6rem or 1.25rem, and a new rule cannot drift off the scale.
const sheets = import.meta.glob(["./**/*.css", "!./demo/**/*.css"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const SCALE = new Set(["0.25rem", "0.5rem", "0.75rem", "1rem"]);
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

  it("keeps every gap, margin and padding on the scale (0, auto, a token, or 0.25, 0.5, 0.75 or 1 rem)", () => {
    let checked = 0;
    for (const [name, css] of Object.entries(sheets)) {
      for (const [selector, property, value] of declarations(css)) {
        if (!PROPERTY.test(property)) continue;
        for (const token of bare(value)) {
          checked++;
          const ok = token === "0" || token === "auto" || SCALE.has(token);
          expect(ok, `${name}: ${selector} { ${property}: ${value} } uses ${token}`).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it("defines the four tokens once, with the values of the scale, and only uses tokens that exist", () => {
    const base = sheets["./puzzles.css"] ?? "";
    const tokens = Object.fromEntries([...base.matchAll(/--pz-space-(\d):\s*([0-9.]+rem)/g)].map((m) => [m[1] ?? "", m[2] ?? ""]));
    expect(tokens).toEqual({ "1": "0.25rem", "2": "0.5rem", "3": "0.75rem", "4": "1rem" });
    for (const [name, css] of Object.entries(sheets)) for (const m of css.matchAll(/var\(--pz-space-(\d+)\)/g)) expect(["1", "2", "3", "4"], `${name} uses --pz-space-${m[1]}`).toContain(m[1]);
  });

  it("stacks a screen's blocks 12 px apart (the third token) and the things that belong together 8 px apart (the second)", () => {
    const css = sheets["./puzzles.css"] ?? "";
    const rule = (selector: string): string => declarations(css).filter(([s]) => s === selector).map(([, p, v]) => `${p}:${v}`).join(";");
    expect(rule(".pz-stage > div:not(.pz-skeleton)")).toContain("gap:var(--pz-space-3)");
    expect(rule(".pz-host")).toContain("gap:var(--pz-space-3)");
    expect(rule(".pz-field")).toContain("gap:var(--pz-space-2)");
    expect(rule(".pz-twist")).toContain("gap:var(--pz-space-2)");
    expect(rule(".pz-card")).toContain("gap:var(--pz-space-3)");
  });
});
