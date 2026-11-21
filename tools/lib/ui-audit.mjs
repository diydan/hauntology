// The checks of `tools/ui-check.mjs`. The page half (`installAudit`) runs inside Chrome and only measures; `summarize` turns its measurements into
// findings and is plain Node, so the rules can be tested without a browser (`tools/test/ui-audit.test.mjs`).

export const MIN_TARGET_PX = 44;
export const MIN_CONTRAST = 4.5;
export const MIN_CONTRAST_LARGE = 3;

/** Relative luminance of an sRGB colour given as [r, g, b] in 0..255 (WCAG 2.x). */
export function luminance([r, g, b]) {
  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
/** WCAG contrast ratio of two opaque colours. */
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** `top` (with alpha) laid over the opaque `under`. */
export function blend(top, alpha, under) { return top.map((c, i) => Math.round(c * alpha + under[i] * (1 - alpha))); }

/** Installs `window.__uiAudit` in the page: `run()` measures the current view, `focusState()` says what has focus and how it is drawn. */
export function installAudit(helpers) {
  const { luminance, contrastRatio, blend } = helpers;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || n.hasAttribute("hidden") || n.getAttribute("aria-hidden") === "true") return false;
      if (/ui-sr-only/.test(n.className || "")) return false;
    }
    return true;
  };
  const label = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : ""} "${(el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30)}"`;
  const parse = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; }
    const c = s.match(/color\(srgb ([^)]+)\)/);
    if (c) { const p = c[1].split(/[ /]+/).filter(Boolean).map(Number); return { rgb: p.slice(0, 3).map((v) => Math.round(v * 255)), a: p.length > 3 ? p[3] : 1 }; }
    return null;
  };
  /** The colour behind an element: the nearest opaque backgrounds laid under each other; null when an image or gradient is in the way. */
  const backdrop = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== "none") return null;
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0) { layers.push(bg); if (bg.a >= 1) break; }
    }
    let under = [11, 13, 16];
    for (const l of layers.reverse()) under = blend(l.rgb, l.a, under);
    return under;
  };
  const opacityOf = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
  const interactive = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="radio"], [role="switch"], [role="tab"], summary';

  window.__uiAudit = {
    run() {
      const out = { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: [], primary: [], contrast: [], unknownBackdrop: 0, running: [] };
      for (const el of document.querySelectorAll(interactive)) {
        if (!visible(el) || el.disabled) continue;
        let box = el.getBoundingClientRect();
        // a radio or checkbox is pressed through its label (it wraps the box or points at it with `for`), so the label is the target
        if (el.tagName === "INPUT" && /^(radio|checkbox)$/.test(el.type) && el.labels && el.labels.length > 0) box = el.labels[0].getBoundingClientRect();
        if (el.tagName === "A" && el.closest("p, li") && getComputedStyle(el).display === "inline") continue; // a link inside a sentence
        if (Math.min(box.width, box.height) < 44) out.small.push({ el: label(el), w: Math.round(box.width), h: Math.round(box.height) });
      }
      for (const el of document.querySelectorAll(".ui-button--primary")) if (visible(el) && !el.disabled) out.primary.push(label(el));
      for (const el of document.querySelectorAll("body *")) {
        if (!visible(el) || el.disabled || el.closest("[disabled], [aria-disabled='true']")) continue;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
        if (!own) continue;
        const cs = getComputedStyle(el);
        const fg = parse(cs.color);
        const bg = backdrop(el);
        if (!fg || bg === null) { out.unknownBackdrop++; continue; }
        const alpha = fg.a * opacityOf(el);
        const ratio = contrastRatio(blend(fg.rgb, alpha, bg), bg);
        const px = parseFloat(cs.fontSize);
        const large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
        out.contrast.push({ el: label(el), ratio: Math.round(ratio * 100) / 100, large });
      }
      for (const a of document.getAnimations()) {
        if (a.playState !== "running") continue;
        const t = a.effect?.getComputedTiming?.();
        out.running.push({ target: a.effect?.target ? label(a.effect.target) : "?", name: a.animationName || a.transitionProperty || "animation", iterations: t ? String(t.iterations) : "?", ms: t ? Math.round(Number(t.duration)) : 0 });
      }
      return out;
    },
    focusState() {
      const el = document.activeElement;
      if (!el || el === document.body) return { el: "body", ring: true };
      const cs = getComputedStyle(el);
      const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
      const shadow = cs.boxShadow !== "none";
      return { el: label(el), ring: outline || shadow, visible: visible(el) };
    },
  };
}

/** The source that defines the helpers and installs the audit in a page. */
export const AUDIT_SOURCE = `(() => { const luminance = ${luminance.toString()}; const contrastRatio = ${contrastRatio.toString()}; const blend = ${blend.toString()}; (${installAudit.toString()})({ luminance, contrastRatio, blend }); })()`;

/** Findings from one stop's measurements. `focus` is what `focusState` said after each Tab; `reduced` is a run with reduced motion asked for. */
export function summarize(audit, focus, { reduced = false } = {}) {
  const out = [];
  if (audit.overflow > 0) out.push({ kind: "sideways-scroll", detail: `the page is ${audit.overflow}px wider than the screen` });
  for (const s of audit.small) out.push({ kind: "small-target", detail: `${s.el} is ${s.w}x${s.h}px (at least ${MIN_TARGET_PX} needed)` });
  if (audit.primary.length > 1) out.push({ kind: "primary-buttons", detail: `${audit.primary.length} solid yellow buttons: ${audit.primary.join("; ")}` });
  for (const c of audit.contrast) {
    const need = c.large ? MIN_CONTRAST_LARGE : MIN_CONTRAST;
    if (c.ratio < need) out.push({ kind: "contrast", detail: `${c.el} has ${c.ratio}:1 (needs ${need}:1)` });
  }
  for (const f of focus) if (f.el !== "body" && f.visible !== false && !f.ring) out.push({ kind: "focus-ring", detail: `${f.el} shows no ring when it has focus` });
  if (reduced) for (const a of audit.running) if (a.iterations === "Infinity" || a.ms > 100) out.push({ kind: "motion", detail: `${a.target} still runs "${a.name}" (${a.ms} ms, ${a.iterations}x) with reduced motion` });
  return out;
}
