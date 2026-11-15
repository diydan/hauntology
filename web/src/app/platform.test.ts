// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetTurnstileLoader, type TurnstileApi } from "./confirm/turnstile";
import { browserLocate, defaultPlatform } from "./platform";

const original = Object.getOwnPropertyDescriptor(globalThis.navigator, "geolocation");
afterEach(() => {
  if (original) Object.defineProperty(globalThis.navigator, "geolocation", original);
  else delete (globalThis.navigator as { geolocation?: unknown }).geolocation;
});

const withGeolocation = (impl: unknown) => Object.defineProperty(globalThis.navigator, "geolocation", { configurable: true, value: impl });

describe("browserLocate", () => {
  it("asks for one position, at low accuracy and with a limit, and gives back the two numbers", async () => {
    const getCurrentPosition = vi.fn((ok: (p: unknown) => void, _fail?: unknown, _options?: PositionOptions) => ok({ coords: { latitude: 48.8566, longitude: 2.3522, accuracy: 20 } }));
    withGeolocation({ getCurrentPosition });
    await expect(browserLocate()).resolves.toEqual({ lat: 48.8566, lon: 2.3522 });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    const options = getCurrentPosition.mock.calls[0]![2]!;
    expect(options.enableHighAccuracy).toBe(false);
    expect(options.timeout).toBe(10_000);
  });

  it("rejects when the visitor refuses or the position fails", async () => {
    withGeolocation({ getCurrentPosition: (_ok: unknown, fail: (e: unknown) => void) => fail({ code: 1 }) });
    await expect(browserLocate()).rejects.toBeDefined();
  });

  it("rejects when the browser has no geolocation", async () => {
    withGeolocation(undefined);
    await expect(browserLocate()).rejects.toThrow();
  });

  it("asks for nothing until it is called", () => {
    const getCurrentPosition = vi.fn();
    withGeolocation({ getCurrentPosition });
    defaultPlatform();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});

describe("defaultPlatform", () => {
  it("has the browser's own clock and timers, and loads the Creator and the Host only when asked", () => {
    const kit = defaultPlatform();
    expect(kit.now()).toBeInstanceOf(Date);
    expect(typeof kit.scheduler.set).toBe("function");
    expect(typeof kit.loadCreator).toBe("function");
    expect(typeof kit.loadHost).toBe("function");
    expect(typeof kit.locate).toBe("function");
  });
});

describe("defaultPlatform.loadTurnstile", () => {
  it("is the real loader: it gives the Turnstile that is on the page, and adds no script of its own to find it", async () => {
    resetTurnstileLoader();
    const api: TurnstileApi = { render: () => "id", remove: () => {}, reset: () => {} };
    (window as unknown as { turnstile?: TurnstileApi }).turnstile = api;
    try {
      await expect(defaultPlatform().loadTurnstile()).resolves.toBe(api);
      expect(document.head.querySelectorAll("script")).toHaveLength(0);
    } finally {
      delete (window as unknown as { turnstile?: TurnstileApi }).turnstile;
    }
  });
});
