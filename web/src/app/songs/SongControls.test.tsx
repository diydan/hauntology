// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SongControls } from "./SongControls";
import { createRoomSongsController } from "./room-songs";

afterEach(cleanup);

describe("SongControls & RoomSongsController (game-songs 3.3, 4.1)", () => {
  it("defaults Songs setting to off, restricts Master controls, logs Clue hint, and stops audio on skip/mute/off", () => {
    const paused: string[] = [];
    const logged: string[] = [];
    const ctrl = createRoomSongsController({
      playSong: (key) => ({ pause: () => { paused.push(key); } }),
      onPublicLog: (line) => logged.push(line),
    });

    expect(ctrl.getSnapshot().setting).toBe("off");
    expect(ctrl.setSetting(false, "on")).toBe(false);
    expect(ctrl.setSetting(true, "on")).toBe(true);

    // Clue song logs its hint line even when phone sound consent is false.
    ctrl.startSong(
      { key: "clue-1", title: "A Quiet Drift", captions: "Dust lies still.", hintLogLine: "A song drifted through the house: nothing lies in Attic." },
      { soundConsent: false },
    );
    expect(logged).toEqual(["A song drifted through the house: nothing lies in Attic."]);
    expect(ctrl.getSnapshot().captions).toBe("Dust lies still.");

    // Playing with consent starts audio; skipping pauses it cleanly.
    ctrl.startSong({ key: "open-1", title: "Lanterns", captions: "The table waits." }, { soundConsent: true });
    expect(ctrl.skip(false)).toBe(false);
    expect(ctrl.skip(true)).toBe(true);
    expect(paused).toEqual(["open-1"]);
    expect(ctrl.getSnapshot().playing).toBeNull();

    // Non-Master cannot mute; Master mute pauses audio cleanly.
    ctrl.startSong({ key: "open-2", title: "Lanterns 2", captions: "Second verse." }, { soundConsent: true });
    expect(ctrl.setMuted(false, true)).toBe(false);
    expect(ctrl.setMuted(true, true)).toBe(true);
    expect(paused).toEqual(["open-1", "open-2"]);
  });

  it("renders design-system segments, Mute/Skip buttons, Sing my name toggle, and polite live-region captions", () => {
    const onSetting = vi.fn();
    const onMute = vi.fn();
    const onSkip = vi.fn();
    const onSingMyName = vi.fn();

    render(
      <SongControls
        ui={{
          setting: "stock",
          muted: false,
          singMyName: false,
          playing: { key: "fb-wrong", title: "A Regrettable Guess", captions: "A name was said with all good will." },
          captions: "A name was said with all good will.",
        }}
        isMaster={true}
        onSetting={onSetting}
        onMute={onMute}
        onSkip={onSkip}
        onSingMyName={onSingMyName}
      />,
    );

    expect(document.querySelectorAll("[style]")).toHaveLength(0);
    expect(screen.getByRole("radio", { name: "Stock only" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "On" }));
    expect(onSetting).toHaveBeenCalledWith("on");

    fireEvent.click(screen.getByRole("button", { name: "Mute songs" }));
    expect(onMute).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Skip song" }));
    expect(onSkip).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Sing my name"));
    expect(onSingMyName).toHaveBeenCalledWith(true);

    const cap = document.querySelector("[data-song-captions]")!;
    expect(cap.getAttribute("aria-live")).toBe("polite");
    expect(cap.textContent).toContain("A Regrettable Guess: A name was said with all good will.");
  });
});
