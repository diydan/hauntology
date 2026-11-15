import { describe, expect, it } from "vitest";

/**
 * Requirement 3.2: no Screen but the Confirm Gate may call `POST /api/worlds`. In this shell that call
 * is `ShellApi.createWorld`, and only `confirm/controller.ts` (the Gate's controller) may make it. The
 * real client defines it and the demo API implements it; tests may call it to set a scene up.
 */
const modules = import.meta.glob(["../../**/*.ts", "../../**/*.tsx", "!../../**/*.test.ts", "!../../**/*.test.tsx", "!../../test/**"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
// Vite names each file relative to this one (src/app/confirm), so put the names back relative to src.
const sources = Object.entries(modules).map(([key, text]) => ({ path: new URL(key, "file:///src/app/confirm/").pathname.replace("/src/", ""), text }));
const ALLOWED = ["app/ApiClient.ts", "app/FakeApi.ts", "app/confirm/controller.ts"];

describe("only the Confirm Gate starts a world", () => {
  it("calls createWorld from the Gate's controller and from nothing else", () => {
    expect(sources.length).toBeGreaterThan(20);
    const callers = sources.filter((s) => /\bcreateWorld\b/.test(s.text)).map((s) => s.path);
    expect(callers.sort()).toEqual(ALLOWED);
  });

  it("calls the route only through that method: no other file names the path", () => {
    const named = sources.filter((s) => /["'`]\/api\/worlds["'`]/.test(s.text)).map((s) => s.path);
    expect(named).toEqual(["app/ApiClient.ts"]);
  });

  it("calls it in the controller only after an accepted `create` effect", () => {
    const text = sources.find((s) => s.path === "app/confirm/controller.ts")!.text;
    const calls = [...text.matchAll(/\.createWorld\(/g)];
    expect(calls).toHaveLength(1);
    expect(text.slice(0, calls[0]!.index)).toMatch(/case "create": \{\s*$/m);
  });
});
