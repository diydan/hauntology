// @vitest-environment jsdom
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../test/harness";

const log = vi.hoisted(() => vi.fn());
vi.mock("./logger", () => ({ logger: { log } }));

// The Gallery Screen throws, every other Screen is a plain one.
vi.mock("./screens", async () => {
  const { ScreenHeading } = await import("./RouteFocus");
  const plain = (name: string) => () => <main><ScreenHeading>{name}</ScreenHeading></main>;
  const Gallery = (): never => { throw new Error("gallery broke: the caption she typed"); };
  return {
    SCREENS: { home: plain("Home page"), gallery: Gallery, create: plain("Create page"), confirm: plain("Confirm page"), haunt: plain("Haunt page"), play: plain("Play page"), end: plain("End page"), not_found: plain("Not found page"), expired: plain("Expired page") },
    SCREEN_TITLES: { home: "Home", gallery: "Gallery", create: "Create", confirm: "Confirm", haunt: "Haunt", play: "Play", end: "End", not_found: "Nothing", expired: "Expired" },
  };
});

beforeEach(() => {
  log.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("a Screen that crashes", () => {
  it("shows the calm message with the code, logs the code and the Screen id, and leaves the rest of the app alive", async () => {
    renderApp("/gallery");
    await screen.findByRole("heading", { name: "Something broke on our side" });
    expect(screen.getByText("shell_crash")).toBeTruthy();
    expect(document.body.textContent).not.toContain("caption she typed");
    expect(log).toHaveBeenCalledWith("shell_crash", "gallery");
    expect(document.querySelector("[data-live-region]")).not.toBeNull();
  });

  it("is left behind by navigating away: the next Screen shows normally", async () => {
    const h = renderApp("/gallery");
    await screen.findByRole("heading", { name: "Something broke on our side" });
    act(() => h.router.navigate({ screen: "home" }));
    await screen.findByRole("heading", { name: "Home page" });
    expect(screen.queryByText("shell_crash")).toBeNull();
  });
});
