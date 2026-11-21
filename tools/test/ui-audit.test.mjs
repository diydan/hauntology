import assert from "node:assert/strict";
import { test } from "node:test";
import { AUDIT_SOURCE, blend, contrastRatio, luminance, summarize } from "../lib/ui-audit.mjs";

// The rules `tools/ui-check.mjs` applies to what Chrome measures. The browser half is not run here.
const clean = { overflow: 0, small: [], primary: [], contrast: [], unknownBackdrop: 0, running: [] };

test("contrast follows WCAG: black on white is 21:1, equal colours 1:1, and the order does not matter", () => {
  assert.equal(Math.round(contrastRatio([0, 0, 0], [255, 255, 255])), 21);
  assert.equal(contrastRatio([10, 20, 30], [10, 20, 30]), 1);
  assert.equal(contrastRatio([20, 20, 20], [200, 200, 200]), contrastRatio([200, 200, 200], [20, 20, 20]));
  assert.ok(luminance([255, 255, 255]) > luminance([0, 0, 255]));
});

test("blending lays a colour over another by its alpha", () => {
  assert.deepEqual(blend([255, 255, 255], 0.5, [0, 0, 0]), [128, 128, 128]);
  assert.deepEqual(blend([10, 20, 30], 1, [200, 200, 200]), [10, 20, 30]);
  assert.deepEqual(blend([10, 20, 30], 0, [200, 100, 50]), [200, 100, 50]);
});

test("a clean view has no findings, and a view with every kind of fault has one finding for each", () => {
  assert.deepEqual(summarize(clean, []), []);
  const bad = {
    overflow: 12,
    small: [{ el: "button.ui-button \"Go\"", w: 30, h: 30 }],
    primary: ["button A", "button B"],
    contrast: [{ el: "p \"dim\"", ratio: 3.1, large: false }, { el: "h1 \"Big\"", ratio: 3.1, large: true }, { el: "p \"ok\"", ratio: 7, large: false }],
    unknownBackdrop: 4,
    running: [{ target: "div.ui-orb", name: "pulse", iterations: "Infinity", ms: 2000 }, { target: "div", name: "quick", iterations: "1", ms: 50 }],
  };
  const kinds = summarize(bad, [{ el: "button \"Go\"", ring: false, visible: true }, { el: "body", ring: true }], { reduced: true }).map((f) => f.kind);
  assert.deepEqual(kinds, ["sideways-scroll", "small-target", "primary-buttons", "contrast", "focus-ring", "motion"]);
});

test("large text needs 3:1 and small text 4.5:1; exactly on the line passes", () => {
  const at = (ratio, large) => summarize({ ...clean, contrast: [{ el: "x", ratio, large }] }, []).length;
  assert.equal(at(4.49, false), 1);
  assert.equal(at(4.5, false), 0);
  assert.equal(at(2.99, true), 1);
  assert.equal(at(3, true), 0);
});

test("motion is only judged when reduced motion was asked for, and a short one-shot change is allowed", () => {
  const running = [{ target: "div", name: "spin", iterations: "Infinity", ms: 900 }];
  assert.equal(summarize({ ...clean, running }, [], { reduced: false }).length, 0);
  assert.equal(summarize({ ...clean, running }, [], { reduced: true }).length, 1);
  assert.equal(summarize({ ...clean, running: [{ target: "div", name: "fade", iterations: "1", ms: 80 }] }, [], { reduced: true }).length, 0);
});

test("a control that cannot be seen is not asked for a focus ring, and the page body is not either", () => {
  assert.equal(summarize(clean, [{ el: "button hidden", ring: false, visible: false }, { el: "body", ring: false }]).length, 0);
});

test("the page half is a self-contained expression that installs window.__uiAudit", () => {
  assert.match(AUDIT_SOURCE, /window\.__uiAudit\s*=/);
  // the source parses as an expression
  assert.doesNotThrow(() => new Function(`return ${AUDIT_SOURCE}`));
});

test("the helpers the page half uses are found inside the page: contrast works when the source is run on its own", () => {
  // run the installed source in a tiny fake page, with one element, and read a contrast back
  const el = { nodeType: 1, parentElement: null, tagName: "P", id: "", className: "", childNodes: [{ nodeType: 3, textContent: "hello" }], textContent: "hello", hasAttribute: () => false, getAttribute: () => null, closest: () => null,
    getBoundingClientRect: () => ({ width: 100, height: 20 }) };
  const styles = new Map([[el, { display: "block", visibility: "visible", opacity: "1", backgroundImage: "none", backgroundColor: "rgb(0, 0, 0)", color: "rgb(255, 255, 255)", fontSize: "16px", fontWeight: "400" }]]);
  const win = {};
  const doc = { documentElement: { scrollWidth: 100, clientWidth: 100 }, querySelectorAll: (sel) => (sel === "body *" ? [el] : []), getAnimations: () => [], activeElement: null, body: {} };
  new Function("window", "document", "getComputedStyle", AUDIT_SOURCE)(win, doc, (e) => styles.get(e));
  const out = win.__uiAudit.run();
  assert.equal(out.contrast.length, 1);
  assert.equal(Math.round(out.contrast[0].ratio), 21);
});
