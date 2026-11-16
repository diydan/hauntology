import { ANCHORS } from "@hauntology/shared/app/fake-api";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, vi } from "vitest";
import type { PlatformKit } from "../app/platform";
import type { Recorder } from "../app/play/voice";
import type { HostModule } from "../app/case/types";
import type { CreatorModule } from "../app/haunt/creator";
import type { ViewerModule } from "../app/viewer/types";
import { renderApp, type Harness } from "./harness";
import type { FakeApiOptions } from "../app/FakeApi";
import type { ShellApi } from "@hauntology/shared/app/api";

/** A platform kit for tests: the real stand-in Viewer (so the whole message contract is used), a recorder and a speaker that are only recorded, and a file save that is only a spy. */
export function testPlatform(over: Partial<PlatformKit> = {}, options: { disposeMs?: number } = {}) {
  const log: string[] = [];
  const clip = new Blob([new Uint8Array(100)], { type: "audio/webm" });
  const recorder: Recorder = { start: () => { log.push("rec start"); }, stop: async () => { log.push("rec stop"); return clip; }, cancel: () => { log.push("rec cancel"); } };
  const played: Array<{ blob: Blob; paused: boolean; released: boolean }> = [];
  const loadViewer = vi.fn(async (): Promise<ViewerModule> => {
    log.push("load viewer");
    const real = await import("../app/viewer/standin");
    return {
      async mountViewer(setup) {
        log.push("mount");
        const handle = await real.mountViewer(setup);
        return {
          send: (m) => handle.send(m),
          async dispose() {
            log.push("dispose");
            if (options.disposeMs) await new Promise((r) => setTimeout(r, options.disposeMs));
            await handle.dispose();
            log.push("disposed");
          },
        };
      },
    };
  });
  // The real stand-in Host, logged, so a test can see that the Room is ended before the next Screen mounts.
  const loadHost = vi.fn(async (): Promise<HostModule> => {
    log.push("load host");
    const real = await import("../app/case/standin");
    return {
      async mountHost(setup) {
        log.push("host mount");
        const handle = await real.mountHost(setup);
        return {
          playAgain: () => handle.playAgain(),
          async dispose() {
            log.push("host dispose");
            await handle.dispose();
            log.push("host disposed");
          },
        };
      },
    };
  });
  // The real stand-in Creator, logged, so a test can see it unmounted.
  const loadCreator = vi.fn(async (): Promise<CreatorModule> => {
    log.push("load creator");
    const real = await import("../app/haunt/creator-standin");
    return {
      async mountCreator(setup) {
        log.push("creator mount");
        const handle = await real.mountCreator(setup);
        return {
          async dispose() {
            log.push("creator dispose");
            await handle.dispose();
          },
        };
      },
    };
  });
  const locate = vi.fn(async () => ({ lat: 51.50735, lon: -0.12776 }));
  const saveFile = vi.fn();
  const copyText = vi.fn(async (_text: string) => true);
  const kit: Partial<PlatformKit> = {
    loadViewer,
    loadHost,
    loadCreator,
    locate,
    voice: {
      recorder: async () => recorder,
      createAudio: (blob) => {
        const entry = { blob, paused: false, released: false };
        played.push(entry);
        return { audio: { onended: null, play: () => Promise.resolve(), pause: () => { entry.paused = true; } }, release: () => { entry.released = true; } };
      },
      unlockAudio: async () => { log.push("unlock"); },
    },
    saveFile,
    origin: () => "https://hauntology.test",
    copyText,
    ...over,
  };
  return { kit, log, loadViewer, loadHost, loadCreator, locate, saveFile, copyText, played, recorder };
}

export type Played = ReturnType<typeof testPlatform>;

/** Opens the Gallery, chooses the attic, says a ghost is ready, and goes to Play. */
export async function enterPlay(options: { api?: ShellApi; fake?: FakeApiOptions; platform?: Partial<PlatformKit> } = {}): Promise<Harness & { p: Played }> {
  const p = testPlatform();
  const h = renderApp("/gallery", { ...(options.api ? { api: options.api } : {}), ...(options.fake ? { fake: options.fake } : {}), platform: options.platform ?? p.kit });
  await screen.findByText("The attic room");
  fireEvent.click(screen.getByRole("button", { name: "Visit The attic room" }));
  await screen.findByRole("heading", { name: "Your place" });
  act(() => h.router.setFlow({ ghostReady: true }));
  act(() => h.router.navigate({ screen: "play", worldId: "attic-room" }));
  await screen.findByRole("heading", { name: "Wander" });
  return { ...h, p };
}

export const goIn = async () => {
  await screen.findByText("Before you go in");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Go in" })); });
  await screen.findByText("Stand-in view. The 3D Viewer is not built yet.");
};

/** Moves the stand-in to memory `n` (1 to 3), the way the real Viewer would report a walk. */
export const walkTo = async (n: number) => {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: new RegExp(`(Walk to|Back to) memory ${n}`) })); });
};

export const press = async (name: string) => {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name })); });
};

/** Walks to memory `n` and looks. A Chat left open by the last memory is closed first (the Viewer ignores movement while it is open). */
export const lookHere = async (n: number) => {
  if (screen.queryByRole("button", { name: "Close chat" })) await press("Close chat");
  await walkTo(n);
  await press("Talk");
  await press("Look");
  // The reply arrives, or the third memory has already taken the visitor to the Ending.
  await waitFor(() => expect(document.querySelector(".transcript [data-who=ghost]") !== null || screen.queryByRole("heading", { name: "You remembered" }) !== null).toBe(true));
};

export const live = () => document.querySelector("[data-live-region]")?.textContent ?? "";
export const foundText = () => document.querySelector("[data-found]")?.textContent ?? "";
export { ANCHORS };
