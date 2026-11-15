import type { ApiResult, QuoteResult } from "@hauntology/shared/app/api";
import type { FlowState, QuotaSnapshot, Route } from "@hauntology/shared/app/types";
import { ErrorCode } from "@hauntology/shared/errors";
import { describe, expect, it, vi } from "vitest";
import { createConfirmController } from "./controller";

const quota: QuotaSnapshot = { world: 2, image: 8, llm: 40, tts: 40, stt: 20, live: 30 };
const after: QuotaSnapshot = { ...quota, world: 1 };
const quoteOf = (n: number, extra: Partial<QuoteResult> = {}): ApiResult<QuoteResult> => ({ ok: true, value: { imageUrl: `/demo/uploads/img.svg?n=${n}`, quota, confirmToken: `token-${n}`, needsTurnstile: false, ...extra } });
const bad = (code: ErrorCode, retryAfterSec?: number): ApiResult<never> => ({ ok: false, code, ...(retryAfterSec === undefined ? {} : { retryAfterSec }) });

function make(over: { quotes?: Array<ApiResult<QuoteResult>>; creates?: Array<ApiResult<{ worldId: string; status: "queued" }>>; refresh?: ApiResult<QuotaSnapshot> } = {}) {
  const quotes = [...(over.quotes ?? [quoteOf(1)])];
  const creates = [...(over.creates ?? [{ ok: true as const, value: { worldId: "w-1", status: "queued" as const } }])];
  const log: string[] = [];
  const api = {
    quote: vi.fn(async (_id: string) => quotes.shift() ?? quoteOf(99)),
    createWorld: vi.fn(async (_req: { imageId: string; confirmToken: string; turnstile?: string }) => creates.shift() ?? bad(ErrorCode.bad_confirm)),
    quota: vi.fn(async () => over.refresh ?? ({ ok: true, value: after } as ApiResult<QuotaSnapshot>)),
  };
  const quotasSet: QuotaSnapshot[] = [];
  const flows: Array<Partial<FlowState>> = [];
  const routes: Route[] = [];
  const c = createConfirmController({
    api, imageId: "img1",
    setQuota: (q) => { log.push("quota"); quotasSet.push(q); },
    setFlow: (p) => { log.push("flow"); flows.push(p); },
    navigate: (r) => { log.push(`navigate ${r.screen}`); routes.push(r); },
  });
  return { c, api, log, quotasSet, flows, routes };
}

const begun = async (t: ReturnType<typeof make>) => {
  t.c.begin();
  await t.c.settled();
};

describe("ConfirmController: the quote", () => {
  it("asks once for the picked image, shows what the quote says, and shares the quota it returns", async () => {
    const t = make();
    expect(t.c.getSnapshot().state).toEqual({ k: "quoting" });
    t.c.begin();
    t.c.begin();
    await t.c.settled();
    expect(t.api.quote).toHaveBeenCalledTimes(1);
    expect(t.api.quote).toHaveBeenCalledWith("img1");
    expect(t.c.getSnapshot().state).toEqual({ k: "ready", imageUrl: "/demo/uploads/img.svg?n=1", token: "token-1", quota, needsTurnstile: false });
    expect(t.c.getSnapshot().quote).toEqual({ imageUrl: "/demo/uploads/img.svg?n=1", quota });
    expect(t.quotasSet).toEqual([quota]);
    expect(t.api.createWorld).not.toHaveBeenCalled();
  });

  it("is rejected, with the code and the wait, when the quote fails", async () => {
    const t = make({ quotes: [bad(ErrorCode.rate_limited, 30)] });
    await begun(t);
    expect(t.c.getSnapshot()).toMatchObject({ state: { k: "rejected", code: "rate_limited" }, retryAfterSec: 30 });
    expect(t.api.createWorld).not.toHaveBeenCalled();
    expect(t.quotasSet).toEqual([]);
  });

  it("keeps the picture and the places of the quote while the check and the wait go on, and drops them when it begins again", async () => {
    const t = make({ quotes: [quoteOf(1, { needsTurnstile: true, turnstileSiteKey: "k" })] });
    await begun(t);
    t.c.enter();
    await t.c.settled();
    expect(t.c.getSnapshot().state).toMatchObject({ k: "challenge" });
    expect(t.c.getSnapshot().quote).toEqual({ imageUrl: "/demo/uploads/img.svg?n=1", quota });
    t.c.destroy();
    t.c.begin();
    expect(t.c.getSnapshot().quote).toBeUndefined();
  });

  it("keeps the site key of the quote, for the widget", async () => {
    const t = make({ quotes: [quoteOf(1, { needsTurnstile: true, turnstileSiteKey: "site-key-1" })] });
    await begun(t);
    expect(t.c.getSnapshot().siteKey).toBe("site-key-1");
  });
});

describe("ConfirmController: Enter this place", () => {
  it("creates once with the Confirm Token and no Turnstile result, then goes to Haunt for the new place", async () => {
    const t = make();
    await begun(t);
    t.c.enter();
    t.c.enter();
    await t.c.settled();
    expect(t.api.createWorld).toHaveBeenCalledTimes(1);
    expect(t.api.createWorld).toHaveBeenCalledWith({ imageId: "img1", confirmToken: "token-1" });
    // No Turnstile result is not a result of `undefined`: the key is not sent at all.
    expect("turnstile" in t.api.createWorld.mock.calls[0]![0]).toBe(false);
    expect(t.c.getSnapshot().state).toEqual({ k: "created", worldId: "w-1" });
    // The flow learns the place before the guard looks at Haunt.
    expect(t.flows).toEqual([{ worldId: "w-1", ghostReady: false, playEnded: false }]);
    expect(t.routes).toEqual([{ screen: "haunt", worldId: "w-1" }]);
    expect(t.log.indexOf("flow")).toBeGreaterThan(-1);
    expect(t.log.indexOf("flow")).toBeLessThan(t.log.indexOf("navigate haunt"));
  });

  it("asks for the quota again after the place is made, and shares it, and shrugs if that fails", async () => {
    const t = make();
    await begun(t);
    t.c.enter();
    await t.c.settled();
    await vi.waitFor(() => expect(t.quotasSet).toEqual([quota, after]));
    expect(t.api.quota).toHaveBeenCalledTimes(1);

    const f = make({ refresh: bad(ErrorCode.network_error) });
    await begun(f);
    f.c.enter();
    await f.c.settled();
    await Promise.resolve();
    expect(f.quotasSet).toEqual([quota]);
    expect(f.c.getSnapshot().state).toMatchObject({ k: "created" });
  });

  it("is rejected, with the code, when the place is refused, and does not go anywhere", async () => {
    for (const code of [ErrorCode.quota_session, ErrorCode.quota_day, ErrorCode.quota_total, ErrorCode.world_gen_disabled, ErrorCode.unsafe_image, ErrorCode.turnstile_failed, ErrorCode.confirm_expired]) {
      const t = make({ creates: [bad(code)] });
      await begun(t);
      t.c.enter();
      await t.c.settled();
      expect(t.c.getSnapshot().state, code).toEqual({ k: "rejected", code });
      expect(t.routes, code).toEqual([]);
      expect(t.flows, code).toEqual([]);
      expect(t.api.quota).not.toHaveBeenCalled();
    }
  });

  it("does nothing before the quote has come, and nothing after the place is made", async () => {
    const t = make();
    t.c.begin();
    t.c.enter();
    await t.c.settled();
    expect(t.api.createWorld).not.toHaveBeenCalled();
    t.c.enter();
    await t.c.settled();
    t.c.enter();
    t.c.back();
    t.c.pickAnother();
    await t.c.settled();
    expect(t.api.createWorld).toHaveBeenCalledTimes(1);
    expect(t.routes).toEqual([{ screen: "haunt", worldId: "w-1" }]);
  });
});

describe("ConfirmController: leaving while a place is on its way", () => {
  it("does not go to Haunt for a place whose answer comes after the Screen has gone", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = make();
    t.api.createWorld.mockImplementation(async () => { await gate; return { ok: true as const, value: { worldId: "w-1", status: "queued" as const } }; });
    await begun(t);
    t.c.enter();
    await vi.waitFor(() => expect(t.api.createWorld).toHaveBeenCalledTimes(1));
    t.c.destroy();
    release();
    await t.c.settled();
    await Promise.resolve();
    expect(t.routes).toEqual([]);
    expect(t.flows).toEqual([]);
    expect(t.api.quota).not.toHaveBeenCalled();
  });

  it("does not ask for a place at all when the Screen goes before the request has started", async () => {
    const t = make();
    await begun(t);
    t.c.enter();
    t.c.destroy();
    await t.c.settled();
    await new Promise((r) => setTimeout(r, 0));
    expect(t.api.createWorld).not.toHaveBeenCalled();
    expect(t.routes).toEqual([]);
  });
});

describe("ConfirmController: the bot check", () => {
  it("waits for Turnstile, then creates once with its result and the same token", async () => {
    const t = make({ quotes: [quoteOf(1, { needsTurnstile: true, turnstileSiteKey: "k" })] });
    await begun(t);
    t.c.enter();
    await t.c.settled();
    expect(t.c.getSnapshot().state).toEqual({ k: "challenge", token: "token-1" });
    expect(t.api.createWorld).not.toHaveBeenCalled();
    t.c.turnstileOk("cf-result");
    t.c.turnstileOk("cf-again");
    await t.c.settled();
    expect(t.api.createWorld).toHaveBeenCalledTimes(1);
    expect(t.api.createWorld).toHaveBeenCalledWith({ imageId: "img1", confirmToken: "token-1", turnstile: "cf-result" });
    expect(t.c.getSnapshot().state).toMatchObject({ k: "created" });
  });

  it("ignores a Turnstile result when none was asked for", async () => {
    const t = make();
    await begun(t);
    t.c.turnstileOk("early");
    await t.c.settled();
    expect(t.api.createWorld).not.toHaveBeenCalled();
    expect(t.c.getSnapshot().state).toMatchObject({ k: "ready" });
  });

  it("can go back from the check without creating anything", async () => {
    const t = make({ quotes: [quoteOf(1, { needsTurnstile: true, turnstileSiteKey: "k" })] });
    await begun(t);
    t.c.enter();
    t.c.back();
    t.c.turnstileOk("late");
    await t.c.settled();
    expect(t.api.createWorld).not.toHaveBeenCalled();
    expect(t.routes).toEqual([{ screen: "create" }]);
  });
});

describe("ConfirmController: retry", () => {
  it("makes a new quote with a new token after a rejection, and never sends the old token again", async () => {
    const t = make({ quotes: [quoteOf(1), quoteOf(2)], creates: [bad(ErrorCode.confirm_expired), { ok: true, value: { worldId: "w-2", status: "queued" } }] });
    await begun(t);
    t.c.enter();
    await t.c.settled();
    expect(t.c.getSnapshot().state).toEqual({ k: "rejected", code: "confirm_expired" });
    t.c.retry();
    t.c.retry();
    await t.c.settled();
    expect(t.api.quote).toHaveBeenCalledTimes(2);
    expect(t.c.getSnapshot().state).toMatchObject({ k: "ready", token: "token-2" });
    t.c.enter();
    await t.c.settled();
    expect(t.api.createWorld.mock.calls.map((c) => c[0].confirmToken)).toEqual(["token-1", "token-2"]);
    expect(t.routes).toEqual([{ screen: "haunt", worldId: "w-2" }]);
  });

  it("only retries from a rejection, and drops the old wait when it does", async () => {
    const t = make({ quotes: [bad(ErrorCode.rate_limited, 30), quoteOf(2)] });
    t.c.retry();
    await t.c.settled();
    expect(t.api.quote).not.toHaveBeenCalled();
    await begun(t);
    expect(t.c.getSnapshot().retryAfterSec).toBe(30);
    t.c.retry();
    await t.c.settled();
    expect(t.c.getSnapshot()).toMatchObject({ state: { k: "ready" }, retryAfterSec: undefined });
  });

  it("carries the wait of a 429 on the creation too", async () => {
    const t = make({ creates: [bad(ErrorCode.rate_limited, 45)] });
    await begun(t);
    t.c.enter();
    await t.c.settled();
    expect(t.c.getSnapshot()).toMatchObject({ state: { k: "rejected", code: "rate_limited" }, retryAfterSec: 45 });
  });
});

describe("ConfirmController: Back and Pick another", () => {
  it("goes to Create on Back and to the Gallery on Pick another, from the quote, the gate or a rejection, and creates nothing", async () => {
    const t1 = make();
    await begun(t1);
    t1.c.back();
    await t1.c.settled();
    expect(t1.routes).toEqual([{ screen: "create" }]);
    expect(t1.c.getSnapshot().state).toEqual({ k: "cancelled" });

    const t2 = make();
    await begun(t2);
    t2.c.pickAnother();
    expect(t2.routes).toEqual([{ screen: "gallery" }]);
    expect(t2.c.getSnapshot().state).toEqual({ k: "cancelled" });

    const t3 = make({ quotes: [bad(ErrorCode.network_error)] });
    await begun(t3);
    t3.c.pickAnother();
    expect(t3.routes).toEqual([{ screen: "gallery" }]);
    for (const t of [t1, t2, t3]) expect(t.api.createWorld).not.toHaveBeenCalled();
  });

  it("does nothing while the place is being made", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = make();
    t.api.createWorld.mockImplementation(async () => { await gate; return { ok: true as const, value: { worldId: "w-1", status: "queued" as const } }; });
    await begun(t);
    t.c.enter();
    await Promise.resolve();
    expect(t.c.getSnapshot().state).toMatchObject({ k: "creating" });
    t.c.back();
    t.c.pickAnother();
    expect(t.routes).toEqual([]);
    expect(t.c.getSnapshot().state).toMatchObject({ k: "creating" });
    release();
    await t.c.settled();
    expect(t.routes).toEqual([{ screen: "haunt", worldId: "w-1" }]);
  });

  it("ignores a quote that comes after Back", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = make();
    t.api.quote.mockImplementation(async () => { await gate; return quoteOf(1); });
    t.c.begin();
    t.c.back();
    release();
    await t.c.settled();
    expect(t.c.getSnapshot().state).toEqual({ k: "cancelled" });
    expect(t.routes).toEqual([{ screen: "create" }]);
    t.c.enter();
    await t.c.settled();
    expect(t.api.createWorld).not.toHaveBeenCalled();
  });
});

describe("ConfirmController: leaving the Screen", () => {
  it("drops an answer that comes after destroy, and can begin again with a fresh quote that the old one cannot overwrite", async () => {
    let first!: () => void;
    const gate = new Promise<void>((r) => (first = r));
    const t = make({ quotes: [quoteOf(2)] });
    t.api.quote.mockImplementationOnce(async () => { await gate; return quoteOf(1); });
    t.c.begin();
    await vi.waitFor(() => expect(t.api.quote).toHaveBeenCalledTimes(1));
    t.c.destroy();
    t.c.begin();
    await t.c.settled();
    expect(t.api.quote).toHaveBeenCalledTimes(2);
    expect(t.c.getSnapshot().state).toMatchObject({ k: "ready", token: "token-2" });
    first();
    await t.c.settled();
    expect(t.c.getSnapshot().state).toMatchObject({ k: "ready", token: "token-2" });
    expect(t.quotasSet).toHaveLength(1);
  });

  it("tells subscribers about each change, and stops when they leave", async () => {
    const t = make();
    let n = 0;
    const off = t.c.subscribe(() => n++);
    await begun(t);
    const seen = n;
    expect(seen).toBeGreaterThan(0);
    off();
    t.c.enter();
    await t.c.settled();
    expect(n).toBe(seen);
  });
});
