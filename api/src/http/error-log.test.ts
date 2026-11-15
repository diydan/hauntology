import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { createLogger } from "../log";
import { MemoryWorldStore } from "../worlds/memory-store";
import { SECRET } from "../worlds/test-kit";

const SECRET_TEXT = "my grandmother's kitchen at 12 Elm Street, caption: haunted";

const run = async (thrown: unknown, path = "/api/worlds/w-aaaaaaaaaaaaaaaaaaaaaa") => {
  const lines: string[] = [];
  const store = new MemoryWorldStore();
  store.find = async () => { throw thrown; };
  const app = createApp({ worlds: { store }, log: createLogger((l) => lines.push(l), () => 1_800_000_000_000) });
  const res = await app.request(`http://app.test${path}`, {}, { HMAC_SECRET: SECRET });
  return { res, text: await res.text(), lines };
};

describe("an error nothing handled (world-pipeline 8.2)", () => {
  it("answers a plain 500, keeps the security headers, and writes one line: the route pattern, the kind of error and the status", async () => {
    const { res, text, lines } = await run(new TypeError(SECRET_TEXT));
    expect(res.status).toBe(500);
    expect(text).toBe("Internal Server Error");
    expect(res.headers.get("X-Content-Type-Options")).not.toBeNull();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] as string)).toEqual({ t: 1_800_000_000_000, level: "error", event: "request.error", route: "/api/worlds/:id", errorName: "TypeError", status: 500 });
  });

  it("never writes what the error said, in the line or in the answer", async () => {
    const { text, lines } = await run(new Error(SECRET_TEXT));
    for (const leaked of ["grandmother", "Elm", "kitchen", "haunted", "caption"]) {
      expect(lines.join("\n"), leaked).not.toContain(leaked);
      expect(text, leaked).not.toContain(leaked);
    }
  });

  it("does not write the address's ids, only the pattern", async () => {
    const { lines } = await run(new Error("x"), "/api/worlds/w-aaaaaaaaaaaaaaaaaaaaaa");
    expect(lines.join("")).not.toContain("w-aaaa");
  });

  it("drops an error name that is text, and a thrown value that is not an error", async () => {
    const named = new Error("x");
    named.name = `Bad input: ${SECRET_TEXT}`;
    const a = await run(named);
    expect(JSON.parse(a.lines[0] as string)).toMatchObject({ event: "request.error", status: 500, dropped: 1 });
    expect(a.lines.join("")).not.toContain("grandmother");
    const b = await run(SECRET_TEXT);
    expect(JSON.parse(b.lines[0] as string)).toMatchObject({ errorName: "NonError", status: 500 });
    expect(b.lines.join("")).not.toContain("grandmother");
    const c = await run({ message: SECRET_TEXT, toString: () => SECRET_TEXT });
    expect(c.lines.join("")).not.toContain("grandmother");
  });

  it("writes nothing to the console: Hono's own handler would print the whole error", async () => {
    const spies = (["log", "error", "warn", "info"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    try {
      await run(new Error(SECRET_TEXT));
      for (const s of spies) expect(s).not.toHaveBeenCalled();
      // With no logger given, the app is silent too.
      const store = new MemoryWorldStore();
      store.find = async () => { throw new Error(SECRET_TEXT); };
      const res = await createApp({ worlds: { store } }).request("http://app.test/api/worlds/w-aaaaaaaaaaaaaaaaaaaaaa", {}, { HMAC_SECRET: SECRET });
      expect(res.status).toBe(500);
      for (const s of spies) expect(s).not.toHaveBeenCalled();
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });

  it("does not turn a handled refusal into an error line: a 404 and a 400 write nothing", async () => {
    const lines: string[] = [];
    const app = createApp({ worlds: { store: new MemoryWorldStore() }, log: createLogger((l) => lines.push(l)) });
    expect((await app.request("http://app.test/api/worlds/w-nobody", {}, { HMAC_SECRET: SECRET })).status).toBe(404);
    expect((await app.request("http://app.test/api/nothing-here", {}, { HMAC_SECRET: SECRET })).status).toBe(404);
    expect(lines).toEqual([]);
  });
});
