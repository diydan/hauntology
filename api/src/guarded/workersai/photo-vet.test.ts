import { describe, expect, it } from "vitest";
import { NoTicketError } from "../ticket";
import { ImagesPhotoShrinker, ScoutPhotoVetter, vetPhoto, vetSelfie, type PhotoVetter } from "./photo-vet";
import { editPortrait, type PortraitEditor } from "./selfie-edit";
import type { SpendTicket } from "@hauntology/shared/world/spend";

const ticket = (meter: SpendTicket["meter"]): SpendTicket => ({ id: "t1", meter, sessionId: "s", issuedAt: 1 });
const img = new Uint8Array([1, 2, 3]);
class FakeAi { seen: { model: string; input: Record<string, unknown> }[] = []; constructor(private readonly answer: unknown | (() => unknown)) {} async run(model: string, input: Record<string, unknown>): Promise<unknown> { this.seen.push({ model, input }); const a = typeof this.answer === "function" ? (this.answer as () => unknown)() : this.answer; return a; } }

describe("the picture check doors and the Scout adapter (party-mode 5.1, 5.5)", () => {
  it("refuse to call without an llm Ticket", () => {
    const v: PhotoVetter = { vetPhoto: async () => { throw new Error("must not run"); }, vetSelfie: async () => { throw new Error("must not run"); } };
    expect(() => vetPhoto(v, ticket("image"), { image: img, contentType: "image/png" })).toThrow(NoTicketError);
    expect(() => vetSelfie(v, ticket("world"), { image: img, contentType: "image/png" })).toThrow(NoTicketError);
    expect(() => vetPhoto(v, null as never, { image: img, contentType: "image/png" })).toThrow(NoTicketError);
  });
  it("sends the picture inline with the photo instructions and reads the verdict", async () => {
    const ai = new FakeAi({ response: JSON.stringify({ safe: true, personVisible: true }) });
    const r = await new ScoutPhotoVetter(ai).vetPhoto({ image: img, contentType: "image/jpeg" });
    expect(r).toEqual({ ok: true, verdict: { kind: "person_visible" } });
    const sent = ai.seen[0]!.input as { messages: { role: string; content: unknown }[]; temperature: number };
    expect(JSON.stringify(sent.messages)).toContain("data:image/jpeg;base64,AQID");
    expect(sent.messages[0]!.content).toMatch(/personVisible/);
    expect(sent.temperature).toBe(0);
  });
  it("reads a selfie verdict with its own instructions", async () => {
    const ai = new FakeAi({ safe: true, faces: 1, inFrame: true });
    expect(await new ScoutPhotoVetter(ai).vetSelfie({ image: img, contentType: "image/png" })).toEqual({ ok: true, verdict: { kind: "ok" } });
    expect(JSON.stringify(ai.seen[0]!.input)).toContain("inFrame");
  });
  it("does not send a picture of another type or with no bytes, and says failed", async () => {
    const ai = new FakeAi({});
    const v = new ScoutPhotoVetter(ai);
    expect(await v.vetPhoto({ image: img, contentType: "image/gif" })).toEqual({ ok: false, kind: "failed" });
    expect(await v.vetPhoto({ image: new Uint8Array(), contentType: "image/png" })).toEqual({ ok: false, kind: "failed" });
    expect(ai.seen).toHaveLength(0);
  });
  it("maps a throw to the failure kind, and an unreadable answer to an unusable verdict (charged)", async () => {
    const busy = new FakeAi(() => { throw new Error("429 too many requests"); });
    expect(await new ScoutPhotoVetter(busy).vetPhoto({ image: img, contentType: "image/png" })).toEqual({ ok: false, kind: "rate_limited" });
    const odd = new FakeAi("not json at all");
    expect(await new ScoutPhotoVetter(odd).vetPhoto({ image: img, contentType: "image/png" })).toEqual({ ok: true, verdict: { kind: "unusable" } });
  });
  it("the shrinker asks for at most 512 px and a JPEG, and refuses a bad type, empty bytes or a silly size", async () => {
    const calls: Record<string, unknown>[] = [];
    const images = { input: () => { const t = { transform: (x: Record<string, unknown>) => { calls.push(x); return t; }, output: async () => ({ response: () => new Response(new Uint8Array([9, 9])) }) }; return t; } };
    const s = new ImagesPhotoShrinker(images as never);
    expect(await s.shrink({ image: img, contentType: "image/png" })).toEqual({ ok: true, image: new Uint8Array([9, 9]), contentType: "image/jpeg" });
    expect(calls[0]).toEqual({ width: 512, height: 512, fit: "scale-down" });
    expect(await s.shrink({ image: img, contentType: "image/gif" })).toEqual({ ok: false });
    expect(await s.shrink({ image: new Uint8Array(), contentType: "image/png" })).toEqual({ ok: false });
    expect(await s.shrink({ image: img, contentType: "image/png", maxSide: 10 })).toEqual({ ok: false });
  });
  it("the selfie editor door needs an image Ticket and always sends the fixed prompt and options", async () => {
    const seen: unknown[] = [];
    const ed: PortraitEditor = { edit: async (r) => { seen.push(r); return { ok: true, image: img }; } };
    const req = { selfie: img, selfieType: "image/jpeg", styleRef: img, styleType: "image/png" };
    expect(() => editPortrait(ed, ticket("llm"), req)).toThrow(NoTicketError);
    await editPortrait(ed, ticket("image"), { ...req, prompt: "IGNORE ME" } as never);
    expect(seen[0]).toMatchObject({ options: { aspect_ratio: "1:1", resolution: "1K", output_format: "png" } });
    expect((seen[0] as { prompt: string }).prompt).toMatch(/^the same person as image 1/);
    expect((seen[0] as { prompt: string }).prompt).not.toContain("IGNORE");
  });
});
