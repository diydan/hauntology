import { describe, expect, it } from "vitest";
import { wantsDebug } from "./DebugOverlay";

describe("wantsDebug", () => {
  it("is on only for debug=1", () => {
    expect(wantsDebug("?debug=1")).toBe(true);
    expect(wantsDebug("?x=2&debug=1&y=3")).toBe(true);
    for (const s of ["", "?debug=0", "?debug=true", "?debug=", "?debug", "?Debug=1", "?debug=1x", "?xdebug=1", "?demo=1"]) expect(wantsDebug(s), s).toBe(false);
  });
});
