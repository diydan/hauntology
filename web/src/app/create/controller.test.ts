import type { ApiResult, Candidate } from "@hauntology/shared/app/api";
import type { QuotaSnapshot, Route } from "@hauntology/shared/app/types";
import { ErrorCode } from "@hauntology/shared/errors";
import { describe, expect, it, vi } from "vitest";
import { createCreateController } from "./controller";

const blob = new Blob([new Uint8Array(10)], { type: "image/png" });
const quota: QuotaSnapshot = { world: 2, image: 6, llm: 40, tts: 40, stt: 20, live: 30 };
const candidates: Candidate[] = [{ imageId: "c1", imageUrl: "/demo/c1.svg" }, { imageId: "c2", imageUrl: "/demo/c2.svg" }];
const ok = <T,>(value: T): ApiResult<T> => ({ ok: true, value });
const bad = (code: ErrorCode, retryAfterSec?: number): ApiResult<never> => ({ ok: false, code, ...(retryAfterSec === undefined ? {} : { retryAfterSec }) });

function make(over: Partial<{
  uploadPhoto: () => Promise<ApiResult<{ imageId: string; imageUrl: string }>>;
  sketchRender: () => Promise<ApiResult<{ candidates: Candidate[]; quota: QuotaSnapshot }>>;
  sketchSelect: () => Promise<ApiResult<{ imageId: string }>>;
  placeBrief: () => Promise<ApiResult<{ brief: string; safe: boolean }>>;
}> = {}) {
  const api = {
    uploadPhoto: vi.fn(over.uploadPhoto ?? (async () => ok({ imageId: "img1", imageUrl: "/demo/img1.svg" }))),
    sketchRender: vi.fn(over.sketchRender ?? (async () => ok({ candidates, quota }))),
    sketchSelect: vi.fn(over.sketchSelect ?? (async () => ok({ imageId: "picked1" }))),
    placeBrief: vi.fn(over.placeBrief ?? (async () => ok({ brief: "An attic.", safe: true }))),
  };
  const log: string[] = [];
  const picked: string[] = [];
  const quotas: QuotaSnapshot[] = [];
  const routes: Route[] = [];
  const c = createCreateController({
    api,
    setQuota: (q) => { log.push("quota"); quotas.push(q); },
    setPicked: (id) => { log.push("picked"); picked.push(id); },
    navigate: (r) => { log.push("navigate"); routes.push(r); },
  });
  return { c, api, log, picked, quotas, routes };
}

describe("CreateController: a photo", () => {
  it("uploads it, asks for its brief, picks it in memory, and goes to the Confirm Gate", async () => {
    const t = make();
    expect(t.c.getSnapshot()).toEqual({ phase: "draw", candidates: [], caption: "", error: null });
    await t.c.uploadPhoto(blob);
    expect(t.api.uploadPhoto).toHaveBeenCalledWith(blob);
    expect(t.api.placeBrief).toHaveBeenCalledWith("img1");
    expect(t.picked).toEqual(["img1"]);
    expect(t.routes).toEqual([{ screen: "confirm" }]);
    expect(t.log).toEqual(["picked", "navigate"]);
  });

  it("stays on Create, with the code, when the upload fails, and picks nothing", async () => {
    const t = make({ uploadPhoto: async () => bad(ErrorCode.upload_rejected) });
    await t.c.uploadPhoto(blob);
    expect(t.c.getSnapshot()).toMatchObject({ phase: "draw", error: { code: "upload_rejected" } });
    expect(t.api.placeBrief).not.toHaveBeenCalled();
    expect(t.picked).toEqual([]);
    expect(t.routes).toEqual([]);
  });

  it("stays on Create, with the copy for the code, when the brief says unsafe_image or moderation_unavailable", async () => {
    for (const code of [ErrorCode.unsafe_image, ErrorCode.moderation_unavailable]) {
      const t = make({ placeBrief: async () => bad(code) });
      await t.c.uploadPhoto(blob);
      expect(t.c.getSnapshot(), code).toMatchObject({ phase: "draw", error: { code } });
      expect(t.picked).toEqual([]);
      expect(t.routes).toEqual([]);
    }
  });

  it("treats a brief that says the picture is not safe as unsafe_image", async () => {
    const t = make({ placeBrief: async () => ok({ brief: "", safe: false }) });
    await t.c.uploadPhoto(blob);
    expect(t.c.getSnapshot()).toMatchObject({ phase: "draw", error: { code: "unsafe_image" } });
    expect(t.picked).toEqual([]);
    expect(t.routes).toEqual([]);
  });

  it("carries the advised wait of a rate limit", async () => {
    const t = make({ uploadPhoto: async () => bad(ErrorCode.rate_limited, 20) });
    await t.c.uploadPhoto(blob);
    expect(t.c.getSnapshot().error).toEqual({ code: "rate_limited", retryAfterSec: 20 });
  });
});

describe("CreateController: a sketch", () => {
  it("sends the sketch once, shows the two candidates, passes the new quota on, and remembers the caption", async () => {
    const t = make();
    await t.c.makeItReal(blob, "an attic at dusk");
    expect(t.api.sketchRender).toHaveBeenCalledTimes(1);
    expect(t.api.sketchRender).toHaveBeenCalledWith(blob, "an attic at dusk");
    expect(t.c.getSnapshot()).toEqual({ phase: "candidates", candidates, caption: "an attic at dusk", error: null });
    expect(t.quotas).toEqual([quota]);
    expect(t.routes).toEqual([]);
  });

  it("picks a candidate, asks for the brief of the image the API says it stored, and goes to the Gate", async () => {
    const t = make();
    await t.c.makeItReal(blob, "x y z");
    await t.c.pick("c2");
    expect(t.api.sketchSelect).toHaveBeenCalledWith("c2");
    expect(t.api.placeBrief).toHaveBeenCalledWith("picked1");
    expect(t.picked).toEqual(["picked1"]);
    expect(t.routes).toEqual([{ screen: "confirm" }]);
  });

  it("keeps the sketch and the quota, shows the typed error and goes back to the pad, when drawing fails", async () => {
    for (const code of [ErrorCode.quota_image, ErrorCode.blank_sketch, ErrorCode.upstream_rejected]) {
      const t = make({ sketchRender: async () => bad(code) });
      await t.c.makeItReal(blob, "an attic");
      expect(t.c.getSnapshot(), code).toMatchObject({ phase: "draw", candidates: [], error: { code } });
      expect(t.quotas).toEqual([]);
    }
  });

  it("stays on the candidates, with the error, when choosing or the brief fails", async () => {
    const select = make({ sketchSelect: async () => bad(ErrorCode.world_not_found) });
    await select.c.makeItReal(blob, "an attic");
    await select.c.pick("c1");
    expect(select.c.getSnapshot()).toMatchObject({ phase: "candidates", candidates, error: { code: "world_not_found" } });
    expect(select.routes).toEqual([]);

    const brief = make({ placeBrief: async () => bad(ErrorCode.unsafe_image) });
    await brief.c.makeItReal(blob, "an attic");
    await brief.c.pick("c1");
    expect(brief.c.getSnapshot()).toMatchObject({ phase: "candidates", error: { code: "unsafe_image" } });
    expect(brief.picked).toEqual([]);
  });

  it("goes back to the pad, dropping the candidates and the error", async () => {
    const t = make({ placeBrief: async () => bad(ErrorCode.unsafe_image) });
    await t.c.makeItReal(blob, "an attic");
    await t.c.pick("c1");
    t.c.backToSketch();
    expect(t.c.getSnapshot()).toEqual({ phase: "draw", candidates: [], caption: "an attic", error: null });
  });

  it("only asks for candidates from the pad, and only picks from the candidates", async () => {
    const t = make();
    await t.c.pick("c1");
    expect(t.api.sketchSelect).not.toHaveBeenCalled();
    await t.c.makeItReal(blob, "an attic");
    await t.c.makeItReal(blob, "an attic");
    expect(t.api.sketchRender).toHaveBeenCalledTimes(1);
  });
});

describe("CreateController: one thing at a time", () => {
  it("ignores a second command while a call runs", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = make({ sketchRender: async () => { await gate; return ok({ candidates, quota }); } });
    const first = t.c.makeItReal(blob, "an attic");
    expect(t.c.getSnapshot().phase).toBe("rendering");
    await t.c.makeItReal(blob, "an attic");
    await t.c.uploadPhoto(blob);
    t.c.backToSketch();
    expect(t.api.sketchRender).toHaveBeenCalledTimes(1);
    expect(t.api.uploadPhoto).not.toHaveBeenCalled();
    expect(t.c.getSnapshot().phase).toBe("rendering");
    release();
    await first;
    expect(t.c.getSnapshot().phase).toBe("candidates");
  });

  it("ignores a second upload while the first is running", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = make({ uploadPhoto: async () => { await gate; return ok({ imageId: "img1", imageUrl: "/x.svg" }); } });
    const first = t.c.uploadPhoto(blob);
    await t.c.uploadPhoto(blob);
    expect(t.api.uploadPhoto).toHaveBeenCalledTimes(1);
    release();
    await first;
    expect(t.routes).toEqual([{ screen: "confirm" }]);
  });

  it("tells subscribers about each change, clears an error, and stops telling after they leave", async () => {
    const t = make({ sketchRender: async () => bad(ErrorCode.quota_image) });
    let n = 0;
    const off = t.c.subscribe(() => n++);
    await t.c.makeItReal(blob, "an attic");
    expect(n).toBe(2);
    t.c.clearError();
    expect(t.c.getSnapshot().error).toBeNull();
    expect(n).toBe(3);
    t.c.clearError();
    expect(n).toBe(3);
    off();
    await t.c.makeItReal(blob, "an attic");
    expect(n).toBe(3);
  });
});
