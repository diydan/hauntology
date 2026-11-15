import { describe, expect, it } from "vitest";
import elements from "../../../design/elements.css?raw";
import indexHtml from "../../index.html?raw";
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
  // tokens.css is generated from design/tokens.json (`pnpm build-tokens`); tools/test/design-tokens.test.mjs checks the whole file. These six names
  // are the ones steering/visual-style.md has always named, and the rest of this app uses them, so their values must never move.
  it("has the palette from the visual style", () => {
    expect(palette()).toMatchObject({ ink: "#0b0d10", bone: "#e9e4d8", lantern: "#e0a43a", ghost: "#9fe8d0", dust: "#6b6f76", alarm: "#d4604a" });
  });

  it("keeps text at 4.5:1 or more on --ink, and button text on --lantern too", () => {
    const p = palette();
    for (const text of ["bone", "lantern", "ghost", "alarm"]) expect(contrast(p[text]!, p.ink!), text).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.ink!, p.lantern!)).toBeGreaterThanOrEqual(4.5);
  });

  it("--dust is below 4.5:1, so it is never used for text", () => {
    const p = palette();
    expect(contrast(p.dust!, p.ink!)).toBeLessThan(4.5);
    // Neither the app's own style nor the shared elements may set a text colour from it (or from a shape role built on it).
    for (const css of [app, elements]) {
      const dustUses = [...css.matchAll(/([a-z-]+):\s*[^;]*var\(--(?:dust|shape-quiet)\)/g)].map((m) => m[1]);
      for (const property of dustUses) expect(property, "--dust used as a text colour").not.toBe("color");
    }
    expect(elements).toMatch(/--shape-quiet\)/); // the check is looking at the real elements
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
  it("shows a lantern focus ring on every focusable thing (the ring is an element of the design system, on the body's ui-page)", () => {
    expect(elements).toMatch(/\.ui-page :focus-visible\s*{[^}]*outline:\s*var\(--stroke-ring\) solid var\(--focus\)/);
    expect(tokens).toMatch(/--focus:\s*var\(--lantern\)/);
    expect(indexHtml).toMatch(/<body class="ui-page">/);
    // The only ring turned off is on a place to put focus (tabindex -1), never on a control.
    const turnedOff = [...app.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{[^}]*outline:\s*none[^}]*\}/g)].map((m) => m[1]!.trim());
    expect(turnedOff).toEqual(['[tabindex="-1"]:focus']);
  });

  it("makes touch targets at least 44 px", () => {
    expect(tokens).toMatch(/--target:\s*44px/);
    expect(elements).toMatch(/\.ui-button\s*{[^}]*min-height:\s*var\(--target\)/);
    expect(elements).toMatch(/a\.ui-button\s*{[^}]*display:\s*inline-flex/); // a link used as a button is a box, so the height counts
  });

  it("puts the Chat in a bottom sheet below 900 px and a side panel from 900 px, by container query", () => {
    expect(app).toMatch(/\.play-layout\s*{[^}]*container-type:\s*inline-size/);
    expect(app).toMatch(/@container play \(min-width:\s*900px\)\s*{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*22rem/);
    // The narrow layout is one column with the Chat in the second row.
    expect(app).toMatch(/\.play-layout\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
    expect(app).toMatch(/\.play-layout \.chat\s*{[^}]*grid-row:\s*2/);
  });

  it("shows a button that is off the same way whether it is `disabled` or `aria-disabled`", () => {
    const off = (selector: string) => new RegExp(`${selector.replace(/[.[\]()']/g, "\\$&")}\\s*{([^}]*)}`).exec(elements)?.[1] ?? "";
    expect(off(".ui-button:disabled")).toMatch(/opacity:\s*0\.75/);
    expect(off(".ui-button[aria-disabled='true']")).toMatch(/opacity:\s*0\.75/);
    expect(off(".ui-button:disabled")).toMatch(/border-style:\s*dashed/);
    expect(off(".ui-button[aria-disabled='true']")).toMatch(/border-style:\s*dashed/);
    expect(off(".ui-button[aria-disabled='true']")).toMatch(/cursor:\s*not-allowed/);
  });

  it("lays the Gallery out in a grid that never needs more than the screen is wide", () => {
    expect(app).toMatch(/\.gallery\s*{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(min\(100%,\s*14rem\),\s*1fr\)\)/);
  });

  it("has nothing that forces a page wider than 320 px", () => {
    // A fixed width of 321 px or more on any rule would scroll sideways at 320 px.
    for (const m of app.matchAll(/(?<![-\w])width:\s*(\d+)px/g)) expect(Number(m[1])).toBeLessThanOrEqual(320);
    expect(app).toMatch(/overflow-wrap:\s*anywhere/);
    expect(app).toMatch(/img,\s*canvas,\s*video\s*{[^}]*max-width:\s*100%/);
    expect(app).toMatch(/\.screen\s*{[^}]*max-width:\s*48rem/);
  });
});

describe("app.css is layout only", () => {
  // The look (colour, type face, corners) is the design system's: design/tokens.json and design/elements.css.
  const declarations = [...app.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)].map((m) => ({ property: m[1]!, value: m[2]!.trim() }));

  it("writes no colour, type face, corner or shadow of its own", () => {
    expect(declarations.length).toBeGreaterThan(40);
    for (const d of declarations) {
      expect(d.property, `${d.property}: ${d.value}`).not.toMatch(/^(color|background(-[a-z]+)?|border-(?:[a-z]+-)?color|outline-color|font(-family)?|border-radius|box-shadow)$/);
    }
    expect(app).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(app).not.toMatch(/var\(--(ink|ink-deep|void|wood|wood-2|wood-3|ember|wood-line|leather|dust|ash|bone|lantern|lantern-hi|ghost|alarm|surface-[a-z]+|text(-quiet)?|accent(-[a-z]+)?|danger|line(-strong)?)\)/);
  });

  it("puts every gap, margin and padding on the space scale: 0, auto, or a --space token", () => {
    const SPACE = /^(0|auto|var\(--space-[0-6]\)|calc\((?:var\(--space-[0-6]\)|[-+*/() 0-9.])+\))$/;
    const pieces = (value: string): string[] => {
      const out: string[] = [];
      let depth = 0;
      let cur = "";
      for (const ch of value) {
        if (ch === "(") depth += 1;
        if (ch === ")") depth -= 1;
        if (/\s/.test(ch) && depth === 0) {
          if (cur) out.push(cur);
          cur = "";
        } else cur += ch;
      }
      if (cur) out.push(cur);
      return out;
    };
    let checked = 0;
    for (const d of declarations.filter((x) => /^(gap|row-gap|column-gap|padding(-[a-z]+)?|margin(-[a-z]+)?)$/.test(x.property))) {
      for (const piece of pieces(d.value)) {
        checked += 1;
        expect(piece, `${d.property}: ${d.value}`).toMatch(SPACE);
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("is made of the elements: the old look classes are gone from the screens, and the body is a ui-page", () => {
    for (const old of [".button", ".banner", ".reason", ".card", ".notice", ".dialog", ".chat-head", ".line", ".visually-hidden"]) expect(app, old).not.toMatch(new RegExp(`(^|[\\s,}])\\${old}[\\s{,.:\\[]`, "m"));
    expect(elements).toMatch(/\.ui-stack > \*\s*{\s*margin:\s*0;/); // the stack's gap is the only space between its blocks
    expect(app).not.toMatch(/a\.ui-button|\.ui-stack/); // those two live in the elements now, not in a screen's style
  });
});
