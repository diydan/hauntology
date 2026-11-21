// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { useRearCamera, type CameraDeps, type RearCamera } from "./camera";

const track = () => { const t = { stopped: false, stop() { t.stopped = true; } }; return t; };
const fakeStream = (t = track()) => ({ stream: { getTracks: () => [t] } as unknown as MediaStream, t });

let cam: RearCamera;
function Probe({ media }: { media: CameraDeps["media"] }): ReactNode {
  cam = useRearCamera(media === undefined ? {} : { media });
  return <video ref={cam.videoRef} data-testid="v" />;
}
afterEach(cleanup);
beforeEach(() => { HTMLMediaElement.prototype.play = () => Promise.resolve(); });

describe("useRearCamera", () => {
  it("is off until the Player taps, then asks for the rear camera with no audio, and stops its tracks on stop", async () => {
    const { stream, t } = fakeStream();
    const calls: unknown[] = [];
    render(<Probe media={{ getUserMedia: async (c: MediaStreamConstraints | undefined) => { calls.push(c); return stream; } }} />);
    expect(cam.status).toBe("off");
    expect(calls).toHaveLength(0);
    await act(async () => { await cam.start(); });
    expect(calls).toEqual([{ video: { facingMode: "environment" }, audio: false }]);
    expect(cam.status).toBe("on");
    expect(cam.message).toContain("Nothing is recorded");
    act(() => cam.stop());
    expect(t.stopped).toBe(true);
    expect(cam.status).toBe("off");
  });

  it("says one line and keeps the stand-in when the permission is refused or there is no camera", async () => {
    render(<Probe media={{ getUserMedia: async () => { throw new DOMException("no", "NotAllowedError"); } }} />);
    await act(async () => { await cam.start(); });
    expect(cam.status).toBe("refused");
    expect(cam.message).toMatch(/not allowed/);
    cleanup();
    render(<Probe media={null} />);
    await act(async () => { await cam.start(); });
    expect(cam.status).toBe("unavailable");
    cleanup();
    render(<Probe media={{ getUserMedia: async () => { throw new DOMException("x", "NotFoundError"); } }} />);
    await act(async () => { await cam.start(); });
    expect(cam.status).toBe("unavailable");
  });

  it("stops when the page is hidden and when the Table closes", async () => {
    const a = fakeStream();
    const { unmount } = render(<Probe media={{ getUserMedia: async () => a.stream }} />);
    await act(async () => { await cam.start(); });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(a.t.stopped).toBe(true);
    expect(cam.status).toBe("off");
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    const b = fakeStream();
    cleanup();
    const r2 = render(<Probe media={{ getUserMedia: async () => b.stream }} />);
    await act(async () => { await cam.start(); });
    r2.unmount();
    expect(b.t.stopped).toBe(true);
    void unmount;
  });

  it("does not turn the camera on when it was stopped while the permission prompt was open", async () => {
    const late = fakeStream();
    let release!: () => void;
    render(<Probe media={{ getUserMedia: () => new Promise((res) => { release = () => res(late.stream); }) }} />);
    let started!: Promise<void>;
    act(() => { started = cam.start(); });
    expect(cam.status).toBe("starting");
    act(() => cam.stop());
    await act(async () => { release(); await started; });
    expect(late.t.stopped).toBe(true);
    expect(cam.status).toBe("off");
  });
});
