import { afterEach, describe, expect, it } from "vitest";
import examples from "../../../shared/fixtures/worldlabs/docs-examples.json";
import { worldLabsFromEnv } from "./worldlabs-live";
import { HttpWorldLabs } from "./worldlabs-http";

const KEY = "wlt_test_KEY_0123456789";
const PHOTO = { image: Uint8Array.from([1, 2, 3]), contentType: "image/png", name: "w-1" };

/** Replaces the global `fetch`, which a Worker's adapter uses when it is given none, and records what it was asked. */
const realFetch = globalThis.fetch;
const seen: { url: string; key: string | null; body: string }[] = [];
const stub = () => {
  seen.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    seen.push({ url: String(input), key: new Headers(init.headers).get("WLT-Api-Key"), body: String(init.body) });
    return new Response(JSON.stringify(examples.generate), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
};
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("worldLabsFromEnv", () => {
  it("makes no adapter without a key: nothing set, an empty or blank key, or a key that is not a string", () => {
    for (const env of [undefined, {}, { WLT_API_KEY: "" }, { WLT_API_KEY: "   " }, { WLT_API_KEY: "\n" }, { WLT_API_KEY: 5 as never }, { WLT_API_KEY: null as never }, { WORLD_MODEL: "marble-1.1" }]) {
      expect(worldLabsFromEnv(env), JSON.stringify(env)).toBeNull();
    }
  });

  it("makes the adapter for the real host and the standard model when there is a key, and trims a secret saved with a line break", async () => {
    stub();
    const api = worldLabsFromEnv({ WLT_API_KEY: `  ${KEY}\n` });
    expect(api).toBeInstanceOf(HttpWorldLabs);
    await api!.generate(PHOTO);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe("https://api.worldlabs.ai/marble/v1/worlds:generate");
    expect(seen[0]!.key).toBe(KEY);
    expect(JSON.parse(seen[0]!.body).model).toBe("marble-1.1");
  });

  it("reads a blank model or base as not set", async () => {
    stub();
    await worldLabsFromEnv({ WLT_API_KEY: KEY, WORLD_MODEL: "  ", WORLD_API_BASE: " " })!.generate(PHOTO);
    expect(seen[0]!.url.startsWith("https://api.worldlabs.ai/")).toBe(true);
    expect(JSON.parse(seen[0]!.body).model).toBe("marble-1.1");
  });

  it("uses a model from the list, with its spaces trimmed", async () => {
    for (const model of ["marble-1.0-draft", "marble-1.0", "marble-1.1", "marble-1.1-plus"]) {
      stub();
      await worldLabsFromEnv({ WLT_API_KEY: KEY, WORLD_MODEL: ` ${model} ` })!.generate(PHOTO);
      expect(JSON.parse(seen[0]!.body).model).toBe(model);
    }
  });

  it("makes no adapter for a model that is not on the list, so a typo cannot quietly become the dearest model", () => {
    for (const model of ["marble-9", "MARBLE-1.1", "marble", "marble-1.1 plus", "draft", "constructor"]) {
      expect(worldLabsFromEnv({ WLT_API_KEY: KEY, WORLD_MODEL: model }), model).toBeNull();
    }
  });

  it("uses a loopback base for a local stand-in, and makes no adapter for any other base", async () => {
    stub();
    await worldLabsFromEnv({ WLT_API_KEY: KEY, WORLD_API_BASE: "http://127.0.0.1:8788" })!.generate(PHOTO);
    expect(seen[0]!.url).toBe("http://127.0.0.1:8788/marble/v1/worlds:generate");
    for (const base of ["https://evil.example", "http://api.worldlabs.ai", "https://api.worldlabs.ai.evil.example", "not a url", "http://10.0.0.1"]) {
      expect(worldLabsFromEnv({ WLT_API_KEY: KEY, WORLD_API_BASE: base }), base).toBeNull();
    }
    expect(worldLabsFromEnv({ WLT_API_KEY: KEY, WORLD_API_BASE: "https://api.worldlabs.ai" })).toBeInstanceOf(HttpWorldLabs);
  });

  it("makes no adapter for a key with a space or a control character inside", () => {
    for (const key of ["a b", "a\tb", "kéy", "a\nb"]) expect(worldLabsFromEnv({ WLT_API_KEY: key }), JSON.stringify(key)).toBeNull();
  });

  it("does not put the key in what it throws or returns", () => {
    const text = JSON.stringify([worldLabsFromEnv({ WLT_API_KEY: `${KEY} x` }), worldLabsFromEnv({ WLT_API_KEY: KEY, WORLD_MODEL: "nope" })]);
    expect(text).not.toContain(KEY);
  });
});
