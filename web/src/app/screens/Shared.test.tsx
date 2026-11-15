// @vitest-environment jsdom
import type { ApiResult, ShellApi, WorldStatus } from "@hauntology/shared/app/api";
import { errorCopy } from "@hauntology/shared/app/errors-copy";
import { SHARED_LINE, SHARED_OWN_OFF_LINE, SHARED_OWN_ON_LINE } from "@hauntology/shared/app/share-copy";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../../test/harness";
import { live, testPlatform } from "../../test/play";
import { createFakeApi, type FakeApi } from "../FakeApi";

afterEach(() => cleanup());

const FRIEND = "w-friendfriendfriendfr";
const readyStatus = (over: Partial<WorldStatus> = {}): ApiResult<WorldStatus> => ({ ok: true, value: { id: FRIEND, status: "ready", title: "A friend's kitchen", thumbUrl: "/demo/worlds/friend.svg", ...over } });

/** The API as a visitor who does not own the place sees it: a ready status with no `shared` in it (only the owner is told that). */
const asStranger = (world: () => Promise<ApiResult<WorldStatus>>): { api: ShellApi; fake: FakeApi } => {
  const fake = createFakeApi({ latencyMs: 0 });
  return { fake, api: { ...fake, world } as ShellApi };
};

async function ownWorld(): Promise<{ fake: FakeApi; id: string }> {
  const fake = createFakeApi({ latencyMs: 0, stageMs: { queued: 0, generating: 0, ingesting: 0 } });
  const up = await fake.uploadPhoto(new Blob([new Uint8Array(100)], { type: "image/jpeg" }));
  if (!up.ok) throw new Error(up.code);
  const q = await fake.quote(up.value.imageId);
  if (!q.ok) throw new Error(q.code);
  const made = await fake.createWorld({ imageId: up.value.imageId, confirmToken: q.value.confirmToken });
  if (!made.ok) throw new Error(made.code);
  return { fake, id: made.value.worldId };
}

const walkIn = () => screen.getByRole("button", { name: "Walk in" });

describe("Shared: a place somebody shared", () => {
  it("opens at its link: the title, the thumbnail, a plain line and one main action, and asks the API once", async () => {
    const world = vi.fn(async () => readyStatus());
    const { api } = asStranger(world);
    const h = renderApp(`/shared/${FRIEND}`, { api });
    await screen.findByRole("heading", { name: "A shared place" });
    await screen.findByRole("heading", { name: "A friend's kitchen" });
    expect((screen.getByRole("img", { name: "A friend's kitchen" }) as HTMLImageElement).getAttribute("src")).toBe("/demo/worlds/friend.svg");
    expect(screen.getByText(SHARED_LINE)).toBeTruthy();
    // A visitor is never told the place is theirs, or that its link is on or off.
    expect(screen.queryByText(SHARED_OWN_ON_LINE)).toBeNull();
    expect(screen.queryByText(SHARED_OWN_OFF_LINE)).toBeNull();
    expect(walkIn().className).toContain("ui-button--primary");
    expect(world).toHaveBeenCalledTimes(1);
    expect(world).toHaveBeenCalledWith(FRIEND);
    expect(h.router.getSnapshot().route).toEqual({ screen: "shared", worldId: FRIEND });
    expect(h.history.stack).toEqual([`/shared/${FRIEND}`]);
  });

  it("shows a waiting line while it asks, then the place", async () => {
    let finish: (r: ApiResult<WorldStatus>) => void = () => {};
    const { api } = asStranger(() => new Promise((resolve) => { finish = resolve; }));
    renderApp(`/shared/${FRIEND}`, { api });
    await screen.findByText("Opening the place…");
    expect(document.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Walk in" })).toBeNull();
    await act(async () => { finish(readyStatus()); });
    await screen.findByRole("heading", { name: "A friend's kitchen" });
    expect(document.querySelector("[aria-busy='true']")).toBeNull();
  });

  it("moves focus to its heading when the visitor arrives from another Screen", async () => {
    const { api } = asStranger(async () => readyStatus());
    const h = renderApp("/gallery", { api });
    await screen.findByText("The attic room");
    act(() => h.router.navigate({ screen: "shared", worldId: FRIEND }));
    await screen.findByRole("heading", { name: "A friend's kitchen" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 })));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("A shared place");
    expect(live()).toBe("A shared place");
  });

  it("Walk in records the place as opened by a link, not the visitor's own, and goes to Haunt to choose a ghost", async () => {
    const { api } = asStranger(async () => readyStatus());
    const h = renderApp(`/shared/${FRIEND}`, { api });
    await screen.findByRole("heading", { name: "A friend's kitchen" });
    fireEvent.click(walkIn());
    await screen.findByRole("heading", { name: "Your place" });
    expect(h.history.stack).toEqual([`/shared/${FRIEND}`, `/haunt/${FRIEND}`]);
    expect(h.router.getSnapshot().flow).toMatchObject({ worldId: FRIEND, sharedWorldId: FRIEND, ghostReady: false, playEnded: false });
  });

  it("on Haunt a place opened by a link has no Share and no Delete, and still offers the ghost and the way in", async () => {
    const { api } = asStranger(async () => readyStatus());
    renderApp(`/shared/${FRIEND}`, { api, platform: testPlatform().kit });
    await screen.findByRole("heading", { name: "A friend's kitchen" });
    fireEvent.click(walkIn());
    await screen.findByRole("heading", { name: "Ready" });
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("heading", { name: "Share this place" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Share this place" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete my place" })).toBeNull();
    expect(screen.getByRole("button", { name: "Wander" })).toBeTruthy();
  });

  it("the owner opening their own link has the place recorded as theirs, with Share and Delete on Haunt", async () => {
    const w = await ownWorld();
    await w.fake.shareWorld(w.id, true);
    const h = renderApp(`/shared/${w.id}`, { api: w.fake, platform: testPlatform().kit });
    await screen.findByText(SHARED_OWN_ON_LINE);
    expect(screen.queryByText(SHARED_LINE)).toBeNull();
    fireEvent.click(walkIn());
    await screen.findByRole("heading", { name: "Ready" });
    expect(h.router.getSnapshot().flow.sharedWorldId).toBeUndefined();
    expect(h.router.getSnapshot().flow.worldId).toBe(w.id);
    await screen.findByRole("heading", { name: "Share this place" });
    await screen.findByRole("button", { name: "Delete my place" });
  });

  it("the owner opening their own link while it is off is told it is theirs and that only they can open it, and it is recorded as theirs", async () => {
    const w = await ownWorld();
    const h = renderApp(`/shared/${w.id}`, { api: w.fake, platform: testPlatform().kit });
    await screen.findByText(SHARED_OWN_OFF_LINE);
    expect(screen.queryByText(SHARED_LINE)).toBeNull();
    expect(screen.queryByText(SHARED_OWN_ON_LINE)).toBeNull();
    fireEvent.click(walkIn());
    await screen.findByRole("heading", { name: "Ready" });
    expect(h.router.getSnapshot().flow.sharedWorldId).toBeUndefined();
    await screen.findByRole("button", { name: "Share this place" });
    await screen.findByRole("button", { name: "Delete my place" });
  });

  it("the owner's words follow the link: on says anyone who has it can open the page, off says only the owner can", async () => {
    const w = await ownWorld();
    for (const [on, words] of [[true, SHARED_OWN_ON_LINE], [false, SHARED_OWN_OFF_LINE]] as const) {
      cleanup();
      await w.fake.shareWorld(w.id, on);
      renderApp(`/shared/${w.id}`, { api: w.fake, platform: testPlatform().kit });
      await screen.findByText(words);
    }
  });

  it("is the Expired Screen when the place is not there for this visitor: deleted, out of time, not shared any more or never made are one answer", async () => {
    const world = vi.fn(async (): Promise<ApiResult<WorldStatus>> => ({ ok: false, code: "world_not_found" }));
    const { api } = asStranger(world);
    const h = renderApp(`/shared/${FRIEND}`, { api });
    await screen.findByRole("heading", { name: "That place is gone" });
    expect(h.history.stack).toEqual(["/expired"]);
    expect(screen.queryByRole("button", { name: "Walk in" })).toBeNull();
  });

  it("is the Expired Screen for an ended Session, and for a place that is not ready", async () => {
    for (const answer of [{ ok: false, code: "session_expired" } as const, readyStatus({ status: "generating" }), readyStatus({ status: "failed" }), readyStatus({ status: "queued" })]) {
      cleanup();
      const { api } = asStranger(async () => answer);
      renderApp(`/shared/${FRIEND}`, { api });
      await screen.findByRole("heading", { name: "That place is gone" });
    }
  });

  it("says why for any other failure and offers Retry, which asks again", async () => {
    const answers: ApiResult<WorldStatus>[] = [{ ok: false, code: "network_error" }, readyStatus()];
    const world = vi.fn(async () => answers.shift() as ApiResult<WorldStatus>);
    const { api } = asStranger(world);
    renderApp(`/shared/${FRIEND}`, { api });
    const c = errorCopy("network_error");
    await screen.findByRole("heading", { name: c.title });
    expect(screen.getByText(c.body)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Walk in" })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Try again" })); });
    await screen.findByRole("heading", { name: "A friend's kitchen" });
    expect(world).toHaveBeenCalledTimes(2);
  });

  it("shows the waiting line again while Retry asks, and not the failure", async () => {
    let finish: (r: ApiResult<WorldStatus>) => void = () => {};
    const answers: Array<ApiResult<WorldStatus> | Promise<ApiResult<WorldStatus>>> = [{ ok: false, code: "network_error" }, new Promise((resolve) => { finish = resolve; })];
    const { api } = asStranger(async () => (await answers.shift()) as ApiResult<WorldStatus>);
    renderApp(`/shared/${FRIEND}`, { api });
    const c = errorCopy("network_error");
    await screen.findByRole("heading", { name: c.title });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Try again" })); });
    await screen.findByText("Opening the place…");
    expect(screen.queryByRole("heading", { name: c.title })).toBeNull();
    await act(async () => { finish(readyStatus()); });
    await screen.findByRole("heading", { name: "A friend's kitchen" });
  });

  it("does not act on an answer that comes after the visitor has gone elsewhere", async () => {
    let finish: (r: ApiResult<WorldStatus>) => void = () => {};
    const { api } = asStranger(() => new Promise((resolve) => { finish = resolve; }));
    const h = renderApp(`/shared/${FRIEND}`, { api });
    await screen.findByText("Opening the place…");
    act(() => h.router.navigate({ screen: "gallery" }));
    await screen.findByRole("heading", { name: "Visit a place" });
    await act(async () => { finish({ ok: false, code: "world_not_found" }); });
    expect(h.router.getSnapshot().route.screen).toBe("gallery");
    expect(screen.queryByRole("heading", { name: "That place is gone" })).toBeNull();
  });

  it("calls the place 'A place' when it has no title, shows no picture when it has none, and never says who made it", async () => {
    const { api } = asStranger(async () => readyStatus({ title: undefined, thumbUrl: undefined }));
    renderApp(`/shared/${FRIEND}`, { api });
    await screen.findByRole("heading", { name: "A place" });
    expect(screen.queryByRole("img")).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/owner|made by|ownerSid/i);
  });

  it("asks for no play session, picture, quote or spend on the way in", async () => {
    const { api, fake } = asStranger(async () => readyStatus());
    const spies = (["playStart", "playGet", "createWorld", "quote", "uploadPhoto", "speak", "sketchRender", "deleteWorld", "shareWorld"] as const).map((m) => vi.spyOn(fake, m));
    renderApp(`/shared/${FRIEND}`, { api });
    await screen.findByRole("heading", { name: "A friend's kitchen" });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("a bad world id in the link is Nothing here, and asks nothing", async () => {
    const world = vi.fn(async () => readyStatus());
    const { api } = asStranger(world);
    renderApp("/shared/a b", { api });
    await screen.findByRole("heading", { name: "There is nothing here" });
    expect(world).not.toHaveBeenCalled();
  });
});
