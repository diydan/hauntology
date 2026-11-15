// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenBoundary, ViewerBoundary } from "./ErrorBoundary";
import { LiveRegionProvider, useAnnounce } from "./LiveRegion";
import { OFFLINE_TEXT, OfflineBanner } from "./OfflineBanner";
import { useRetryGate } from "./useRetryGate";

const log = vi.hoisted(() => vi.fn());
vi.mock("./logger", () => ({ logger: { log } }));

beforeEach(() => {
  log.mockClear();
  // React prints a caught render error to the console; these tests throw on purpose.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const live = () => document.querySelector("[data-live-region]") as HTMLElement;

function Boom({ message = "boom: the caption she typed" }: { message?: string }): never {
  throw new Error(message);
}

describe("LiveRegion", () => {
  function Speaker({ lines }: { lines: string[] }) {
    const announce = useAnnounce();
    return <button onClick={() => lines.forEach(announce)}>say</button>;
  }

  it("is on the page, polite and empty, before anything is said", () => {
    render(<LiveRegionProvider><p>hello</p></LiveRegionProvider>);
    expect(live().getAttribute("role")).toBe("status");
    expect(live().getAttribute("aria-live")).toBe("polite");
    expect(live().getAttribute("aria-atomic")).toBe("true");
    expect(live().textContent).toBe("");
  });

  it("shows the latest line, and a repeated line is a new node so it is read again", () => {
    render(<LiveRegionProvider><Speaker lines={["Dreaming"]} /></LiveRegionProvider>);
    fireEvent.click(screen.getByText("say"));
    const first = live().firstElementChild;
    expect(live().textContent).toBe("Dreaming");
    fireEvent.click(screen.getByText("say"));
    expect(live().textContent).toBe("Dreaming");
    expect(live().firstElementChild).not.toBe(first);
  });

  it("keeps only the last of several lines said together", () => {
    render(<LiveRegionProvider><Speaker lines={["one", "two", "three"]} /></LiveRegionProvider>);
    fireEvent.click(screen.getByText("say"));
    expect(live().textContent).toBe("three");
  });

  it("does nothing, and does not fail, without a provider", () => {
    function Lone() {
      useAnnounce()("x");
      return <p>ok</p>;
    }
    expect(() => render(<Lone />)).not.toThrow();
  });
});

describe("ScreenBoundary", () => {
  it("shows fixed copy, the code and a link home, and never the error's own text", () => {
    render(<ScreenBoundary screenId="play"><Boom /></ScreenBoundary>);
    expect(screen.getByRole("heading", { name: "Something broke on our side" })).toBeTruthy();
    expect(screen.getByText("shell_crash")).toBeTruthy();
    const home = screen.getByRole("link", { name: "Go home" });
    expect(home.getAttribute("href")).toBe("/");
    expect(document.body.textContent).not.toContain("caption she typed");
  });

  it("logs the code and the Screen id and nothing else", () => {
    render(<ScreenBoundary screenId="haunt"><Boom message="https://secret.example/token=1" /></ScreenBoundary>);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("shell_crash", "haunt");
  });

  it("renders its children when nothing is wrong, and a new key gives a fresh start", () => {
    function Switch() {
      const [n, setN] = useState(0);
      return (
        <>
          <button onClick={() => setN(1)}>next</button>
          <ScreenBoundary key={n} screenId="gallery">{n === 0 ? <Boom /> : <p>fine</p>}</ScreenBoundary>
        </>
      );
    }
    render(<Switch />);
    expect(screen.queryByText("fine")).toBeNull();
    fireEvent.click(screen.getByText("next"));
    expect(screen.getByText("fine")).toBeTruthy();
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe("ViewerBoundary", () => {
  it("replaces a crashed Viewer with the thumbnail, and the Chat and Exit beside it keep working", () => {
    const exit = vi.fn();
    render(
      <div>
        <ViewerBoundary thumbUrl="/api/worlds/w-1/assets/thumb.jpg" alt="A kitchen at dusk"><Boom /></ViewerBoundary>
        <button onClick={exit}>Exit</button>
        <input aria-label="Chat" />
      </div>,
    );
    const img = screen.getByRole("img", { name: "A kitchen at dusk" });
    expect(img).toBeTruthy();
    expect(document.querySelector("img")?.getAttribute("src")).toBe("/api/worlds/w-1/assets/thumb.jpg");
    fireEvent.click(screen.getByText("Exit"));
    expect(exit).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Chat"), { target: { value: "hello" } });
    expect((screen.getByLabelText("Chat") as HTMLInputElement).value).toBe("hello");
    expect(log).toHaveBeenCalledWith("shell_crash", "play");
  });

  it("works without a thumbnail, and shows a working Viewer untouched", () => {
    const { unmount } = render(<ViewerBoundary alt="A place"><Boom /></ViewerBoundary>);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText(/The view stopped/)).toBeTruthy();
    unmount();
    render(<ViewerBoundary alt="A place"><canvas data-testid="canvas" /></ViewerBoundary>);
    expect(screen.getByTestId("canvas")).toBeTruthy();
  });
});

describe("OfflineBanner", () => {
  const setOnline = (value: boolean) => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  };
  afterEach(() => setOnline(true));

  it("is not there while online", () => {
    render(<LiveRegionProvider><OfflineBanner /></LiveRegionProvider>);
    expect(document.querySelector("[data-offline-banner]")).toBeNull();
    expect(live().textContent).toBe("");
  });

  it("says so when the network goes, announces it, and clears with an announcement when it returns", () => {
    render(<LiveRegionProvider><OfflineBanner /></LiveRegionProvider>);
    act(() => setOnline(false));
    expect(document.querySelector("[data-offline-banner]")?.textContent).toBe(OFFLINE_TEXT);
    expect(live().textContent).toBe(OFFLINE_TEXT);
    expect(OFFLINE_TEXT).toContain("kept");
    act(() => setOnline(true));
    expect(document.querySelector("[data-offline-banner]")).toBeNull();
    expect(live().textContent).toBe("You are back online.");
  });

  it("is there from the start when the page opens offline", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    render(<LiveRegionProvider><OfflineBanner /></LiveRegionProvider>);
    expect(document.querySelector("[data-offline-banner]")).not.toBeNull();
    expect(live().textContent).toBe(OFFLINE_TEXT);
  });
});

describe("useRetryGate", () => {
  function Gate({ sec }: { sec: number }) {
    const g = useRetryGate();
    const [armed, setArmed] = useState(false);
    useEffect(() => { if (armed) g.arm(sec); }, [armed]);
    return (
      <>
        <button onClick={() => setArmed(true)}>arm</button>
        <output>{g.enabled ? "on" : `off ${g.secondsLeft}`}</output>
      </>
    );
  }
  const out = () => document.querySelector("output")!.textContent;

  beforeEach(() => vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] }));

  it("is enabled until armed, then off for the advised seconds, then on by itself", async () => {
    render(<Gate sec={5} />);
    expect(out()).toBe("on");
    await act(async () => { fireEvent.click(screen.getByText("arm")); });
    expect(out()).toBe("off 5");
    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(out()).toBe("off 1");
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(out()).toBe("on");
  });

  it("holds at least 1 second and at most 120 seconds, whatever the server says", async () => {
    render(<Gate sec={0} />);
    await act(async () => { fireEvent.click(screen.getByText("arm")); });
    expect(out()).toBe("off 1");
    cleanup();
    render(<Gate sec={86_400} />);
    await act(async () => { fireEvent.click(screen.getByText("arm")); });
    expect(out()).toBe("off 120");
    await act(async () => { vi.advanceTimersByTime(119_000); });
    expect(out()).toBe("off 1");
  });
});
