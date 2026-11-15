import { describe, expect, it } from "vitest";
import { standinTurnstile } from "./confirm/turnstile-standin";
import { demoOptions, loadDemoApi, loadDemoPlatform, wantsDemo } from "./demo";

describe("the demo switches", () => {
  it("asks for the demo only with demo=1", () => {
    expect(wantsDemo("?demo=1")).toBe(true);
    expect(wantsDemo("?demo=1&fast=1")).toBe(true);
    for (const s of ["", "?demo=0", "?demo=true", "?demo", "?fast=1"]) expect(wantsDemo(s), s).toBe(false);
  });

  it("reads the recording switches only as 1", () => {
    expect(demoOptions("?demo=1&turnstile=1")).toMatchObject({ needsTurnstile: true });
    expect(demoOptions("?demo=1&turnstile=0")).toEqual({});
    expect(demoOptions("?demo=1&zero=1").flags).toEqual({ worldGenEnabled: false });
    expect(demoOptions("?demo=1&fail=1")).toMatchObject({ worldOutcome: "failed" });
  });

  it("gives the fake API and the demo Turnstile for ?demo=1 on a development build, and nothing otherwise", async () => {
    expect(await loadDemoApi("")).toBeNull();
    expect(await loadDemoApi("?demo=1")).not.toBeNull();
    expect(await loadDemoPlatform("")).toBeNull();
    expect(await loadDemoPlatform("?demo=0")).toBeNull();
    const kit = await loadDemoPlatform("?demo=1");
    expect(kit).toEqual({ loadTurnstile: standinTurnstile });
  });
});
