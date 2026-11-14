import { describe, expect, it } from "vitest";
import { confirmReduce, confirmStart } from "./confirm";
import type { ConfirmEvent, ConfirmState, QuotaSnapshot } from "./types";

const IMG = "img-12345678";
const QUOTA: QuotaSnapshot = { world: 2, image: 4, llm: 10, tts: 10, stt: 10, live: 5 };
const quoteOk = (token: string, needsTurnstile = false): ConfirmEvent => ({
  t: "quote_ok", imageUrl: "/api/uploads/img-12345678.png", token, quota: QUOTA, needsTurnstile,
});
const ready = (token = "tok-1", needsTurnstile = false): ConfirmState =>
  ({ k: "ready", imageUrl: "/api/uploads/img-12345678.png", token, quota: QUOTA, needsTurnstile });

describe("confirmStart", () => {
  it("begins in quoting and asks for one quote", () => {
    expect(confirmStart(IMG)).toEqual({ state: { k: "quoting" }, effects: [{ e: "quote", imageId: IMG }] });
  });
});

describe("confirmReduce", () => {
  it("quoting + quote_ok gives ready with the exact quote and no effect", () => {
    const r = confirmReduce({ k: "quoting" }, quoteOk("tok-1"), IMG);
    expect(r).toEqual({ state: ready("tok-1"), effects: [] });
  });

  it("quoting + quote_fail gives rejected with the code", () => {
    expect(confirmReduce({ k: "quoting" }, { t: "quote_fail", code: "quota_day" }, IMG)).toEqual({
      state: { k: "rejected", code: "quota_day" }, effects: [],
    });
  });

  it("enter without Turnstile creates once with the token", () => {
    expect(confirmReduce(ready("tok-9"), { t: "enter" }, IMG)).toEqual({
      state: { k: "creating", token: "tok-9" },
      effects: [{ e: "create", imageId: IMG, token: "tok-9" }],
    });
  });

  it("enter with Turnstile moves to challenge and creates nothing; the token is used after turnstile_ok", () => {
    const step1 = confirmReduce(ready("tok-9", true), { t: "enter" }, IMG);
    expect(step1).toEqual({ state: { k: "challenge", token: "tok-9" }, effects: [] });
    const step2 = confirmReduce(step1.state, { t: "turnstile_ok", turnstile: "cf-result" }, IMG);
    expect(step2).toEqual({
      state: { k: "creating", token: "tok-9" },
      effects: [{ e: "create", imageId: IMG, token: "tok-9", turnstile: "cf-result" }],
    });
  });

  it("create_ok navigates to haunt for the new world", () => {
    expect(confirmReduce({ k: "creating", token: "t" }, { t: "create_ok", worldId: "w-1" }, IMG)).toEqual({
      state: { k: "created", worldId: "w-1" },
      effects: [{ e: "navigate", to: { screen: "haunt", worldId: "w-1" } }],
    });
  });

  it("create_fail gives rejected, and retry makes one new quote", () => {
    const failed = confirmReduce({ k: "creating", token: "t" }, { t: "create_fail", code: "confirm_expired" }, IMG);
    expect(failed).toEqual({ state: { k: "rejected", code: "confirm_expired" }, effects: [] });
    expect(confirmReduce(failed.state, { t: "retry" }, IMG)).toEqual({
      state: { k: "quoting" }, effects: [{ e: "quote", imageId: IMG }],
    });
  });

  it("a retried quote replaces the old token", () => {
    let s: ConfirmState = { k: "rejected", code: "confirm_expired" };
    s = confirmReduce(s, { t: "retry" }, IMG).state;
    s = confirmReduce(s, quoteOk("tok-new"), IMG).state;
    const r = confirmReduce(s, { t: "enter" }, IMG);
    expect(r.effects).toEqual([{ e: "create", imageId: IMG, token: "tok-new" }]);
  });

  it("back leaves for Create without any create effect, from quoting, ready, challenge and rejected", () => {
    const states: ConfirmState[] = [
      { k: "quoting" }, ready(), { k: "challenge", token: "t" }, { k: "rejected", code: "timeout" },
    ];
    for (const s of states) {
      expect(confirmReduce(s, { t: "back" }, IMG)).toEqual({
        state: { k: "cancelled" }, effects: [{ e: "navigate", to: { screen: "create" } }],
      });
    }
  });

  it("ignores back while creating, after created and after cancelled", () => {
    const states: ConfirmState[] = [{ k: "creating", token: "t" }, { k: "created", worldId: "w" }, { k: "cancelled" }];
    for (const s of states) {
      const r = confirmReduce(s, { t: "back" }, IMG);
      expect(r.state).toBe(s);
      expect(r.effects).toEqual([]);
    }
  });

  it("a late quote or create answer after back changes nothing", () => {
    const cancelled: ConfirmState = { k: "cancelled" };
    for (const e of [quoteOk("late"), { t: "create_ok", worldId: "w" }, { t: "enter" }, { t: "retry" }] as ConfirmEvent[]) {
      const r = confirmReduce(cancelled, e, IMG);
      expect(r.state).toBe(cancelled);
      expect(r.effects).toEqual([]);
    }
  });

  it("enter is ignored in every state except ready", () => {
    const states: ConfirmState[] = [
      { k: "quoting" }, { k: "challenge", token: "t" }, { k: "creating", token: "t" },
      { k: "created", worldId: "w" }, { k: "rejected", code: "timeout" }, { k: "cancelled" },
    ];
    for (const s of states) {
      const r = confirmReduce(s, { t: "enter" }, IMG);
      expect(r.state).toBe(s);
      expect(r.effects).toEqual([]);
    }
  });

  it("retry is accepted only from rejected", () => {
    const states: ConfirmState[] = [
      { k: "quoting" }, ready(), { k: "challenge", token: "t" }, { k: "creating", token: "t" },
      { k: "created", worldId: "w" }, { k: "cancelled" },
    ];
    for (const s of states) {
      const r = confirmReduce(s, { t: "retry" }, IMG);
      expect(r.state).toBe(s);
      expect(r.effects).toEqual([]);
    }
  });

  it("turnstile_ok outside challenge is ignored", () => {
    for (const s of [{ k: "quoting" }, ready("t", true), { k: "creating", token: "t" }] as ConfirmState[]) {
      const r = confirmReduce(s, { t: "turnstile_ok", turnstile: "x" }, IMG);
      expect(r.state).toBe(s);
      expect(r.effects).toEqual([]);
    }
  });

  it("a second enter after the first never creates again", () => {
    const first = confirmReduce(ready("t"), { t: "enter" }, IMG);
    const second = confirmReduce(first.state, { t: "enter" }, IMG);
    expect(first.effects).toHaveLength(1);
    expect(second.effects).toEqual([]);
    expect(second.state).toBe(first.state);
  });
});
