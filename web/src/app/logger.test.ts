import { ErrorCode } from "@hauntology/shared/errors";
import { SCREEN_IDS, type ScreenId } from "@hauntology/shared/app/types";
import { describe, expect, it, vi } from "vitest";
import { createLogger, logger } from "./logger";

describe("logger", () => {
  it("writes the code and the screen id and nothing else", () => {
    const lines: string[] = [];
    const log = createLogger((l) => lines.push(l));
    expect(log.log("shell_crash", "play")).toBe(true);
    expect(lines).toEqual(["[hauntology] shell_crash play"]);
  });

  it("writes one line for every code and screen", () => {
    const lines: string[] = [];
    const log = createLogger((l) => lines.push(l));
    for (const code of Object.values(ErrorCode)) for (const screen of SCREEN_IDS) expect(log.log(code, screen)).toBe(true);
    expect(lines).toHaveLength(Object.values(ErrorCode).length * SCREEN_IDS.length);
    for (const l of lines) expect(l).toMatch(/^\[hauntology\] [a-z_]+ [a-z_]+$/);
  });

  it("drops anything that is not a known code and screen, even text, objects and extra arguments", () => {
    const lines: string[] = [];
    const log = createLogger((l) => lines.push(l)) as unknown as { log: (...a: unknown[]) => boolean };
    const hostile: unknown[][] = [
      ["a photo of my house at 12 Elm St", "play"],
      ["shell_crash", "/play/world-123"],
      ["shell_crash\nsecret", "play"],
      ["shell_crash play", "play"],
      [new Error("boom: token=abc"), "play"],
      [{ code: "shell_crash" }, "play"],
      ["toString", "play"], ["__proto__", "play"], ["shell_crash", "__proto__"],
      [undefined, undefined], [null, "play"], [7, 8],
    ];
    for (const args of hostile) expect(log.log(...args), JSON.stringify(args)).toBe(false);
    expect(lines).toEqual([]);
  });

  it("ignores extra arguments after the two it knows", () => {
    const lines: string[] = [];
    const log = createLogger((l) => lines.push(l)) as unknown as { log: (...a: unknown[]) => boolean };
    expect(log.log("timeout", "haunt", "the caption she typed", { chat: "hello" })).toBe(true);
    expect(lines).toEqual(["[hauntology] timeout haunt"]);
  });

  it("the shared logger writes to console.error and to no other console method", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const others = (["log", "info", "warn", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    try {
      expect(logger.log("session_expired", "home" as ScreenId)).toBe(true);
      expect(error).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith("[hauntology] session_expired home");
      for (const spy of others) expect(spy).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
