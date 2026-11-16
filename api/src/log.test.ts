import { describe, expect, it, vi } from "vitest";
import { SILENT, createLogger } from "./log";

describe("createLogger", () => {
  it("writes one line of JSON per call, with the level, the time from its clock and the fields that fit", () => {
    const lines: string[] = [];
    const log = createLogger((l) => lines.push(l), () => 1_800_000_000_000);
    log.info("job.step", { worldId: "w-1", status: "ready" });
    log.warn("cleanup.done", { deleted: 4, worlds: 1 });
    log.error("request.error", { route: "/api/worlds/:id", errorName: "TypeError", status: 500 });
    expect(lines.map((l) => JSON.parse(l))).toEqual([
      { t: 1_800_000_000_000, level: "info", event: "job.step", worldId: "w-1", status: "ready" },
      { t: 1_800_000_000_000, level: "warn", event: "cleanup.done", deleted: 4, worlds: 1 },
      { t: 1_800_000_000_000, level: "error", event: "request.error", route: "/api/worlds/:id", errorName: "TypeError", status: 500 },
    ]);
  });

  it("never lets free text through, however it is passed, even past the types", () => {
    const lines: string[] = [];
    const log = createLogger((l) => lines.push(l));
    (log.info as (e: string, f: unknown) => void)("job.step", { worldId: "w-1", status: "a quiet kitchen with a blue door", code: "a caption" });
    (log.info as (e: string, f: unknown) => void)("a prompt as an event", { prompt: "turn this sketch into a photo of my house" });
    (log.error as (e: string, f: unknown) => void)("request.error", { route: "/api/sketch/render?caption=my%20house", errorName: "SyntaxError: Unexpected token 'm', \"my house\" is not valid JSON" });
    const all = lines.join("\n");
    for (const leaked of ["kitchen", "caption", "prompt", "sketch", "house", "Unexpected", "token"]) expect(all, leaked).not.toContain(leaked);
    expect(lines).toHaveLength(3);
  });

  it("does not fail the caller when the sink throws", () => {
    const log = createLogger(() => { throw new Error("sink down"); });
    expect(() => log.info("admin.kill", { on: true })).not.toThrow();
  });

  it("writes to the console by default, one string per call", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      createLogger().info("admin.kill", { on: true });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(typeof spy.mock.calls[0]![0]).toBe("string");
      expect(JSON.parse(spy.mock.calls[0]![0] as string)).toMatchObject({ level: "info", event: "admin.kill", on: true });
    } finally {
      spy.mockRestore();
    }
  });

  it("has a silent logger that writes nothing", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      SILENT.error("request.error", { status: 500 });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
