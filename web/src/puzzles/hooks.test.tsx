// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWakeLock, type WakeLockHost, type WakeLockSentinelLike } from "./hooks";

afterEach(() => { cleanup(); });

function Probe({ active, host }: { active: boolean; host: WakeLockHost }) {
  useWakeLock(active, host);
  return null;
}

function fakeHost(over: { reject?: boolean; hidden?: boolean; noLock?: boolean } = {}) {
  const sentinels: Array<WakeLockSentinelLike & { released: number }> = [];
  const listeners = new Set<() => void>();
  const state = { hidden: over.hidden ?? false, requests: 0, reject: over.reject ?? false };
  const host: WakeLockHost = {
    request: over.noLock ? undefined : () => {
      state.requests++;
      if (state.reject) return Promise.reject(new Error("refused"));
      const s = { released: 0, release: () => { s.released++; return Promise.resolve(); } };
      sentinels.push(s);
      return Promise.resolve(s);
    },
    isHidden: () => state.hidden,
    onVisibility: (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
  const flush = async (): Promise<void> => { await act(async () => { await Promise.resolve(); }); };
  return { host, sentinels, listeners, state, flush, setHidden: (h: boolean) => { state.hidden = h; for (const l of [...listeners]) l(); } };
}

describe("useWakeLock", () => {
  it("asks for the screen to stay awake while active, and lets go when it stops being active", async () => {
    const f = fakeHost();
    const { rerender } = render(<Probe active host={f.host} />);
    await f.flush();
    expect(f.state.requests).toBe(1);
    expect(f.sentinels[0]?.released).toBe(0);
    rerender(<Probe active={false} host={f.host} />);
    expect(f.sentinels[0]?.released).toBe(1);
    expect(f.listeners.size).toBe(0);
  });

  it("asks for nothing while it is not active", async () => {
    const f = fakeHost();
    render(<Probe active={false} host={f.host} />);
    await f.flush();
    expect(f.state.requests).toBe(0);
    expect(f.listeners.size).toBe(0);
  });

  it("lets go when it unmounts, once", async () => {
    const f = fakeHost();
    const { unmount } = render(<Probe active host={f.host} />);
    await f.flush();
    unmount();
    expect(f.sentinels[0]?.released).toBe(1);
    expect(f.listeners.size).toBe(0);
  });

  it("asks again when the page comes back, because the browser drops the lock when the page is hidden", async () => {
    const f = fakeHost();
    render(<Probe active host={f.host} />);
    await f.flush();
    f.setHidden(true);
    await f.flush();
    expect(f.state.requests).toBe(1); // nothing is asked for while hidden
    f.setHidden(false);
    await f.flush();
    expect(f.state.requests).toBe(2);
    f.setHidden(false); // already held: no third request
    await f.flush();
    expect(f.state.requests).toBe(2);
  });

  it("does not ask while the page starts hidden, and asks once it shows", async () => {
    const f = fakeHost({ hidden: true });
    render(<Probe active host={f.host} />);
    await f.flush();
    expect(f.state.requests).toBe(0);
    f.setHidden(false);
    await f.flush();
    expect(f.state.requests).toBe(1);
  });

  it("goes on quietly when the browser refuses (low battery) or has no wake lock", async () => {
    const refused = fakeHost({ reject: true });
    const a = render(<Probe active host={refused.host} />);
    await refused.flush();
    expect(refused.state.requests).toBe(1);
    expect(() => a.unmount()).not.toThrow();
    const none = fakeHost({ noLock: true });
    const b = render(<Probe active host={none.host} />);
    await none.flush();
    expect(none.listeners.size).toBe(0);
    b.unmount();
  });

  it("lets go at once when it unmounts before the browser has answered", async () => {
    const f = fakeHost();
    const slow = vi.fn(() => new Promise<WakeLockSentinelLike>((resolve) => { setTimeout(() => resolve({ release: () => Promise.resolve() }), 10); }));
    let released = 0;
    const host: WakeLockHost = { ...f.host, request: () => slow().then((s) => ({ release: () => { released++; return s.release(); } })) };
    const { unmount } = render(<Probe active host={host} />);
    unmount();
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(released).toBe(1);
  });
});
