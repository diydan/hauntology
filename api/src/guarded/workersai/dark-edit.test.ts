import { describe, expect, it } from "vitest";
import type { SpendTicket } from "@hauntology/shared/world/spend";
import { NoTicketError } from "../ticket";
import { DARK_PROMPT, DarkEditMaker, sniffImage } from "./dark-edit";

const ticket: SpendTicket = { id: "t1", meter: "image", sessionId: "s", issuedAt: 1 };
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 1, 2, 3, 4]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2]);
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

function fakeAi(answer: unknown | Error) {
  const calls: { model: string; input: Record<string, unknown>; options: unknown }[] = [];
  return {
    calls,
    ai: {
      async run(model: string, input: Record<string, unknown>, options?: { gateway: { id: string } }) {
        calls.push({ model, input, options });
        if (answer instanceof Error) throw answer;
        return answer;
      },
    },
  };
}

describe("DarkEditMaker", () => {
  it("needs a ticket for the image meter and makes no call without one", async () => {
    const { ai, calls } = fakeAi({ image: b64(PNG) });
    const maker = new DarkEditMaker(ai, "gw");
    await expect(maker.edit({ ...ticket, meter: "llm" }, JPEG)).rejects.toBeInstanceOf(NoTicketError);
    await expect(maker.edit(null as unknown as SpendTicket, JPEG)).rejects.toBeInstanceOf(NoTicketError);
    expect(calls).toHaveLength(0);
  });

  it("sends the edit prompt, the photo as base64 and the gateway, and reads a base64 answer", async () => {
    const { ai, calls } = fakeAi({ image: b64(PNG) });
    const out = await new DarkEditMaker(ai, "gw").edit(ticket, JPEG);
    expect(out).toEqual({ ok: true, image: PNG, type: "image/png" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.model).toBe("google/nano-banana-2");
    expect(calls[0]!.input).toEqual({ prompt: DARK_PROMPT, image_input: [b64(JPEG)] });
    expect(calls[0]!.options).toEqual({ gateway: { id: "gw" } });
  });

  it("reads a data URI, a nested result and an image list", async () => {
    for (const answer of [{ image: `data:image/png;base64,${b64(PNG)}` }, { result: { image: b64(PNG) } }, { images: [b64(PNG)] }]) {
      const out = await new DarkEditMaker(fakeAi(answer).ai, "gw").edit(ticket, JPEG);
      expect(out.ok).toBe(true);
    }
  });

  it("fetches an https address and refuses a page that is not a picture", async () => {
    const good = new DarkEditMaker(fakeAi({ url: "https://x.example/a.png" }).ai, "gw", undefined, { fetcher: async () => ({ ok: true, arrayBuffer: async () => PNG.buffer as ArrayBuffer }) });
    expect((await good.edit(ticket, JPEG)).ok).toBe(true);
    const page = new DarkEditMaker(fakeAi({ url: "https://x.example/a.png" }).ai, "gw", undefined, { fetcher: async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode("<html>").buffer as ArrayBuffer }) });
    expect(await page.edit(ticket, JPEG)).toEqual({ ok: false, kind: "unusable", keys: ["url"] });
  });

  it("says unusable with only the KEYS when the answer has no picture, never a value", async () => {
    const out = await new DarkEditMaker(fakeAi({ note: "secret text", count: 1 }).ai, "gw").edit(ticket, JPEG);
    expect(out).toEqual({ ok: false, kind: "unusable", keys: ["note", "count"] });
    expect(JSON.stringify(out)).not.toContain("secret");
  });

  it("maps a busy service to rate_limited and any other failure to failed, and refuses a bad photo before any call", async () => {
    expect(await new DarkEditMaker(fakeAi(new Error("429 too many requests")).ai, "gw").edit(ticket, JPEG)).toEqual({ ok: false, kind: "rate_limited" });
    expect(await new DarkEditMaker(fakeAi(new Error("boom")).ai, "gw").edit(ticket, JPEG)).toEqual({ ok: false, kind: "failed" });
    const none = fakeAi({ image: b64(PNG) });
    expect(await new DarkEditMaker(none.ai, "gw").edit(ticket, Uint8Array.from([1, 2, 3]))).toEqual({ ok: false, kind: "failed" });
    expect(await new DarkEditMaker(none.ai, "gw").edit(ticket, new Uint8Array(0))).toEqual({ ok: false, kind: "failed" });
    expect(none.calls).toHaveLength(0);
  });

  it("times out", async () => {
    const slow = { run: () => new Promise<unknown>(() => undefined) };
    expect(await new DarkEditMaker(slow, "gw", undefined, { timeoutMs: 10 }).edit(ticket, JPEG)).toEqual({ ok: false, kind: "failed" });
  });

  it("keeps the prompt an edit that names no person and no gore", () => {
    expect(DARK_PROMPT).toMatch(/do not redraw/);
    expect(DARK_PROMPT).toMatch(/no blood, no gore/);
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(JPEG)).toBe("image/jpeg");
    expect(sniffImage(Uint8Array.from([1, 2, 3]))).toBeNull();
  });
});
