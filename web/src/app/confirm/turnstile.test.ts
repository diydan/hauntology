// @vitest-environment jsdom
import { TURNSTILE_ORIGIN } from "@hauntology/shared/app/csp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TURNSTILE_LOAD_MS, TURNSTILE_SCRIPT_URL, loadTurnstileScript, resetTurnstileLoader, type TurnstileApi } from "./turnstile";
import { DEMO_TURNSTILE_TOKEN, standinTurnstile } from "./turnstile-standin";

type W = Window & { turnstile?: TurnstileApi };
const win = () => window as W;
const fakeApi = (): TurnstileApi => ({ render: vi.fn(() => "id"), remove: vi.fn(), reset: vi.fn() });
const scripts = () => [...document.head.querySelectorAll("script")];

beforeEach(() => {
  resetTurnstileLoader();
  delete win().turnstile;
  document.head.replaceChildren();
});
afterEach(() => {
  vi.useRealTimers();
  delete win().turnstile;
  document.head.replaceChildren();
});

describe("loadTurnstileScript", () => {
  it("loads the script from Cloudflare's own address and nowhere else, on this page only when asked", async () => {
    expect(scripts()).toHaveLength(0);
    const p = loadTurnstileScript();
    const [s] = scripts();
    expect(scripts()).toHaveLength(1);
    expect(s!.src).toBe(TURNSTILE_SCRIPT_URL);
    expect(TURNSTILE_SCRIPT_URL).toBe("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
    expect(new URL(TURNSTILE_SCRIPT_URL).origin).toBe(TURNSTILE_ORIGIN);
    // It is Cloudflare's own current file: no integrity pin, nonce or cross-origin mode that would break an update.
    for (const attr of ["integrity", "nonce", "crossorigin"]) expect(s!.hasAttribute(attr), attr).toBe(false);
    expect([s!.async, s!.defer]).toEqual([true, true]);
    const api = fakeApi();
    win().turnstile = api;
    s!.dispatchEvent(new Event("load"));
    await expect(p).resolves.toBe(api);
  });

  it("uses Turnstile when it is already on the page, and adds no script", async () => {
    const api = fakeApi();
    win().turnstile = api;
    await expect(loadTurnstileScript()).resolves.toBe(api);
    expect(scripts()).toHaveLength(0);
  });

  it("shares one load between callers, and does not load again once Turnstile is there", async () => {
    const a = loadTurnstileScript();
    const b = loadTurnstileScript();
    expect(scripts()).toHaveLength(1);
    expect(a).toBe(b);
    const api = fakeApi();
    win().turnstile = api;
    scripts()[0]!.dispatchEvent(new Event("load"));
    await a;
    await expect(loadTurnstileScript()).resolves.toBe(api);
    expect(scripts()).toHaveLength(1);
  });

  it("fails, takes its script away and loads afresh next time when the script cannot be fetched", async () => {
    const p = loadTurnstileScript();
    scripts()[0]!.dispatchEvent(new Event("error"));
    await expect(p).rejects.toThrow(/failed/);
    expect(scripts()).toHaveLength(0);
    const again = loadTurnstileScript();
    expect(scripts()).toHaveLength(1);
    win().turnstile = fakeApi();
    scripts()[0]!.dispatchEvent(new Event("load"));
    await expect(again).resolves.toBeDefined();
  });

  it("fails when the script loads but Turnstile is not there", async () => {
    const p = loadTurnstileScript();
    scripts()[0]!.dispatchEvent(new Event("load"));
    await expect(p).rejects.toThrow(/missing/);
    expect(scripts()).toHaveLength(0);
  });

  it("gives up after the time limit, and lets go of the script", async () => {
    vi.useFakeTimers();
    const p = loadTurnstileScript();
    const caught = p.catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(TURNSTILE_LOAD_MS - 1);
    expect(scripts()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(await caught).toMatch(/timed out/);
    expect(scripts()).toHaveLength(0);
    expect(TURNSTILE_LOAD_MS).toBe(15_000);
  });

  it("does not time out after it has loaded", async () => {
    vi.useFakeTimers();
    const p = loadTurnstileScript();
    win().turnstile = fakeApi();
    scripts()[0]!.dispatchEvent(new Event("load"));
    await p;
    await vi.advanceTimersByTimeAsync(TURNSTILE_LOAD_MS * 2);
    expect(scripts()).toHaveLength(1);
  });
});

describe("the demo stand-in", () => {
  it("draws two buttons, answers with a token or an error, and takes its buttons away", async () => {
    const api = await standinTurnstile();
    const box = document.createElement("div");
    document.body.append(box);
    const callback = vi.fn();
    const error = vi.fn();
    const id = api.render(box, { sitekey: "k", callback, "error-callback": error });
    const [pass, fail] = [...box.querySelectorAll("button")];
    expect([pass!.textContent, fail!.textContent]).toEqual(["Pass the check (demo)", "Fail the check (demo)"]);
    pass!.click();
    expect(callback).toHaveBeenCalledWith(DEMO_TURNSTILE_TOKEN);
    fail!.click();
    expect(error).toHaveBeenCalledTimes(1);
    api.remove(id);
    expect(box.querySelectorAll("button")).toHaveLength(0);
    api.reset(id);
    box.remove();
  });

  it("draws its buttons with the shared button element, not the retired `button` class (world-pipeline 13.4)", async () => {
    const api = await standinTurnstile();
    const box = document.createElement("div");
    document.body.append(box);
    api.render(box, { sitekey: "k", callback: vi.fn() });
    for (const b of box.querySelectorAll("button")) {
      expect(b.className).toBe("ui-button");
      expect(b.classList.contains("button")).toBe(false);
    }
    box.remove();
  });
});
