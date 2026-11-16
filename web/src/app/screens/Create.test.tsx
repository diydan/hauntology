// @vitest-environment jsdom
import type { ApiResult, ShellApi } from "@hauntology/shared/app/api";
import { errorCopy } from "@hauntology/shared/app/errors-copy";
import { PHOTO_NOTICE, PHOTO_UNREADABLE_LINE } from "@hauntology/shared/app/photo";
import { CAPTION_REASON, INK_REASON } from "@hauntology/shared/app/sketch-pad";
import { REASON_COPY } from "@hauntology/shared/app/home-copy";
import { jpegWithExif } from "@hauntology/shared/conditions/exif.fixture";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createFakeApi, type FakeApi, type FakeApiOptions } from "../FakeApi";
import { createPlayMemory, type PlayMemoryStore } from "../play/memory";
import type { PlatformKit } from "../platform";
import { renderApp } from "../../test/harness";
import { fakePhotoKit } from "../../test/photo";
import { live, press, testPlatform } from "../../test/play";
import { rasterSurfaceFactory } from "../../test/surface";

beforeAll(() => {
  // jsdom has no PointerEvent: a mouse event that carries the pointer's id and kind is enough for the pad.
  if (typeof window.PointerEvent === "undefined") {
    class TestPointerEvent extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? "mouse";
      }
    }
    (window as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent;
  }
});

afterEach(() => cleanup());

type Opened = {
  h: ReturnType<typeof renderApp>;
  fake: FakeApi;
  memory: PlayMemoryStore;
  surface: ReturnType<typeof rasterSurfaceFactory>;
  photo: ReturnType<typeof fakePhotoKit>;
  p: ReturnType<typeof testPlatform>;
};

async function open(options: { fake?: FakeApiOptions; api?: ShellApi; sizes?: Record<string, { width: number; height: number }>; memory?: PlayMemoryStore; fakeApi?: FakeApi } = {}): Promise<Opened> {
  const fake = options.fakeApi ?? createFakeApi({ latencyMs: 0, ...options.fake });
  const surface = rasterSurfaceFactory();
  const photo = fakePhotoKit(options.sizes ?? {});
  const p = testPlatform();
  const memory = options.memory ?? createPlayMemory();
  const kit: Partial<PlatformKit> = { ...p.kit, surface: surface.factory, photo: photo.kit, now: () => new Date(2026, 10, 15, 14, 30) };
  const h = renderApp("/create", { api: options.api ?? fake, platform: kit, memory });
  await screen.findByRole("heading", { name: "Make a place" });
  return { h, fake, memory, surface, photo, p };
}

const pad = () => screen.getByRole("img", { name: "Drawing pad" }) as HTMLCanvasElement;
const makeButton = () => screen.getByRole("button", { name: /Make it real|Making it real/ });
const isOff = (el: HTMLElement) => el.getAttribute("aria-disabled") === "true";
const padReason = () => document.getElementById("pad-reason")?.textContent ?? null;

/** One stroke from point to point, the way a pointer makes it. */
function stroke(points: Array<[number, number]>, options: { pointerId?: number; pointerType?: string; button?: number } = {}) {
  const base = { pointerId: options.pointerId ?? 1, pointerType: options.pointerType ?? "touch", button: options.button ?? 0, bubbles: true };
  const [first, ...rest] = points;
  act(() => { fireEvent.pointerDown(pad(), { ...base, clientX: first![0], clientY: first![1] }); });
  for (const [x, y] of rest) act(() => { fireEvent.pointerMove(pad(), { ...base, clientX: x, clientY: y }); });
  const last = points[points.length - 1]!;
  act(() => { fireEvent.pointerUp(pad(), { ...base, clientX: last[0], clientY: last[1] }); });
}

/** A line fat enough to be well past the ink floor. */
const bigStroke = () => {
  act(() => { fireEvent.click(screen.getByRole("button", { name: "Large size" })); });
  stroke([[100, 100], [200, 110], [300, 100], [400, 120]]);
};

describe("Create: the page", () => {
  it("offers a photo and the Gallery before the pad, so Tab reaches them first, and says the pad is a pointer tool", async () => {
    await open();
    const file = screen.getByLabelText("Choose a photo");
    const gallery = screen.getAllByRole("link", { name: "Visit a gallery place" })[0]!;
    const brush = screen.getByRole("button", { name: "Brush" });
    const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(file, gallery)).toBe(true);
    expect(before(gallery, brush)).toBe(true);
    expect(before(file, pad())).toBe(true);
    expect(gallery.getAttribute("href")).toBe("/gallery");
    expect(pad().getAttribute("aria-describedby")).toBe("pad-help");
    expect(document.getElementById("pad-help")?.textContent).toMatch(/pointer tool/);
    expect(document.getElementById("pad-help")?.textContent).toMatch(/upload a photo or visit the Gallery/);
  });

  it("has the brush, the eraser, three sizes, undo, redo and clear, and nothing to undo on a blank page", async () => {
    await open();
    expect(screen.getByRole("button", { name: "Brush" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Eraser" }).getAttribute("aria-pressed")).toBe("false");
    for (const s of ["Small size", "Medium size", "Large size"]) expect(screen.getByRole("button", { name: s })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Medium size" }).getAttribute("aria-pressed")).toBe("true");
    for (const name of ["Undo", "Redo", "Clear"]) expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Eraser" }));
    expect(screen.getByRole("button", { name: "Eraser" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Brush" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("makes the page from the model: the surface is made once and painted from the history", async () => {
    const o = await open();
    expect(o.surface.factory).toHaveBeenCalledTimes(1);
    expect(o.surface.factory.mock.calls[0]![0]).toBe(pad());
    bigStroke();
    expect(o.surface.factory).toHaveBeenCalledTimes(1);
    expect(o.surface.made[0]!.extends).toBeGreaterThan(2);
    expect(o.surface.made[0]!.redraws).toBeGreaterThanOrEqual(2);
  });
});

describe("Create: drawing and the ink floor", () => {
  it("keeps Make it real off, with the reason, until there is enough ink, and a dot is not enough", async () => {
    await open();
    expect(isOff(makeButton())).toBe(true);
    expect(padReason()).toBe(INK_REASON);
    expect(makeButton().getAttribute("aria-describedby")).toBe("pad-reason");
    fireEvent.click(screen.getByRole("button", { name: "Small size" }));
    stroke([[50, 50]]);
    expect(isOff(makeButton())).toBe(true);
    bigStroke();
    expect(isOff(makeButton())).toBe(false);
    expect(padReason()).toBeNull();
  });

  it("turns it off again when the ink is erased, undone or cleared, and on again with redo", async () => {
    await open();
    bigStroke();
    expect(isOff(makeButton())).toBe(false);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Undo" })); });
    expect(isOff(makeButton())).toBe(true);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Redo" })); });
    expect(isOff(makeButton())).toBe(false);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Clear" })); });
    expect(isOff(makeButton())).toBe(true);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Undo" })); });
    expect(isOff(makeButton())).toBe(false);
    // An eraser stroke over the ink takes it away.
    fireEvent.click(screen.getByRole("button", { name: "Eraser" }));
    for (const y of [60, 80, 100, 120, 140, 160]) stroke([[60, y], [440, y]]);
    expect(isOff(makeButton())).toBe(true);
  });

  it("undoes at least 30 strokes one at a time", async () => {
    await open();
    for (let i = 0; i < 30; i++) stroke([[20 + i * 10, 20], [20 + i * 10, 40]]);
    for (let i = 0; i < 30; i++) act(() => { fireEvent.click(screen.getByRole("button", { name: "Undo" })); });
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("draws with a mouse, a finger and a pen, ignores a second pointer while one is down, and a right click", async () => {
    await open();
    const clear = () => screen.getByRole("button", { name: "Clear" }) as HTMLButtonElement;
    expect(clear().disabled).toBe(true);
    for (const pointerType of ["mouse", "touch", "pen"]) {
      stroke([[100, 100], [300, 100]], { pointerType });
      expect(clear().disabled, pointerType).toBe(false);
      act(() => { fireEvent.click(clear()); });
      expect(clear().disabled).toBe(true);
    }
    stroke([[100, 100], [300, 100]], { pointerType: "mouse", button: 2 });
    expect(clear().disabled).toBe(true);
    // A second finger while one is down changes nothing; the first stroke still ends as one step.
    act(() => { fireEvent.pointerDown(pad(), { pointerId: 1, pointerType: "touch", clientX: 10, clientY: 10, bubbles: true }); });
    act(() => { fireEvent.pointerDown(pad(), { pointerId: 2, pointerType: "touch", clientX: 300, clientY: 300, bubbles: true }); });
    act(() => { fireEvent.pointerMove(pad(), { pointerId: 2, pointerType: "touch", clientX: 400, clientY: 400, bubbles: true }); });
    act(() => { fireEvent.pointerUp(pad(), { pointerId: 2, pointerType: "touch", clientX: 400, clientY: 400, bubbles: true }); });
    expect(clear().disabled).toBe(true);
    act(() => { fireEvent.pointerUp(pad(), { pointerId: 1, pointerType: "touch", clientX: 10, clientY: 10, bubbles: true }); });
    expect(clear().disabled).toBe(false);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Undo" })); });
    expect(clear().disabled).toBe(true);
  });

  it("ends a stroke the system cancels", async () => {
    await open();
    act(() => { fireEvent.pointerDown(pad(), { pointerId: 1, pointerType: "touch", clientX: 10, clientY: 10, bubbles: true }); });
    act(() => { fireEvent.pointerMove(pad(), { pointerId: 1, pointerType: "touch", clientX: 200, clientY: 200, bubbles: true }); });
    act(() => { fireEvent.pointerCancel(pad(), { pointerId: 1, pointerType: "touch", bubbles: true }); });
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("Create: the caption", () => {
  it("is optional; one or two characters keep Make it real off with a reason; three are enough; there is a limit of 200", async () => {
    await open();
    bigStroke();
    expect(isOff(makeButton())).toBe(false);
    const caption = screen.getByLabelText("Caption (optional)") as HTMLInputElement;
    expect(caption.maxLength).toBe(200);
    fireEvent.change(caption, { target: { value: "ab" } });
    expect(isOff(makeButton())).toBe(true);
    expect(padReason()).toBe(CAPTION_REASON);
    fireEvent.change(caption, { target: { value: "abc" } });
    expect(isOff(makeButton())).toBe(false);
    expect(document.getElementById("pad-count")?.textContent).toBe("3 of 200");
    fireEvent.change(caption, { target: { value: "  " } });
    expect(isOff(makeButton())).toBe(false);
  });
});

describe("Create: Make it real and the candidates", () => {
  async function toCandidates(o: Opened, text = "an attic at dusk") {
    bigStroke();
    fireEvent.change(screen.getByLabelText("Caption (optional)"), { target: { value: text } });
    await act(async () => { fireEvent.click(makeButton()); });
    await screen.findByRole("heading", { name: "Pick the one that feels right" });
    void o;
  }

  it("sends the sketch once, downscaled to 512 px, and shows two candidates with alt text from the caption and the pictures that are left", async () => {
    const o = await open();
    const render = vi.spyOn(o.fake, "sketchRender");
    bigStroke();
    fireEvent.change(screen.getByLabelText("Caption (optional)"), { target: { value: "  an attic at dusk  " } });
    await act(async () => {
      fireEvent.click(makeButton());
      fireEvent.click(makeButton());
    });
    await screen.findByRole("heading", { name: "Pick the one that feels right" });
    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0]![1]).toBe("an attic at dusk");
    expect((render.mock.calls[0]![0] as Blob).type).toBe("image/png");
    expect(o.surface.sizes).toEqual([512]);
    const imgs = screen.getAllByRole("img").filter((i) => i.tagName === "IMG");
    expect(imgs).toHaveLength(2);
    expect(imgs.map((i) => i.getAttribute("alt"))).toEqual([
      'Option 1: "an attic at dusk", made into a picture',
      'Option 2: "an attic at dusk", made into a picture',
    ]);
    for (const i of imgs) expect(i.getAttribute("src")).toMatch(/^\//);
    // The demo spends two pictures of eight.
    expect(document.querySelector("[data-pictures-left]")?.textContent).toBe("Pictures left this visit: 6");
    expect(screen.queryByRole("img", { name: "Drawing pad" })).toBeNull();
  });

  it("uses a plain alt text when there is no caption", async () => {
    const o = await open();
    bigStroke();
    await act(async () => { fireEvent.click(makeButton()); });
    await screen.findByRole("heading", { name: "Pick the one that feels right" });
    expect(screen.getAllByRole("img")[0]!.getAttribute("alt")).toBe("Option 1: your sketch, made into a picture");
    void o;
  });

  it("picks a candidate, asks for the brief, keeps the picked image in memory only and goes to the Confirm Gate", async () => {
    const o = await open();
    const select = vi.spyOn(o.fake, "sketchSelect");
    const brief = vi.spyOn(o.fake, "placeBrief");
    await toCandidates(o);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use option 2" })); });
    await screen.findByRole("heading", { name: "Enter this place?" });
    expect(select).toHaveBeenCalledTimes(1);
    const picked = o.h.router.getSnapshot().flow.pickedImageId;
    expect(picked).toBeDefined();
    expect(brief).toHaveBeenCalledWith(picked);
    expect(o.h.history.stack.at(-1)).toBe("/confirm");
    expect(o.h.history.stack.join(" ")).not.toContain(picked!);
  });

  it("goes back to the sketch with every stroke kept, and Redraw starts again from a blank page", async () => {
    const o = await open();
    await toCandidates(o);
    await press("Back to the sketch");
    await screen.findByRole("img", { name: "Drawing pad" });
    expect(isOff(makeButton())).toBe(false);
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText("Caption (optional)") as HTMLInputElement).value).toBe("an attic at dusk");

    await act(async () => { fireEvent.click(makeButton()); });
    await screen.findByRole("heading", { name: "Pick the one that feels right" });
    await press("Redraw");
    await screen.findByRole("img", { name: "Drawing pad" });
    expect(isOff(makeButton())).toBe(true);
    expect(padReason()).toBe(INK_REASON);
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Create: when drawing is refused", () => {
  it("keeps the sketch, shows the typed message and offers the Gallery when the server refuses", async () => {
    const o = await open();
    bigStroke();
    o.fake.backend.failNext("sketchRender", "quota_image");
    await act(async () => { fireEvent.click(makeButton()); });
    const copy = errorCopy("quota_image");
    await screen.findByRole("heading", { name: copy.title });
    const box = document.querySelector(".create-error") as HTMLElement;
    expect(within(box).getByText(copy.body)).toBeTruthy();
    expect(within(box).getByRole("link", { name: "Visit a gallery place" }).getAttribute("href")).toBe("/gallery");
    expect(live()).toBe(`${copy.title}. ${copy.body}`);
    expect(o.h.history.stack.at(-1)).toBe("/create");
    // The strokes are still there, and the pad still works.
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(false);
    expect(isOff(makeButton())).toBe(false);
    await press("Close this");
    expect(document.querySelector(".create-error")).toBeNull();
  });

  it("holds Make it real for the advised wait after a rate limit, and says so", async () => {
    const base = createFakeApi({ latencyMs: 0 });
    const api: ShellApi = { ...base, sketchRender: async (): Promise<ApiResult<never>> => ({ ok: false, code: "rate_limited", retryAfterSec: 20 }) };
    const o = await open({ api, fakeApi: base });
    bigStroke();
    await act(async () => { fireEvent.click(makeButton()); });
    await screen.findByRole("heading", { name: errorCopy("rate_limited").title });
    expect(isOff(makeButton())).toBe(true);
    expect(padReason()).toMatch(/^Try again in \d+\.$/);
    void o;
  });

  it("turns Make it real off, with the world-switch reason, and the photo picker too, when new places are off", async () => {
    await open({ fake: { flags: { worldGenEnabled: false } } });
    bigStroke();
    expect(isOff(makeButton())).toBe(true);
    expect(padReason()).toBe(REASON_COPY.kill_switch);
    expect((screen.getByLabelText("Choose a photo") as HTMLInputElement).disabled).toBe(true);
    expect(document.getElementById("photo-reason")?.textContent).toBe(REASON_COPY.kill_switch);
    expect(screen.getAllByRole("link", { name: "Visit a gallery place" }).length).toBeGreaterThan(0);
  });

  it("turns only drawing off when the sketch pictures are used up, and a photo can still be sent", async () => {
    await open({ fake: { quota: { image: 0 } } });
    bigStroke();
    expect(isOff(makeButton())).toBe(true);
    expect(padReason()).toBe(REASON_COPY.quota_image);
    expect((screen.getByLabelText("Choose a photo") as HTMLInputElement).disabled).toBe(false);
  });

  it("stays on the candidates with the error when choosing one fails or the brief says the picture is unsafe", async () => {
    for (const method of ["sketchSelect", "placeBrief"] as const) {
      const o = await open();
      bigStroke();
      await act(async () => { fireEvent.click(makeButton()); });
      await screen.findByRole("heading", { name: "Pick the one that feels right" });
      const code = method === "sketchSelect" ? "world_not_found" : "unsafe_image";
      o.fake.backend.failNext(method, code);
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use option 1" })); });
      await screen.findByRole("heading", { name: errorCopy(code).title });
      expect(screen.getByRole("heading", { name: "Pick the one that feels right" })).toBeTruthy();
      expect(o.h.history.stack.at(-1)).toBe("/create");
      expect(o.h.router.getSnapshot().flow.pickedImageId).toBeUndefined();
      cleanup();
    }
  });
});

describe("Create: nothing is kept outside this page", () => {
  it("writes nothing to storage or cookies while drawing, undoing and making it real", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const cookie = vi.spyOn(document, "cookie", "set");
    const o = await open();
    bigStroke();
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Undo" })); });
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Redo" })); });
    fireEvent.change(screen.getByLabelText("Caption (optional)"), { target: { value: "an attic" } });
    await act(async () => { fireEvent.click(makeButton()); });
    await screen.findByRole("heading", { name: "Pick the one that feels right" });
    expect(setItem).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    setItem.mockRestore();
    cookie.mockRestore();
    void o;
  });

  it("sends nothing to the API while drawing: the only call is Make it real", async () => {
    const o = await open();
    const calls = vi.spyOn(o.fake, "sketchRender");
    const upload = vi.spyOn(o.fake, "uploadPhoto");
    bigStroke();
    stroke([[10, 10], [500, 400]]);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Undo" })); });
    expect(calls).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("Create: the photo picker", () => {
  const jpeg = (name: string, order: "II" | "MM" = "II", original = "1987:06:21 06:40:00") =>
    new File([jpegWithExif({ order, original, make: "Acme", serial: "SN-1", gps: true, gpsDate: "2019:07:08", digitized: "2020:01:02 03:04:05" })], name, { type: "image/jpeg" });
  const sizes = { "attic.jpg": { width: 4000, height: 3000 }, "small.jpg": { width: 400, height: 900 }, "huge.jpg": { width: 9000, height: 4000 } };
  const choose = async (file: File) => {
    const input = screen.getByLabelText("Choose a photo") as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
  };

  it("says that metadata is dropped and that the photo is kept 24 hours at most, before any file is chosen", async () => {
    await open();
    expect(screen.getByText(PHOTO_NOTICE)).toBeTruthy();
    expect(PHOTO_NOTICE).toMatch(/24 hours at most/);
    const input = screen.getByLabelText("Choose a photo") as HTMLInputElement;
    expect(input.accept).toBe("image/jpeg,image/png,image/webp");
    expect(input.getAttribute("aria-describedby")).toBe("photo-notice");
  });

  it("shows a preview and sends nothing until the visitor presses Use this photo, then sends only the re-encoded picture", async () => {
    const o = await open({ sizes });
    const upload = vi.spyOn(o.fake, "uploadPhoto");
    const file = jpeg("attic.jpg");
    await choose(file);
    const preview = (await screen.findByAltText("The photo you chose")) as HTMLImageElement;
    expect(preview.getAttribute("src")).toBe("blob:fake-1");
    expect(upload).not.toHaveBeenCalled();
    expect(o.photo.kit.reencode).not.toHaveBeenCalled();
    expect(o.h.history.stack.at(-1)).toBe("/create");

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use this photo" })); });
    await screen.findByRole("heading", { name: "Enter this place?" });
    expect(o.photo.kit.reencode).toHaveBeenCalledTimes(1);
    expect(o.photo.kit.reencode).toHaveBeenCalledWith(file, 0.92);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0]![0]).toBe(o.photo.encoded[0]);
    expect(upload.mock.calls[0]![0]).not.toBe(file);
    expect(o.h.router.getSnapshot().flow.pickedImageId).toBeDefined();
    expect(o.h.history.stack.at(-1)).toBe("/confirm");
  });

  it("reads the capture date of a JPEG, little-endian or big-endian, and offers only that as a suggested Memory Day", async () => {
    for (const order of ["II", "MM"] as const) {
      const o = await open({ sizes });
      await choose(jpeg("attic.jpg", order));
      await screen.findByText("Taken on 1987-06-21. You can use that day for the sky later.");
      expect(o.memory.get().suggestedDay).toEqual({ date: "1987-06-21", timeOfDay: "dawn" });
      expect(Object.keys(o.memory.get().suggestedDay!).sort()).toEqual(["date", "timeOfDay"]);
      const asText = JSON.stringify(o.memory.get());
      for (const secret of ["Acme", "SN-1", "2019", "2020"]) expect(asText).not.toContain(secret);
      cleanup();
    }
  });

  it("takes an old suggestion away when the next file has no date, or is not a JPEG, or is refused", async () => {
    const memory = createPlayMemory();
    const o = await open({ sizes: { ...sizes, "plain.jpg": { width: 2000, height: 2000 }, "a.png": { width: 2000, height: 2000 } }, memory });
    await choose(jpeg("attic.jpg"));
    await screen.findByText(/Taken on 1987-06-21/);
    expect(memory.get().suggestedDay).toBeDefined();

    await choose(new File([jpegWithExif({})], "plain.jpg", { type: "image/jpeg" }));
    await screen.findByAltText("The photo you chose");
    expect(memory.get().suggestedDay).toBeUndefined();
    expect(document.querySelector("[data-photo-date]")).toBeNull();

    await choose(jpeg("attic.jpg"));
    await screen.findByText(/Taken on 1987-06-21/);
    (o.photo.kit.head as ReturnType<typeof vi.fn>).mockClear();
    await choose(new File([jpegWithExif({ original: "1987:06:21 06:40:00" })], "a.png", { type: "image/png" }));
    await screen.findByAltText("The photo you chose");
    expect(o.photo.kit.head).not.toHaveBeenCalled();
    expect(memory.get().suggestedDay).toBeUndefined();

    await choose(jpeg("attic.jpg"));
    await screen.findByText(/Taken on 1987-06-21/);
    await choose(new File([new Uint8Array(10)], "x.gif", { type: "image/gif" }));
    expect(memory.get().suggestedDay).toBeUndefined();
  });

  it("refuses a file that is the wrong kind, too big, too small, too large in pixels or not a picture, each with its own copy, and shows no preview", async () => {
    const o = await open({ sizes });
    const cases: Array<[File, string]> = [
      [new File([new Uint8Array(10)], "x.gif", { type: "image/gif" }), errorCopy("upload_bad_type").title],
      [Object.defineProperty(new File([new Uint8Array(10)], "attic.jpg", { type: "image/jpeg" }), "size", { value: 11 * 1024 * 1024 }), errorCopy("upload_too_large").title],
      [new File([new Uint8Array(10)], "small.jpg", { type: "image/jpeg" }), errorCopy("upload_too_small").title],
      [new File([new Uint8Array(10)], "huge.jpg", { type: "image/jpeg" }), errorCopy("upload_rejected").title],
      [new File([], "empty.jpg", { type: "image/jpeg" }), errorCopy("upload_rejected").title],
    ];
    for (const [file, title] of cases) {
      await choose(file);
      expect(document.querySelector("[data-photo-problem]")?.textContent, file.name).toContain(title);
      expect(screen.queryByAltText("The photo you chose")).toBeNull();
      expect(live()).toContain(title);
    }
    await choose(new File([new Uint8Array(10)], "unknown.jpg", { type: "image/jpeg" }));
    expect(document.querySelector("[data-photo-problem]")?.textContent).toBe(PHOTO_UNREADABLE_LINE);
    expect(o.photo.kit.reencode).not.toHaveBeenCalled();
    expect(o.h.history.stack.at(-1)).toBe("/create");
  });

  it("clears an earlier problem when a good file is chosen, and lets the old preview go", async () => {
    const o = await open({ sizes });
    await choose(new File([new Uint8Array(10)], "x.gif", { type: "image/gif" }));
    expect(document.querySelector("[data-photo-problem]")).not.toBeNull();
    await choose(jpeg("attic.jpg"));
    await screen.findByAltText("The photo you chose");
    expect(document.querySelector("[data-photo-problem]")).toBeNull();
    await choose(jpeg("attic.jpg"));
    await screen.findByAltText("The photo you chose");
    expect(o.photo.revoked).toEqual(["blob:fake-1"]);
    cleanup();
    expect(o.photo.revoked).toEqual(["blob:fake-1", "blob:fake-2"]);
  });

  it("takes the newest file when two are chosen quickly", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const o = await open({ sizes });
    (o.photo.kit.inspect as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => { await gate; return sizes["attic.jpg"]; });
    const input = screen.getByLabelText("Choose a photo") as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { files: [jpeg("attic.jpg", "II", "1990:01:01 12:00:00")] } }); });
    await act(async () => { fireEvent.change(input, { target: { files: [jpeg("attic.jpg", "II", "2001:02:03 12:00:00")] } }); });
    await screen.findByText("Taken on 2001-02-03. You can use that day for the sky later.");
    await act(async () => { release(); });
    expect(screen.queryByText(/1990-01-01/)).toBeNull();
    expect(screen.getAllByAltText("The photo you chose")).toHaveLength(1);
  });

  it("tries a lower JPEG quality when the picture is over 10 MB, and sends the first one that fits", async () => {
    const o = await open({ sizes });
    const upload = vi.spyOn(o.fake, "uploadPhoto");
    o.photo.reencodeSizes.push(11 * 1024 * 1024, 5 * 1024 * 1024);
    await choose(jpeg("attic.jpg"));
    await screen.findByAltText("The photo you chose");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use this photo" })); });
    await screen.findByRole("heading", { name: "Enter this place?" });
    expect(o.photo.kit.reencode).toHaveBeenCalledTimes(2);
    expect((o.photo.kit.reencode as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1])).toEqual([0.92, 0.8]);
    expect(upload.mock.calls[0]![0]).toBe(o.photo.encoded[1]);
  });

  it("says the photo is too big when no quality fits, and the photo could not be made when the browser fails; nothing is sent", async () => {
    const o = await open({ sizes });
    const upload = vi.spyOn(o.fake, "uploadPhoto");
    o.photo.reencodeSizes.push(...[11, 12, 13].map((m) => m * 1024 * 1024));
    await choose(jpeg("attic.jpg"));
    await screen.findByAltText("The photo you chose");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use this photo" })); });
    await waitFor(() => expect(document.querySelector("[data-photo-problem]")?.textContent).toContain(errorCopy("upload_too_large").title));
    expect(o.photo.kit.reencode).toHaveBeenCalledTimes(3);

    (o.photo.kit.reencode as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => null);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use this photo" })); });
    await waitFor(() => expect(document.querySelector("[data-photo-problem]")?.textContent).toContain(errorCopy("upload_rejected").title));
    expect(upload).not.toHaveBeenCalled();
  });

  it("stays on Create, with the typed message and the Gallery, when the upload fails or the brief says unsafe_image", async () => {
    for (const [method, code] of [["uploadPhoto", "upload_rejected"], ["placeBrief", "unsafe_image"], ["placeBrief", "moderation_unavailable"]] as const) {
      const o = await open({ sizes });
      await choose(jpeg("attic.jpg"));
      await screen.findByAltText("The photo you chose");
      o.fake.backend.failNext(method, code);
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use this photo" })); });
      await screen.findByRole("heading", { name: errorCopy(code).title });
      expect(within(document.querySelector(".create-error") as HTMLElement).getByRole("link", { name: "Visit a gallery place" })).toBeTruthy();
      expect(o.h.history.stack.at(-1), code).toBe("/create");
      expect(o.h.router.getSnapshot().flow.pickedImageId).toBeUndefined();
      cleanup();
    }
  });

  it("drops the suggested date when the visitor draws instead", async () => {
    const memory = createPlayMemory();
    const o = await open({ sizes, memory });
    await choose(jpeg("attic.jpg"));
    await screen.findByText(/Taken on 1987-06-21/);
    expect(memory.get().suggestedDay).toBeDefined();
    bigStroke();
    await act(async () => { fireEvent.click(makeButton()); });
    await screen.findByRole("heading", { name: "Pick the one that feels right" });
    expect(memory.get().suggestedDay).toBeUndefined();
    void o;
  });

  it("keeps the date for the sky when the photo is used", async () => {
    const memory = createPlayMemory();
    await open({ sizes, memory });
    await choose(jpeg("attic.jpg"));
    await screen.findByText(/Taken on 1987-06-21/);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use this photo" })); });
    await screen.findByRole("heading", { name: "Enter this place?" });
    expect(memory.get().suggestedDay).toEqual({ date: "1987-06-21", timeOfDay: "dawn" });
  });

  it("works with the keyboard alone: the file input and the Use button are real controls in tab order", async () => {
    await open({ sizes });
    await choose(jpeg("attic.jpg"));
    await screen.findByAltText("The photo you chose");
    const input = screen.getByLabelText("Choose a photo");
    const use = screen.getByRole("button", { name: "Use this photo" });
    expect(input.tabIndex).toBe(0);
    expect(use.tabIndex).toBe(0);
    expect(input.compareDocumentPosition(use) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("Create: the page title and focus", () => {
  it("is titled Make a place and moves focus to its heading when it is reached from another Screen", async () => {
    const o = await open();
    act(() => o.h.router.navigate({ screen: "gallery" }));
    await screen.findByRole("heading", { name: "Visit a place" });
    act(() => o.h.router.navigate({ screen: "create" }));
    await screen.findByRole("heading", { name: "Make a place" });
    await waitFor(() => expect(document.activeElement?.tagName).toBe("H1"));
    expect(document.title).toBe("Make a place · Hauntology");
  });
});

describe("Create: answers that come late, and controls that wait", () => {
  const sizes = { "attic.jpg": { width: 4000, height: 3000 }, "small.jpg": { width: 400, height: 900 } };
  const jpegAt = (name: string, original: string) => new File([jpegWithExif({ original })], name, { type: "image/jpeg" });
  const pick = async (file: File) => {
    await act(async () => { fireEvent.change(screen.getByLabelText("Choose a photo"), { target: { files: [file] } }); });
  };
  const deferred = () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    return { gate, release };
  };

  it("ignores the size answer of an older file: its problem is not shown over the newer file", async () => {
    const o = await open({ sizes });
    const { gate, release } = deferred();
    (o.photo.kit.inspect as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => { await gate; return sizes["small.jpg"]; });
    await pick(jpegAt("small.jpg", "1990:01:01 12:00:00"));
    await pick(jpegAt("attic.jpg", "2001:02:03 12:00:00"));
    await screen.findByAltText("The photo you chose");
    await act(async () => { release(); });
    expect(document.querySelector("[data-photo-problem]")).toBeNull();
    expect(screen.getAllByAltText("The photo you chose")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Use this photo" })).toBeTruthy();
  });

  it("ignores the date of an older file when the newer one is already chosen", async () => {
    const memory = createPlayMemory();
    const o = await open({ sizes, memory });
    const { gate, release } = deferred();
    const realHead = (o.photo.kit.head as ReturnType<typeof vi.fn>).getMockImplementation()!;
    (o.photo.kit.head as ReturnType<typeof vi.fn>).mockImplementationOnce(async (file: Blob, n: number) => { await gate; return realHead(file, n); });
    await pick(jpegAt("attic.jpg", "1990:01:01 12:00:00"));
    await pick(jpegAt("attic.jpg", "2001:02:03 12:00:00"));
    await screen.findByText(/Taken on 2001-02-03/);
    // The older file's bytes are read with a FileReader, which answers on a later turn.
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 50)); });
    expect(memory.get().suggestedDay).toEqual({ date: "2001-02-03", timeOfDay: "day" });
    expect(screen.queryByText(/1990-01-01/)).toBeNull();
  });

  it("locks the pad, the tools and the file input while a request runs, and ignores strokes", async () => {
    const o = await open({ sizes });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const render = vi.spyOn(o.fake, "sketchRender").mockImplementation(async () => { await gate; return { ok: true, value: { candidates: [{ imageId: "c1", imageUrl: "/demo/c1.svg" }, { imageId: "c2", imageUrl: "/demo/c2.svg" }], quota: { world: 2, image: 6, llm: 1, tts: 1, stt: 1, live: 1 } } }; });
    bigStroke();
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Undo" })); });
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Redo" })); });
    await act(async () => { fireEvent.click(makeButton()); });
    expect(render).toHaveBeenCalledTimes(1);
    expect(makeButton().textContent).toBe("Making it real…");
    expect(isOff(makeButton())).toBe(true);
    for (const name of ["Undo", "Redo", "Clear"]) expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled, name).toBe(true);
    expect((screen.getByLabelText("Choose a photo") as HTMLInputElement).disabled).toBe(true);
    const before = o.surface.made[0]!.extends;
    stroke([[50, 50], [300, 300]]);
    expect(o.surface.made[0]!.extends).toBe(before);
    await act(async () => { release(); });
    await screen.findByRole("heading", { name: "Pick the one that feels right" });
  });

  it("locks the photo while it is being sent, and holds it for the advised wait after a rate limit", async () => {
    const base = createFakeApi({ latencyMs: 0 });
    const uploadPhoto = vi.fn(async (): Promise<ApiResult<never>> => ({ ok: false, code: "rate_limited", retryAfterSec: 20 }));
    const api: ShellApi = { ...base, uploadPhoto };
    const o = await open({ api, fakeApi: base, sizes });
    await pick(jpegAt("attic.jpg", "1990:01:01 12:00:00"));
    await screen.findByAltText("The photo you chose");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use this photo" })); });
    await screen.findByRole("heading", { name: errorCopy("rate_limited").title });
    expect(uploadPhoto).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Working…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Choose a photo") as HTMLInputElement).disabled).toBe(true);
    void o;
  });

  it("ignores a second pointer's moves while the first is drawing", async () => {
    const o = await open();
    act(() => { fireEvent.pointerDown(pad(), { pointerId: 1, pointerType: "touch", clientX: 10, clientY: 10, bubbles: true }); });
    act(() => { fireEvent.pointerMove(pad(), { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 100, bubbles: true }); });
    const before = o.surface.made[0]!.extends;
    act(() => { fireEvent.pointerMove(pad(), { pointerId: 2, pointerType: "touch", clientX: 300, clientY: 300, bubbles: true }); });
    expect(o.surface.made[0]!.extends).toBe(before);
    act(() => { fireEvent.pointerMove(pad(), { pointerId: 1, pointerType: "touch", clientX: 120, clientY: 120, bubbles: true }); });
    expect(o.surface.made[0]!.extends).toBe(before + 1);
  });

  it("captures the pointer while it draws, and lets it go at the end", async () => {
    await open();
    const set = vi.fn();
    const release = vi.fn();
    Object.assign(pad(), { setPointerCapture: set, releasePointerCapture: release });
    stroke([[10, 10], [60, 60]], { pointerId: 7 });
    expect(set).toHaveBeenCalledWith(7);
    expect(release).toHaveBeenCalledWith(7);
  });

  it("maps the pointer to the pad's own pixels when the pad is drawn smaller or larger on the page", async () => {
    const o = await open();
    pad().getBoundingClientRect = () => ({ left: 10, top: 20, width: 320, height: 240, right: 330, bottom: 260, x: 10, y: 20, toJSON: () => ({}) });
    fireEvent.click(screen.getByRole("button", { name: "Small size" }));
    // The page is shown at half size, so client (170, 70) is pad pixel (320, 100).
    stroke([[170, 70]]);
    const bitmap = o.surface.factory.mock.results[0]!.value.bitmap();
    const at = (x: number, y: number) => bitmap.data[(y * bitmap.width + x) * 4];
    expect(at(320, 100)).toBe(0);
    expect(at(160, 50)).toBe(255);
  });
});

describe("Create: while a candidate is being chosen", () => {
  it("locks every button of the candidates until the answer comes", async () => {
    const o = await open();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const original = o.fake.sketchSelect.bind(o.fake);
    const select = vi.spyOn(o.fake, "sketchSelect").mockImplementation(async (id: string) => { await gate; return original(id); });
    bigStroke();
    await act(async () => { fireEvent.click(makeButton()); });
    await screen.findByRole("heading", { name: "Pick the one that feels right" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use option 1" })); });
    for (const name of ["Use option 1", "Use option 2", "Back to the sketch", "Redraw"]) expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled, name).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Use option 2" }));
    expect(select).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
    await screen.findByRole("heading", { name: "Enter this place?" });
  });
});
