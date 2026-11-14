import { pathFor } from "@hauntology/shared/app/routes";
import type { Route } from "@hauntology/shared/app/types";
import { describe, expect, it, vi } from "vitest";
import { freshFlow } from "./boot";
import { createRouter, type HistoryLike } from "./router";

/** A browser history in memory: a stack of paths, a position, and Back and Forward. */
function fakeHistory(start: string) {
  const stack = [start];
  let at = 0;
  const listeners = new Set<() => void>();
  const writes: string[] = [];
  const h: HistoryLike & { back(): void; forward(): void; stack: string[]; writes: string[]; at(): number } = {
    path: () => stack[at]!,
    push(p) { stack.splice(at + 1); stack.push(p); at++; writes.push(`push ${p}`); },
    replace(p) { stack[at] = p; writes.push(`replace ${p}`); },
    listen(cb) { listeners.add(cb); return () => void listeners.delete(cb); },
    back() { if (at > 0) { at--; for (const l of [...listeners]) l(); } },
    forward() { if (at < stack.length - 1) { at++; for (const l of [...listeners]) l(); } },
    stack, writes, at: () => at,
  };
  return h;
}

const W = "w-1";
const start = (r: ReturnType<typeof createRouter>, route: Route, flow = freshFlow(null)) => r.start({ route, flow });

describe("router start", () => {
  it("is not ready until started, and shows the route the address names", () => {
    const r = createRouter(fakeHistory("/gallery"));
    expect(r.getSnapshot()).toMatchObject({ ready: false, route: { screen: "gallery" } });
    expect(createRouter(fakeHistory("/nonsense")).getSnapshot().route).toEqual({ screen: "not_found" });
  });

  it("keeps the address when the plan keeps the route, and rewrites it when the plan moves the visitor", () => {
    const h = fakeHistory("/gallery");
    const r = createRouter(h);
    start(r, { screen: "gallery" });
    expect(h.writes).toEqual([]);
    expect(r.getSnapshot().ready).toBe(true);

    const h2 = fakeHistory("/");
    const r2 = createRouter(h2);
    start(r2, { screen: "play", worldId: W }, { ...freshFlow(null), worldId: W, ghostReady: true });
    expect(h2.writes).toEqual([`replace /play/${W}`]);
    expect(h2.stack).toEqual([`/play/${W}`]);
  });

  it("leaves an unknown address as typed, so a reload shows the same not-found Screen", () => {
    const h = fakeHistory("/nonsense");
    const r = createRouter(h);
    start(r, { screen: "not_found" });
    expect(h.writes).toEqual([]);
    expect(h.path()).toBe("/nonsense");
  });
});

describe("navigate", () => {
  it("pushes the new path, once, and does not push the page it is on", () => {
    const h = fakeHistory("/");
    const r = createRouter(h);
    start(r, { screen: "home" });
    r.navigate({ screen: "gallery" });
    r.navigate({ screen: "gallery" });
    expect(h.writes).toEqual(["push /gallery"]);
    expect(r.getSnapshot().route).toEqual({ screen: "gallery" });
  });

  it("can replace instead of push", () => {
    const h = fakeHistory("/");
    const r = createRouter(h);
    start(r, { screen: "home" });
    r.navigate({ screen: "create" }, { replace: true });
    expect(h.stack).toEqual(["/create"]);
  });

  it("goes to the guard's redirect instead of a refused route, and the refused path never appears", () => {
    const h = fakeHistory("/");
    const r = createRouter(h);
    start(r, { screen: "home" });
    r.navigate({ screen: "confirm" });
    expect(r.getSnapshot().route).toEqual({ screen: "create" });
    expect(h.stack).toEqual(["/", "/create"]);

    r.setFlow({ pickedImageId: "img-1" });
    r.navigate({ screen: "confirm" });
    expect(h.stack).toEqual(["/", "/create", "/confirm"]);
    expect(r.getSnapshot().route).toEqual({ screen: "confirm" });
  });

  it("tells subscribers when the route changes, and not otherwise", () => {
    const r = createRouter(fakeHistory("/"));
    start(r, { screen: "home" });
    const listener = vi.fn();
    const stop = r.subscribe(listener);
    r.navigate({ screen: "home" });
    expect(listener).not.toHaveBeenCalled();
    r.navigate({ screen: "gallery" });
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    r.navigate({ screen: "create" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("flow changes", () => {
  it("moves off a route whose guard now refuses it", () => {
    const h = fakeHistory(`/haunt/${W}`);
    const r = createRouter(h);
    start(r, { screen: "haunt", worldId: W }, { ...freshFlow(null), worldId: W });
    r.setFlow({ ghostReady: true });
    expect(r.getSnapshot().route).toEqual({ screen: "haunt", worldId: W });
    r.setFlow({ worldId: undefined as never });
    expect(r.getSnapshot().route).toEqual({ screen: "gallery" });
    expect(h.stack).toEqual(["/gallery"]);
  });

  it("merges into the flow and keeps the rest", () => {
    const r = createRouter(fakeHistory("/"));
    start(r, { screen: "home" }, { ...freshFlow(null), noticeAcked: true });
    r.setFlow({ pickedImageId: "img-9" });
    expect(r.getSnapshot().flow).toEqual({ ghostReady: false, noticeAcked: true, playEnded: false, pickedImageId: "img-9" });
  });
});

describe("Back and Forward", () => {
  it("follow the history and land on the Screen of the address", () => {
    const h = fakeHistory("/");
    const r = createRouter(h);
    start(r, { screen: "home" });
    r.navigate({ screen: "gallery" });
    r.navigate({ screen: "create" });
    h.back();
    expect(r.getSnapshot().route).toEqual({ screen: "gallery" });
    h.back();
    expect(r.getSnapshot().route).toEqual({ screen: "home" });
    h.forward();
    h.forward();
    expect(r.getSnapshot().route).toEqual({ screen: "create" });
  });

  it("never lands on a refused route: Back to /confirm after the image is gone shows Create", () => {
    const h = fakeHistory("/");
    const r = createRouter(h);
    start(r, { screen: "home" });
    r.navigate({ screen: "create" });
    r.setFlow({ pickedImageId: "img-1" });
    r.navigate({ screen: "confirm" });
    r.navigate({ screen: "gallery" });
    r.setFlow({ pickedImageId: undefined as never });
    h.back();
    expect(r.getSnapshot().route).toEqual({ screen: "create" });
    expect(h.path()).toBe("/create");
  });

  it("shows a not-found Screen for an address that is not a route, and never a blank", () => {
    const h = fakeHistory("/");
    const r = createRouter(h);
    start(r, { screen: "home" });
    h.stack.push("/%00/..//x");
    h.forward();
    expect(r.getSnapshot().route).toEqual({ screen: "not_found" });
  });

  it("before the boot data is in, only follows the address", () => {
    const h = fakeHistory("/gallery");
    const r = createRouter(h);
    h.stack.push(`/play/${W}`);
    h.forward();
    expect(r.getSnapshot()).toMatchObject({ ready: false, route: { screen: "play", worldId: W } });
    expect(h.writes).toEqual([]);
  });

  it("stops listening after dispose", () => {
    const h = fakeHistory("/");
    const r = createRouter(h);
    start(r, { screen: "home" });
    r.navigate({ screen: "gallery" });
    r.dispose();
    h.back();
    expect(r.getSnapshot().route).toEqual({ screen: "gallery" });
  });
});

describe("two worlds on the same Screen", () => {
  it("are different routes: navigating, Back and the start plan tell them apart", () => {
    const h = fakeHistory("/");
    const r = createRouter(h);
    start(r, { screen: "home" }, { ...freshFlow(null), worldId: "w-a" });
    r.navigate({ screen: "haunt", worldId: "w-a" });
    r.setFlow({ worldId: "w-b" });
    r.navigate({ screen: "haunt", worldId: "w-b" });
    expect(r.getSnapshot().route).toEqual({ screen: "haunt", worldId: "w-b" });
    // Changing the known world moved the visitor off w-a at once (the Gallery), then w-b was pushed.
    expect(h.stack).toEqual(["/", "/gallery", "/haunt/w-b"]);
    h.back();
    expect(r.getSnapshot().route).toEqual({ screen: "gallery" });

    const h2 = fakeHistory("/haunt/w-a");
    const r2 = createRouter(h2);
    start(r2, { screen: "haunt", worldId: "w-b" }, { ...freshFlow(null), worldId: "w-b" });
    expect(h2.stack).toEqual(["/haunt/w-b"]);
  });
});

describe("paths", () => {
  it("every route a visitor can reach has a path that resolves back to it", () => {
    const routes: Route[] = [{ screen: "home" }, { screen: "gallery" }, { screen: "create" }, { screen: "confirm" }, { screen: "expired" }, { screen: "haunt", worldId: W }];
    for (const route of routes) expect(createRouter(fakeHistory(pathFor(route))).getSnapshot().route).toEqual(route);
  });
});
