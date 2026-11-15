// @vitest-environment jsdom
import type { ShellApi } from "@hauntology/shared/app/api";
import { errorCopy } from "@hauntology/shared/app/errors-copy";
import { STAGE_COPY } from "@hauntology/shared/app/haunt-copy";
import { SHARE_COPIED, SHARE_COPY_BY_HAND, SHARE_OFF_ANNOUNCE, SHARE_OFF_LINE, SHARE_ON_ANNOUNCE, SHARE_ON_LINE } from "@hauntology/shared/app/share-copy";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../../test/harness";
import { manualClock } from "../../test/clock";
import { live, press, testPlatform } from "../../test/play";
import { createFakeApi, type FakeApi } from "../FakeApi";

afterEach(() => cleanup());

type Own = { fake: FakeApi; id: string };

/** A place the visitor made, through the fake API, ready at once. */
async function ownWorld(stageMs = { queued: 0, generating: 0, ingesting: 0 }): Promise<Own> {
  const fake = createFakeApi({ latencyMs: 0, stageMs });
  const up = await fake.uploadPhoto(new Blob([new Uint8Array(100)], { type: "image/jpeg" }));
  if (!up.ok) throw new Error(up.code);
  const q = await fake.quote(up.value.imageId);
  if (!q.ok) throw new Error(q.code);
  const made = await fake.createWorld({ imageId: up.value.imageId, confirmToken: q.value.confirmToken });
  if (!made.ok) throw new Error(made.code);
  return { fake, id: made.value.worldId };
}

const heading = () => screen.queryByRole("heading", { name: "Share this place" });
const turnOnButton = () => screen.getByRole("button", { name: "Share this place" });
const linkField = () => screen.getByLabelText("Your link") as HTMLInputElement;

async function openReady(options: { shareFirst?: boolean; platform?: Parameters<typeof testPlatform>[0] } = {}) {
  const w = await ownWorld();
  if (options.shareFirst) await w.fake.shareWorld(w.id, true);
  const shareWorld = vi.fn(w.fake.shareWorld);
  const api = { ...w.fake, shareWorld } as ShellApi;
  const p = testPlatform(options.platform ?? {});
  const h = renderApp(`/haunt/${w.id}`, { api, platform: p.kit });
  await screen.findByRole("heading", { name: "Ready" });
  return { ...w, api, p, h, shareWorld, link: `https://hauntology.test/shared/${w.id}` };
}

describe("Share this place: the card", () => {
  it("is off at first on the visitor's own ready place, says so in plain words, and offers to turn it on", async () => {
    await openReady();
    await screen.findByRole("heading", { name: "Share this place" });
    expect(screen.getByText(SHARE_OFF_LINE)).toBeTruthy();
    expect(turnOnButton()).toBeTruthy();
    expect(screen.queryByLabelText("Your link")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
  });

  it("turning it on calls the API once, shows the link (this address and the place's id, nothing else), and says who can open it", async () => {
    const { id, link, shareWorld } = await openReady();
    await screen.findByRole("heading", { name: "Share this place" });
    await act(async () => { fireEvent.click(turnOnButton()); });
    await screen.findByLabelText("Your link");
    expect(shareWorld).toHaveBeenCalledTimes(1);
    expect(shareWorld).toHaveBeenCalledWith(id, true);
    expect(linkField().value).toBe(link);
    expect(linkField().readOnly).toBe(true);
    const u = new URL(linkField().value);
    expect([u.origin, u.pathname, u.search, u.hash, u.username]).toEqual(["https://hauntology.test", `/shared/${id}`, "", "", ""]);
    expect(screen.getByText(SHARE_ON_LINE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stop sharing" })).toBeTruthy();
    expect(live()).toBe(SHARE_ON_ANNOUNCE);
  });

  it("gives the link field focus with its text selected after the visitor turns it on, so it can be copied at once", async () => {
    await openReady();
    await screen.findByRole("heading", { name: "Share this place" });
    await act(async () => { fireEvent.click(turnOnButton()); });
    const field = await screen.findByLabelText("Your link") as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(field.value.length);
  });

  it("copies the link on Copy link and says so, politely", async () => {
    const { p, link } = await openReady({ shareFirst: true });
    await screen.findByLabelText("Your link");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy link" })); });
    expect(p.copyText).toHaveBeenCalledTimes(1);
    expect(p.copyText).toHaveBeenCalledWith(link);
    expect(live()).toBe(SHARE_COPIED);
    expect(screen.queryByText(SHARE_COPY_BY_HAND)).toBeNull();
  });

  it("when the browser will not copy, selects the link and says to copy it by hand", async () => {
    await openReady({ shareFirst: true, platform: { copyText: vi.fn(async () => false) } });
    const field = await screen.findByLabelText("Your link") as HTMLInputElement;
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy link" })); });
    expect(screen.getByText(SHARE_COPY_BY_HAND)).toBeTruthy();
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(field.value.length);
    expect(live()).not.toBe(SHARE_COPIED);
  });

  it("Stop sharing turns the link off through the API and goes back to the offer", async () => {
    const { id, fake, shareWorld } = await openReady({ shareFirst: true });
    await screen.findByLabelText("Your link");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Stop sharing" })); });
    await screen.findByText(SHARE_OFF_LINE);
    expect(shareWorld).toHaveBeenCalledTimes(1);
    expect(shareWorld).toHaveBeenCalledWith(id, false);
    expect(screen.queryByLabelText("Your link")).toBeNull();
    expect(live()).toBe(SHARE_OFF_ANNOUNCE);
    const status = await fake.world(id);
    expect(status.ok && status.value.shared).toBe(false);
  });

  it("opens with sharing already on when the server says so, without taking focus or asking again", async () => {
    const { link, shareWorld } = await openReady({ shareFirst: true });
    const field = await screen.findByLabelText("Your link") as HTMLInputElement;
    expect(field.value).toBe(link);
    expect(document.activeElement).not.toBe(field);
    expect(screen.getByText(SHARE_ON_LINE)).toBeTruthy();
    expect(shareWorld).not.toHaveBeenCalled();
  });

  it("disables the button while the call is out, and asks only once for a double tap", async () => {
    const w = await ownWorld();
    let finish: () => void = () => {};
    const shareWorld = vi.fn(() => new Promise<{ ok: true; value: { shared: boolean } }>((resolve) => { finish = () => resolve({ ok: true, value: { shared: true } }); }));
    const p = testPlatform();
    renderApp(`/haunt/${w.id}`, { api: { ...w.fake, shareWorld } as unknown as ShellApi, platform: p.kit });
    await screen.findByRole("heading", { name: "Ready" });
    await screen.findByRole("heading", { name: "Share this place" });
    await act(async () => { fireEvent.click(turnOnButton()); });
    const busy = screen.getByRole("button", { name: "Turning on…" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    fireEvent.click(busy);
    expect(shareWorld).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    await screen.findByLabelText("Your link");
  });
});

describe("Share this place: what it waits for", () => {
  it("shows nothing until the public list has told it the place is not the Gallery's", async () => {
    const w = await ownWorld();
    const api: ShellApi = { ...w.fake, gallery: () => new Promise(() => {}) };
    renderApp(`/haunt/${w.id}`, { api, platform: testPlatform().kit });
    await screen.findByRole("heading", { name: "Ready" });
    await new Promise((r) => setTimeout(r, 40));
    expect(heading()).toBeNull();
    expect(screen.queryByRole("button", { name: "Share this place" })).toBeNull();
  });

  it("shows nothing until the server has said whether the link is on, so it never offers what is already on", async () => {
    const w = await ownWorld();
    let release: () => void = () => {};
    let afterReady = 0;
    const api: ShellApi = {
      ...w.fake,
      // The boot's look at the last place and the Stage poll get their answers at once; the Share card's own question (the third) waits.
      world: async (id) => {
        const early = afterReady++ < 2;
        const answer = await w.fake.world(id);
        if (early) return answer;
        await new Promise<void>((resolve) => { release = resolve; });
        return answer;
      },
    };
    await w.fake.shareWorld(w.id, true);
    renderApp(`/haunt/${w.id}`, { api, platform: testPlatform().kit });
    await screen.findByRole("heading", { name: "Ready" });
    await new Promise((r) => setTimeout(r, 40));
    expect(heading()).toBeNull();
    expect(screen.queryByRole("button", { name: "Share this place" })).toBeNull();
    await act(async () => { release(); });
    await screen.findByLabelText("Your link");
    expect(screen.queryByRole("button", { name: "Share this place" })).toBeNull();
  });

  it("clears the last note when the next try is made, and shows a new one only if that fails too", async () => {
    const w = await ownWorld();
    const answers: Array<{ ok: false; code: "network_error" } | { ok: true; value: { shared: boolean } }> = [{ ok: false, code: "network_error" }, { ok: true, value: { shared: true } }];
    const shareWorld = vi.fn(async () => answers.shift() as never);
    renderApp(`/haunt/${w.id}`, { api: { ...w.fake, shareWorld } as unknown as ShellApi, platform: testPlatform().kit });
    await screen.findByRole("heading", { name: "Ready" });
    await screen.findByRole("heading", { name: "Share this place" });
    await act(async () => { fireEvent.click(turnOnButton()); });
    const c = errorCopy("network_error");
    await screen.findByText(`${c.title}. ${c.body}`);
    await act(async () => { fireEvent.click(turnOnButton()); });
    await screen.findByLabelText("Your link");
    expect(screen.queryByText(`${c.title}. ${c.body}`)).toBeNull();
  });

  it("disables Stop sharing while the call is out, and asks only once for a double tap", async () => {
    const w = await ownWorld();
    await w.fake.shareWorld(w.id, true);
    let finish: () => void = () => {};
    const shareWorld = vi.fn(() => new Promise<{ ok: true; value: { shared: boolean } }>((resolve) => { finish = () => resolve({ ok: true, value: { shared: false } }); }));
    renderApp(`/haunt/${w.id}`, { api: { ...w.fake, shareWorld } as unknown as ShellApi, platform: testPlatform().kit });
    await screen.findByRole("heading", { name: "Ready" });
    await screen.findByLabelText("Your link");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Stop sharing" })); });
    const busy = screen.getByRole("button", { name: "Stopping…" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    fireEvent.click(busy);
    expect(shareWorld).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    await screen.findByText(SHARE_OFF_LINE);
  });
});

describe("Share this place: where it is not shown", () => {
  it("not for a Gallery place", async () => {
    const p = testPlatform();
    renderApp("/gallery", { platform: p.kit });
    await screen.findByText("The attic room");
    await press("Visit The attic room");
    await screen.findByRole("heading", { name: "Your place" });
    await screen.findByRole("heading", { name: "Ready" });
    await new Promise((r) => setTimeout(r, 30));
    expect(heading()).toBeNull();
    expect(screen.queryByRole("button", { name: "Share this place" })).toBeNull();
  });

  it("not while the place is still being made, and it appears when the place is ready", async () => {
    const w = await ownWorld();
    const c = manualClock(Date.UTC(2026, 10, 15, 12, 0, 0));
    let ready = false;
    const api: ShellApi = { ...w.fake, world: async (id) => (ready ? w.fake.world(id) : { ok: true, value: { id, status: "generating" } }) };
    const p = testPlatform();
    renderApp(`/haunt/${w.id}`, { api, platform: { ...p.kit, scheduler: c.scheduler, now: () => new Date(c.now()) } });
    await screen.findByRole("heading", { name: STAGE_COPY.dreaming.label });
    await new Promise((r) => setTimeout(r, 40));
    expect(heading()).toBeNull();
    expect(screen.queryByRole("button", { name: "Share this place" })).toBeNull();
    ready = true;
    await act(async () => { await c.advance(12_000); });
    await screen.findByRole("heading", { name: "Ready" });
    await screen.findByRole("heading", { name: "Share this place" });
  });

  it("not for a place the visitor walked into from someone's link, and no Delete my place either", async () => {
    const w = await ownWorld();
    const p = testPlatform();
    const h = renderApp(`/haunt/${w.id}`, { api: w.fake, platform: p.kit });
    await screen.findByRole("heading", { name: "Ready" });
    await screen.findByRole("heading", { name: "Share this place" });
    await screen.findByRole("button", { name: "Delete my place" });
    act(() => h.router.setFlow({ sharedWorldId: w.id }));
    await waitFor(() => expect(heading()).toBeNull());
    expect(screen.queryByRole("button", { name: "Delete my place" })).toBeNull();
  });
});

describe("Share this place: when a call fails", () => {
  it("says why and leaves the card as it was", async () => {
    const w = await ownWorld();
    const shareWorld = vi.fn(async () => ({ ok: false as const, code: "network_error" as const }));
    const p = testPlatform();
    renderApp(`/haunt/${w.id}`, { api: { ...w.fake, shareWorld } as unknown as ShellApi, platform: p.kit });
    await screen.findByRole("heading", { name: "Ready" });
    await screen.findByRole("heading", { name: "Share this place" });
    await act(async () => { fireEvent.click(turnOnButton()); });
    const c = errorCopy("network_error");
    await screen.findByText(`${c.title}. ${c.body}`);
    expect(screen.getByText(SHARE_OFF_LINE)).toBeTruthy();
    expect(screen.queryByLabelText("Your link")).toBeNull();
    expect((turnOnButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("a place that is gone is the Expired Screen, and the visitor's memory of it is cleared", async () => {
    const w = await ownWorld();
    const shareWorld = vi.fn(async () => ({ ok: false as const, code: "world_not_found" as const }));
    const p = testPlatform();
    const h = renderApp(`/haunt/${w.id}`, { api: { ...w.fake, shareWorld } as unknown as ShellApi, platform: p.kit });
    await screen.findByRole("heading", { name: "Ready" });
    await screen.findByRole("heading", { name: "Share this place" });
    await act(async () => { fireEvent.click(turnOnButton()); });
    await screen.findByRole("heading", { name: "That place is gone" });
    expect(h.router.getSnapshot().flow.worldId).toBeUndefined();
  });
});
