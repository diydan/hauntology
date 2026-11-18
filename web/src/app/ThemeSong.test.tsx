// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeSong } from "./ThemeSong";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ThemeSong", () => {
  it("plays the intro theme on tap only, stops on second tap, and shows lyrics", async () => {
    const made: string[] = [];
    const pause = vi.fn();
    const play = vi.fn(() => Promise.resolve());
    vi.stubGlobal(
      "Audio",
      class {
        onended = null;
        onerror = null;
        pause = pause;
        play = play;
        constructor(src: string) {
          made.push(src);
        }
      },
    );

    render(<ThemeSong kind="intro" />);
    expect(made).toEqual([]);
    expect(document.querySelector(".ui-lyrics")?.textContent).toContain("Welcome to Hauntology");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Play intro theme" }));
    });
    expect(made).toEqual(["/songs/theme-intro.mp3"]);
    expect(screen.getByRole("button", { name: "Stop intro theme" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Stop intro theme" }));
    expect(pause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Play intro theme" })).toBeTruthy();
  });

  it("plays the outro theme on tap and handles playback failure gracefully", async () => {
    const made: string[] = [];
    vi.stubGlobal(
      "Audio",
      class {
        onended = null;
        onerror = null;
        pause() {}
        play() {
          return Promise.reject(new Error("blocked"));
        }
        constructor(src: string) {
          made.push(src);
        }
      },
    );

    render(<ThemeSong kind="outro" heading="h3" />);
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Outro · Half a Step Behind");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Play outro theme" }));
    });
    expect(made).toEqual(["/songs/theme-outro.mp3"]);
    expect(screen.getByRole("status").textContent).toContain("would not play");
  });

  it("lets players switch between Rock, Female Rock, and Horror Classical arrangements", async () => {
    const made: string[] = [];
    const pause = vi.fn();
    const play = vi.fn(() => Promise.resolve());
    vi.stubGlobal(
      "Audio",
      class {
        onended = null;
        onerror = null;
        pause = pause;
        play = play;
        constructor(src: string) {
          made.push(src);
        }
      },
    );

    render(<ThemeSong kind="intro" />);
    fireEvent.click(screen.getByRole("button", { name: "Horror Classical" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Play intro theme" }));
    });
    expect(made).toEqual(["/songs/theme-classical.mp3"]);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Female Rock" }));
    });
    expect(pause).toHaveBeenCalledTimes(1);
    expect(made).toEqual(["/songs/theme-classical.mp3", "/songs/theme-female-rock.mp3"]);
  });
});
