import { act, fireEvent, render, type RenderResult } from "@testing-library/react";
import type { ComponentType, ReactElement } from "react";
import type { Kind } from "@hauntology/shared/puzzles/types";
import { createFakeFeel, type FakeFeel } from "./feel/fakes";
import type { KindProps, Payload, ViewOf } from "./kinds/types";

/**
 * jsdom has no layout, no canvas and no pointer capture. This gives every box a size (an SVG its viewBox, a canvas its
 * width and height, anything else its style), so a pointer position in a test is the same number the screen uses.
 * Returns a function that puts everything back.
 */
export function stubGeometry(): () => void {
  const proto = Element.prototype as Element & { setPointerCapture?: (id: number) => void; releasePointerCapture?: (id: number) => void };
  const saved = { rect: proto.getBoundingClientRect, set: proto.setPointerCapture, release: proto.releasePointerCapture };
  proto.getBoundingClientRect = function rect(this: Element): DOMRect {
    const tag = this.tagName.toLowerCase();
    let width = 0;
    let height = 0;
    if (tag === "svg") {
      const vb = (this.getAttribute("viewBox") ?? "0 0 0 0").split(/\s+/).map(Number);
      width = vb[2] ?? 0;
      height = vb[3] ?? 0;
    } else if (tag === "canvas") {
      width = Number(this.getAttribute("width"));
      height = Number(this.getAttribute("height"));
    } else {
      const style = (this as HTMLElement).style;
      width = parseFloat(style?.width ?? "") || 0;
      height = parseFloat(style?.height ?? "") || 0;
    }
    return { left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
  proto.setPointerCapture = () => {};
  proto.releasePointerCapture = () => {};
  return () => { proto.getBoundingClientRect = saved.rect; proto.setPointerCapture = saved.set; proto.releasePointerCapture = saved.release; };
}

/** A canvas whose drawing calls do nothing, so a screen that paints one can run in jsdom. */
export function stubCanvas(): () => void {
  const proto = HTMLCanvasElement.prototype as unknown as { getContext: unknown };
  const saved = proto.getContext;
  const noop = (): void => {};
  proto.getContext = () => new Proxy({}, { get: (t: Record<string, unknown>, k: string) => (k === "createLinearGradient" || k === "createRadialGradient" ? () => ({ addColorStop: noop }) : k in t ? t[k] : noop), set: (t: Record<string, unknown>, k: string, v: unknown) => { t[k] = v; return true; } });
  return () => { proto.getContext = saved; };
}

/** A pointer event with coordinates (a MouseEvent with a pointer name: screens read only `clientX` and `clientY`). */
export function pointer(el: Element, type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel", x = 0, y = 0): void {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
}

/** Let `ms` of real time pass inside `act`, so a screen's frame loop runs. */
export async function wait(ms: number): Promise<void> {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

export type Mounted<K extends Kind> = RenderResult & Readonly<{
  feel: FakeFeel;
  submits: Array<Payload<K>>;
  announcements: string[];
  /** The clock the screen sees, in ms; set it before a submit that needs a time. */
  clock: { ms: number };
  /** Re-render with a new `resetKey`, as the host does after a wrong Attempt. */
  reset(key: number): void;
}>;

/** Mount a Kind screen with a fake feel layer and record what it submits and announces. */
export function mountKind<K extends Kind>(Screen: ComponentType<KindProps<K>>, view: ViewOf<K>, over: Partial<KindProps<K>> & { tilt?: "off" | "on" | "denied" | "unsupported" } = {}): Mounted<K> {
  const feel = (over.feel as FakeFeel | undefined) ?? createFakeFeel({ tilt: over.tilt ?? "off" });
  const submits: Array<Payload<K>> = [];
  const announcements: string[] = [];
  const clock = { ms: 0 };
  const props = (resetKey: number): KindProps<K> => ({
    view, feel, assist: false, reducedMotion: false, elapsed: () => clock.ms, resetKey,
    submit: (p) => { submits.push(p); }, announce: (t) => { announcements.push(t); }, ...over,
  } as KindProps<K>);
  const element = (key: number): ReactElement => <Screen {...props(key)} />;
  const utils = render(element(0));
  return { ...utils, feel, submits, announcements, clock, reset: (key) => utils.rerender(element(key)) } as Mounted<K>;
}
