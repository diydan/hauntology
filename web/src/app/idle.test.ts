import { afterEach, describe, expect, it, vi } from "vitest";
import { IDLE_TIMEOUT_MS, whenIdle } from "./idle";

afterEach(() => vi.useRealTimers());

describe("whenIdle", () => {
  it("uses requestIdleCallback with a 1 s limit when the browser has it, and cancels with cancelIdleCallback", () => {
    const run = vi.fn();
    const ric = vi.fn((_cb: () => void, _o?: { timeout: number }) => 42);
    const cancel = vi.fn();
    const stop = whenIdle(run, { requestIdleCallback: ric, cancelIdleCallback: cancel });
    expect(ric).toHaveBeenCalledTimes(1);
    expect(ric.mock.calls[0]![1]).toEqual({ timeout: 1000 });
    expect(run).not.toHaveBeenCalled();
    ric.mock.calls[0]![0]();
    expect(run).toHaveBeenCalledTimes(1);
    stop();
    expect(cancel).toHaveBeenCalledWith(42);
  });

  it("falls back to a 1 s timer, and cancelling stops it", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    whenIdle(run, {});
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);

    const other = vi.fn();
    const stop = whenIdle(other, {});
    stop();
    vi.advanceTimersByTime(5000);
    expect(other).not.toHaveBeenCalled();
    expect(IDLE_TIMEOUT_MS).toBe(1000);
  });

  it("does not fail to cancel when there is no cancelIdleCallback", () => {
    const stop = whenIdle(() => {}, { requestIdleCallback: () => 1 });
    expect(() => stop()).not.toThrow();
  });
});
