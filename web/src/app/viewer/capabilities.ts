import type { DeviceCaps } from "@hauntology/shared/viewer/types";

/**
 * What this device can run (world-viewer 3.2, Requirement 1.2): read from the browser once, as plain numbers, so `loadWorld` can choose the rung. The
 * splat renderer needs WebGL2 and a texture size big enough for its data textures; a device without them takes the panorama or the thumbnail, with the chat
 * still mounted. Every source is a port, so the check runs in a test with no GPU.
 */
export type CapsSources = Readonly<{
  /** A WebGL2 context, or null. Called on a throwaway canvas the caller makes. */
  webgl2: () => Pick<WebGL2RenderingContext, "getParameter" | "MAX_TEXTURE_SIZE"> | null;
  coarsePointer: () => boolean;
  deviceMemory?: number | undefined;
  hardwareConcurrency?: number | undefined;
}>;

/** The smallest texture the splat renderer's packed data needs. Below this the device takes the panorama. */
export const SPARK_MIN_TEXTURE = 4096;

export function readDeviceCaps(src: CapsSources): DeviceCaps {
  let gl: ReturnType<CapsSources["webgl2"]> = null;
  try { gl = src.webgl2(); } catch { gl = null; }
  const maxTexture = gl === null ? 0 : Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;
  return {
    mobile: src.coarsePointer(),
    ...(typeof src.deviceMemory === "number" ? { memoryGb: src.deviceMemory } : {}),
    ...(typeof src.hardwareConcurrency === "number" ? { cores: src.hardwareConcurrency } : {}),
    maxTexture,
    // The splat renderer's capability check: WebGL2 and a texture it can use. `false` sends the loader straight to the panorama rung.
    webgl2: gl !== null && maxTexture >= SPARK_MIN_TEXTURE,
  };
}

/** The real browser's sources. */
export function browserCapsSources(doc: Document, nav: Navigator & { deviceMemory?: number }, match: (q: string) => { matches: boolean }): CapsSources {
  return {
    webgl2: () => doc.createElement("canvas").getContext("webgl2"),
    coarsePointer: () => match("(pointer: coarse)").matches,
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
  };
}
