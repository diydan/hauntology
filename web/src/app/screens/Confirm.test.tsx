// @vitest-environment jsdom
import type { ApiResult, QuoteResult, ShellApi } from "@hauntology/shared/app/api";
import { CONFIRM_IMAGE_ALT, CONFIRM_NOTHING_YET, TURNSTILE_ASK, TURNSTILE_DID_NOT_WORK, TURNSTILE_LOADING, TURNSTILE_LOAD_FAILED, TURNSTILE_NOT_SET_UP, TURNSTILE_RAN_OUT, noPlacesLine } from "@hauntology/shared/app/confirm-copy";
import { errorCopy } from "@hauntology/shared/app/errors-copy";
import { TURNSTILE_DEMO_SITE_KEY } from "@hauntology/shared/app/fake-api";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { TurnstileApi, TurnstileOptions } from "../confirm/turnstile";
import { standinTurnstile } from "../confirm/turnstile-standin";
import { createFakeApi, type FakeApi, type FakeApiOptions } from "../FakeApi";
import type { PlatformKit } from "../platform";
import { renderApp } from "../../test/harness";
import { live, press, testPlatform } from "../../test/play";

afterEach(() => cleanup());

type Gate = {
  h: ReturnType<typeof renderApp>;
  fake: FakeApi;
  imageId: string;
  p: ReturnType<typeof testPlatform>;
  quote: MockInstance<FakeApi["quote"]>;
  create: MockInstance<FakeApi["createWorld"]>;
};

/** Opens the Confirm Gate for a photo the visitor "picked": uploaded through the fake API, then handed over in memory. */
async function openGate(options: { fake?: FakeApiOptions; api?: (base: FakeApi) => ShellApi; over?: Partial<PlatformKit>; wait?: boolean } = {}): Promise<Gate> {
  const fake = createFakeApi({ latencyMs: 0, ...options.fake });
  const up = await fake.uploadPhoto(new Blob([new Uint8Array(100)], { type: "image/jpeg" }));
  if (!up.ok) throw new Error(up.code);
  const quote = vi.spyOn(fake, "quote");
  const create = vi.spyOn(fake, "createWorld");
  const p = testPlatform();
  const api = options.api ? options.api(fake) : fake;
  const h = renderApp("/create", { api, platform: { ...p.kit, ...options.over } });
  await screen.findByRole("heading", { name: "Make a place" });
  act(() => {
    h.router.setFlow({ pickedImageId: up.value.imageId });
    h.router.navigate({ screen: "confirm" });
  });
  if (options.wait !== false) await screen.findByRole("button", { name: "Enter this place" });
  return { h, fake, imageId: up.value.imageId, p, quote, create };
}

const enter = () => act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enter this place" })); });
const pageText = () => new XMLSerializer().serializeToString(document.body);
const isOff = (el: HTMLElement) => el.getAttribute("aria-disabled") === "true";

describe("Confirm: opening it", () => {
  it("sends a visit with no picked image to Create (a URL typed in)", async () => {
    const h = renderApp("/confirm");
    await screen.findByRole("heading", { name: "Make a place" });
    expect(h.history.stack.at(-1)).toBe("/create");
    expect(screen.queryByRole("heading", { name: "Enter this place?" })).toBeNull();
  });

  it("asks for the quote once on arrival, shows the exact picture at a readable size with its alt text, the places left and the question", async () => {
    const g = await openGate();
    expect(g.quote).toHaveBeenCalledTimes(1);
    expect(g.quote).toHaveBeenCalledWith(g.imageId);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Enter this place?");
    const img = screen.getByAltText(CONFIRM_IMAGE_ALT) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(`/demo/uploads/${g.imageId}.svg`);
    expect(document.querySelector("[data-places-left]")?.textContent).toBe("Places left this visit: 2");
    expect(screen.getByText(CONFIRM_NOTHING_YET)).toBeTruthy();
    expect(g.h.history.stack.at(-1)).toBe("/confirm");
    expect(document.title).toBe("Confirm · Hauntology");
  });

  it("shows that it is looking while the quote is on its way, and does not offer Enter yet", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const g = await openGate({
      wait: false,
      api: (base) => ({ ...base, quote: async (id) => { await gate; return base.quote(id); } }),
    });
    await screen.findByText("Looking at your picture…");
    expect(screen.queryByRole("button", { name: "Enter this place" })).toBeNull();
    await act(async () => { release(); });
    await screen.findByRole("button", { name: "Enter this place" });
    void g;
  });

  it("creates nothing on its own: no world is asked for until Enter this place is pressed", async () => {
    const g = await openGate();
    await act(async () => {});
    expect(g.create).not.toHaveBeenCalled();
    expect(g.h.history.stack.at(-1)).toBe("/confirm");
  });
});

describe("Confirm: Enter this place", () => {
  it("creates once with the Confirm Token from the quote, keeps the button off while it runs, and goes to Haunt for the new place", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const g = await openGate({ api: (base) => ({ ...base, createWorld: (req) => gate.then(() => base.createWorld(req)) }) });
    const token = ((await g.quote.mock.results[0]!.value) as ApiResult<QuoteResult> & { value: QuoteResult }).value.confirmToken;
    await enter();
    const busy = screen.getByRole("button", { name: "Making your place…" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Enter this place" })).toBeNull();
    expect(live()).toBe("Making your place…");
    await act(async () => { release(); });
    await screen.findByRole("heading", { name: "Your place" });
    expect(g.create).toHaveBeenCalledTimes(1);
    expect(g.create.mock.calls[0]![0]).toEqual({ imageId: g.imageId, confirmToken: token });
    const flow = g.h.router.getSnapshot().flow;
    expect(g.h.history.stack.at(-1)).toBe(`/haunt/${flow.worldId}`);
    expect(flow).toMatchObject({ ghostReady: false, playEnded: false });
    // The picked image stays, so a failed place can try again from the Gate.
    expect(flow.pickedImageId).toBe(g.imageId);
  });

  it("shows the new count of places once the place is made", async () => {
    const g = await openGate();
    expect(g.h.quota.getSnapshot()).toMatchObject({ status: "ready", quota: { world: 2 } });
    await enter();
    await screen.findByRole("heading", { name: "Your place" });
    await waitFor(() => expect(g.h.quota.getSnapshot()).toMatchObject({ quota: { world: 1 } }));
  });

  it("does not keep the Confirm Token anywhere the visitor, a URL, storage or a log could see it", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const g = await openGate();
    const token = ((await g.quote.mock.results[0]!.value) as { value: QuoteResult }).value.confirmToken;
    expect(token.length).toBeGreaterThan(3);
    expect(pageText()).not.toContain(token);
    expect(g.h.history.stack.join(" ")).not.toContain(token);
    await enter();
    await screen.findByRole("heading", { name: "Your place" });
    expect(pageText()).not.toContain(token);
    expect(g.h.history.stack.join(" ")).not.toContain(token);
    expect(localStorage.length + sessionStorage.length).toBe(0);
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain(token);
    for (const s of spies) s.mockRestore();
    setItem.mockRestore();
  });

  it("turns Enter off, with a line and the Gallery, when the quote says no place is left, and does nothing when it is pressed", async () => {
    const g = await openGate({ fake: { quota: { world: 0 } } });
    const button = screen.getByRole("button", { name: "Enter this place" });
    expect(isOff(button)).toBe(true);
    expect(button.getAttribute("aria-describedby")).toBe("confirm-reason");
    const reason = document.getElementById("confirm-reason") as HTMLElement;
    expect(reason.textContent).toContain(noPlacesLine({ world: 0 })!);
    expect(within(reason).getByRole("link", { name: "Visit a gallery place" }).getAttribute("href")).toBe("/gallery");
    expect(document.querySelector("[data-places-left]")?.textContent).toBe("Places left this visit: 0");
    fireEvent.click(button);
    await act(async () => {});
    expect(g.create).not.toHaveBeenCalled();
  });
});

describe("Confirm: Back and Pick another", () => {
  it("goes to Create on Back and to the Gallery on Pick another, and neither makes anything or uses a place", async () => {
    const g = await openGate();
    await press("Back");
    await screen.findByRole("heading", { name: "Make a place" });
    expect(g.h.history.stack.at(-1)).toBe("/create");
    expect(g.create).not.toHaveBeenCalled();
    cleanup();

    const g2 = await openGate();
    await press("Pick another place");
    await screen.findByRole("heading", { name: "Visit a place" });
    expect(g2.h.history.stack.at(-1)).toBe("/gallery");
    expect(g2.create).not.toHaveBeenCalled();
    const left = await g2.fake.quota();
    expect(left).toMatchObject({ ok: true, value: { world: 2 } });
  });

  it("keeps both off while the place is being made, and ignores them", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const g = await openGate({ api: (base) => ({ ...base, createWorld: (req) => gate.then(() => base.createWorld(req)) }) });
    await enter();
    for (const name of ["Back", "Pick another place"]) expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled, name).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(g.h.history.stack.at(-1)).toBe("/confirm");
    await act(async () => { release(); });
    await screen.findByRole("heading", { name: "Your place" });
  });

  it("works from a rejection too", async () => {
    const g = await openGate();
    g.fake.backend.failNext("createWorld", "quota_session");
    await enter();
    await screen.findByRole("heading", { name: errorCopy("quota_session").title });
    await press("Back");
    await screen.findByRole("heading", { name: "Make a place" });
  });
});

describe("Confirm: when the place is refused", () => {
  it.each(["quota_session", "quota_day", "quota_total", "world_gen_disabled", "unsafe_image", "turnstile_failed", "confirm_expired"] as const)(
    "says why, in words that belong to %s, offers the Gallery, releases the buttons, and says it aloud",
    async (code) => {
      const g = await openGate();
      g.fake.backend.failNext("createWorld", code);
      await enter();
      const copy = errorCopy(code);
      await screen.findByRole("heading", { name: copy.title });
      const box = document.querySelector(".confirm-error") as HTMLElement;
      expect(within(box).getByText(copy.body), code).toBeTruthy();
      expect(within(box).getByRole("link", { name: "Visit a gallery place" }).getAttribute("href"), code).toBe("/gallery");
      expect(live(), code).toBe(`${copy.title}. ${copy.body}`);
      for (const name of ["Back", "Pick another place"]) expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled, `${code} ${name}`).toBe(false);
      expect(g.h.history.stack.at(-1), code).toBe("/confirm");
      expect(screen.queryByRole("button", { name: "Enter this place" }), code).toBeNull();
      expect(screen.queryByRole("button", { name: "Making your place…" }), code).toBeNull();
    },
  );

  it("offers Try again only where trying again can help, and Try again makes a new quote and a new token", async () => {
    const g = await openGate();
    g.fake.backend.failNext("createWorld", "quota_day");
    await enter();
    await screen.findByRole("heading", { name: errorCopy("quota_day").title });
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
    cleanup();

    const t = await openGate();
    const first = ((await t.quote.mock.results[0]!.value) as { value: QuoteResult }).value.confirmToken;
    t.fake.backend.failNext("createWorld", "confirm_expired");
    await enter();
    await screen.findByRole("heading", { name: errorCopy("confirm_expired").title });
    await press("Try again");
    await screen.findByRole("button", { name: "Enter this place" });
    expect(t.quote).toHaveBeenCalledTimes(2);
    const second = ((await t.quote.mock.results[1]!.value) as { value: QuoteResult }).value.confirmToken;
    expect(second).not.toBe(first);
    await enter();
    await screen.findByRole("heading", { name: "Your place" });
    expect(t.create.mock.calls.map((c) => (c[0] as { confirmToken: string }).confirmToken)).toEqual([first, second]);
  });

  it("holds Try again for the advised wait after a 429, and says so", async () => {
    const g = await openGate({
      api: (base) => ({ ...base, createWorld: async (): Promise<ApiResult<never>> => ({ ok: false, code: "rate_limited", retryAfterSec: 30 }) }),
    });
    await enter();
    await screen.findByRole("heading", { name: errorCopy("rate_limited").title });
    const again = screen.getByRole("button", { name: /Try again in \d+/ }) as HTMLButtonElement;
    expect(again.disabled).toBe(true);
    expect(g.quote).toHaveBeenCalledTimes(1);
  });
});

describe("Confirm: when the quote fails", () => {
  it("shows the typed reason and the Gallery, and lets the visitor try again", async () => {
    const g = await openGate({ wait: false });
    // The first quote was already made; make the next one fail.
    await screen.findByRole("button", { name: "Enter this place" });
    cleanup();
    const fake = createFakeApi({ latencyMs: 0 });
    const up = await fake.uploadPhoto(new Blob([new Uint8Array(100)], { type: "image/jpeg" }));
    if (!up.ok) throw new Error(up.code);
    fake.backend.failNext("quote", "network_error");
    const h = renderApp("/create", { api: fake, platform: testPlatform().kit });
    await screen.findByRole("heading", { name: "Make a place" });
    act(() => {
      h.router.setFlow({ pickedImageId: up.value.imageId });
      h.router.navigate({ screen: "confirm" });
    });
    const copy = errorCopy("network_error");
    await screen.findByRole("heading", { name: copy.title });
    expect(screen.getByRole("link", { name: "Visit a gallery place" })).toBeTruthy();
    expect(screen.queryByAltText(CONFIRM_IMAGE_ALT)).toBeNull();
    await press("Try again");
    await screen.findByRole("button", { name: "Enter this place" });
    void g;
  });

  it("holds Try again for the advised wait when the quote is rate limited", async () => {
    await openGate({
      wait: false,
      api: (base) => ({ ...base, quote: async (): Promise<ApiResult<never>> => ({ ok: false, code: "rate_limited", retryAfterSec: 25 }) }),
    });
    await screen.findByRole("heading", { name: errorCopy("rate_limited").title });
    expect((screen.getByRole("button", { name: /Try again in \d+/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

/** A Turnstile whose widget the test can answer by hand. */
function controllableTurnstile() {
  const widgets: Array<{ id: string; options: TurnstileOptions; container: HTMLElement }> = [];
  const api: TurnstileApi = {
    render: vi.fn((container: HTMLElement, options: TurnstileOptions) => {
      const id = `w${widgets.length + 1}`;
      widgets.push({ id, options, container });
      container.dataset.widget = id;
      return id;
    }),
    remove: vi.fn(),
    reset: vi.fn(),
  };
  const load = vi.fn(async () => api);
  return { api, load, widgets };
}

describe("Confirm: the bot check", () => {
  const needs = { needsTurnstile: true };

  it("loads Turnstile only when the quote asks for it, and not for a visit that needs none", async () => {
    const t = controllableTurnstile();
    const g = await openGate({ over: { loadTurnstile: t.load } });
    await enter();
    await screen.findByRole("heading", { name: "Your place" });
    expect(t.load).not.toHaveBeenCalled();
    void g;
  });

  it("shows the check inside the Gate after Enter, with a loading line, creates nothing until it has a result, then creates with that result", async () => {
    const t = controllableTurnstile();
    let ready!: () => void;
    const hold = new Promise<void>((r) => (ready = r));
    t.load.mockImplementation(async () => { await hold; return t.api; });
    const g = await openGate({ fake: needs, over: { loadTurnstile: t.load } });
    const token = ((await g.quote.mock.results[0]!.value) as { value: QuoteResult }).value.confirmToken;
    expect(t.load).not.toHaveBeenCalled();
    await enter();
    await screen.findByRole("heading", { name: "One quick check" });
    expect(live()).toBe(TURNSTILE_ASK);
    expect(screen.getByText(TURNSTILE_LOADING)).toBeTruthy();
    expect(t.load).toHaveBeenCalledTimes(1);
    expect(g.create).not.toHaveBeenCalled();
    // The picture and the count stay while the check is done.
    expect(screen.getByAltText(CONFIRM_IMAGE_ALT)).toBeTruthy();
    expect(document.querySelector("[data-places-left]")).not.toBeNull();
    await act(async () => { ready(); });
    await waitFor(() => expect(t.widgets).toHaveLength(1));
    const w = t.widgets[0]!;
    expect(w.options.sitekey).toBe(TURNSTILE_DEMO_SITE_KEY);
    expect(w.container.closest(".confirm-check")).not.toBeNull();
    expect(screen.queryByText(TURNSTILE_LOADING)).toBeNull();
    expect(g.create).not.toHaveBeenCalled();
    await act(async () => { w.options.callback("cf-result"); });
    await screen.findByRole("heading", { name: "Your place" });
    expect(g.create).toHaveBeenCalledTimes(1);
    expect(g.create.mock.calls[0]![0]).toEqual({ imageId: g.imageId, confirmToken: token, turnstile: "cf-result" });
    expect(t.api.remove).toHaveBeenCalledWith("w1");
    // The result is not left on the page or in the address.
    expect(g.h.history.stack.join(" ")).not.toContain("cf-result");
  });

  it("walks through the demo stand-in: a button passes the check and the place is made", async () => {
    const g = await openGate({ fake: needs, over: { loadTurnstile: standinTurnstile } });
    await enter();
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Pass the check (demo)" })); });
    await screen.findByRole("heading", { name: "Your place" });
    expect((g.create.mock.calls[0]![0] as { turnstile: string }).turnstile).toBe("demo-turnstile-token");
  });

  it("says when the check did not work or ran out, and asks again without leaving the Gate", async () => {
    const t = controllableTurnstile();
    const g = await openGate({ fake: needs, over: { loadTurnstile: t.load } });
    await enter();
    await waitFor(() => expect(t.widgets).toHaveLength(1));
    const w = t.widgets[0]!;
    await act(async () => { w.options["error-callback"]!(); });
    expect(document.querySelector(".turnstile .ui-note")?.textContent).toBe(TURNSTILE_DID_NOT_WORK);
    expect(live()).toBe(TURNSTILE_DID_NOT_WORK);
    await act(async () => { w.options["expired-callback"]!(); });
    expect(document.querySelector(".turnstile .ui-note")?.textContent).toBe(TURNSTILE_RAN_OUT);
    expect(t.api.reset).toHaveBeenCalledWith("w1");
    expect(g.create).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "One quick check" })).toBeTruthy();
  });

  it("says the check could not load, with Try again and the way back, and is not an error screen", async () => {
    const t = controllableTurnstile();
    t.load.mockImplementationOnce(async () => { throw new Error("blocked"); });
    const g = await openGate({ fake: needs, over: { loadTurnstile: t.load } });
    await enter();
    await screen.findByText(TURNSTILE_LOAD_FAILED, { exact: false });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    await press("Try again");
    await waitFor(() => expect(t.widgets).toHaveLength(1));
    expect(t.load).toHaveBeenCalledTimes(2);
    expect(g.create).not.toHaveBeenCalled();
  });

  it("says the check is not set up, and does not load anything, when the quote gives no site key", async () => {
    const t = controllableTurnstile();
    await openGate({
      fake: needs, over: { loadTurnstile: t.load },
      api: (base) => ({ ...base, quote: async (id) => { const r = await base.quote(id); if (!r.ok) return r; const { turnstileSiteKey: _k, ...rest } = r.value; return { ok: true, value: rest }; } }),
    });
    await enter();
    await screen.findByText(TURNSTILE_NOT_SET_UP, { exact: false });
    expect(t.load).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    await press("Pick another place");
    await screen.findByRole("heading", { name: "Visit a place" });
  });

  it("goes back from the check without creating anything and lets the widget go", async () => {
    const t = controllableTurnstile();
    const g = await openGate({ fake: needs, over: { loadTurnstile: t.load } });
    await enter();
    await waitFor(() => expect(t.widgets).toHaveLength(1));
    await press("Back");
    await screen.findByRole("heading", { name: "Make a place" });
    expect(g.create).not.toHaveBeenCalled();
    expect(t.api.remove).toHaveBeenCalledWith("w1");
  });

  it("draws no widget for a check whose script arrives after the visitor has left", async () => {
    const t = controllableTurnstile();
    let ready!: () => void;
    const hold = new Promise<void>((r) => (ready = r));
    t.load.mockImplementation(async () => { await hold; return t.api; });
    const g = await openGate({ fake: needs, over: { loadTurnstile: t.load } });
    await enter();
    await screen.findByText(TURNSTILE_LOADING);
    await press("Back");
    await screen.findByRole("heading", { name: "Make a place" });
    await act(async () => { ready(); });
    expect(t.api.render).not.toHaveBeenCalled();
    expect(t.widgets).toHaveLength(0);
    expect(g.create).not.toHaveBeenCalled();
  });

  it("takes a failed check from the server as a rejection, and Try again asks for the check afresh", async () => {
    const t = controllableTurnstile();
    const g = await openGate({ fake: needs, over: { loadTurnstile: t.load } });
    await enter();
    await waitFor(() => expect(t.widgets).toHaveLength(1));
    g.fake.backend.failNext("createWorld", "turnstile_failed");
    await act(async () => { t.widgets[0]!.options.callback("bad-result"); });
    await screen.findByRole("heading", { name: errorCopy("turnstile_failed").title });
    await press("Try again");
    await screen.findByRole("button", { name: "Enter this place" });
    await enter();
    await waitFor(() => expect(t.widgets).toHaveLength(2));
    await act(async () => { t.widgets[1]!.options.callback("good-result"); });
    await screen.findByRole("heading", { name: "Your place" });
    expect(g.quote).toHaveBeenCalledTimes(2);
  });
});

describe("Confirm: the page", () => {
  it("moves focus to its heading when it is reached from another Screen", async () => {
    const g = await openGate();
    await waitFor(() => expect(document.activeElement?.tagName).toBe("H1"));
    expect(document.activeElement?.textContent).toBe("Enter this place?");
    void g;
  });

  it("says each change of the Gate once: ready, and the refusal", async () => {
    const g = await openGate();
    expect(live()).toBe("Your picture is ready to look at.");
    g.fake.backend.failNext("createWorld", "quota_day");
    await enter();
    await screen.findByRole("heading", { name: errorCopy("quota_day").title });
    expect(live()).toBe(`${errorCopy("quota_day").title}. ${errorCopy("quota_day").body}`);
  });
});
