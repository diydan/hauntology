import { WorldManifestSchema, type AssetRef, type WorldManifest } from "../world/manifest";
import { orientationTransform } from "./orientation";
import { chooseLod } from "./quality";
import type { DeviceCaps, Mat4, PlayerState } from "./types";

/**
 * Loading a world (world-viewer tasks 3.1 and 3.2, Requirements 1.1 to 1.4), as a
 * fold over injected ports so the whole ladder can be tested over fakes: no GPU, no
 * network, no real waiting. The scene code supplies the ports; `initSplat` is the
 * Spark seam that Spike 1 (task 1) confirms — false or a throw means "Spark could
 * not start here" and the panorama/thumbnail ladder takes over.
 */
export type LoadErrorCode = "webgl_unavailable" | "splat_failed" | "manifest_invalid" | "collider_failed" | "pano_failed";

export type LoadStage = "manifest" | "splat" | "collider" | "ready";
/** The words shown while a stage runs (Requirement 1.1: labelled loading progress). */
export const LOAD_STAGE_LABELS: Readonly<Record<LoadStage, string>> = {
  manifest: "Finding the place",
  splat: "Loading the room",
  collider: "Loading the floor",
  ready: "Ready",
};

export type LoaderPorts = {
  /** The world's `world.json`, unvalidated. */
  fetchManifest: (worldId: string) => Promise<unknown>;
  /** One asset of the bundle, by its manifest file name. */
  fetchAsset: (worldId: string, path: string) => Promise<ArrayBuffer>;
  /** The splat renderer's start. Resolving false, or throwing, means unavailable. */
  initSplat: (bytes: ArrayBuffer) => Promise<boolean>;
  /** Waiting between retries; a fake in tests. */
  sleep: (ms: number) => Promise<void>;
};

export type LoadedWorld = {
  manifest: WorldManifest;
  /** Where the degradation ladder stopped. The shell is told with a `degraded` message unless this is `splat`. */
  rung: "splat" | "pano" | "thumb";
  lod: AssetRef | null;
  splatBytes: ArrayBuffer | null;
  colliderBytes: ArrayBuffer | null;
  /** The panorama file on the `pano` rung, else null. */
  panoBytes: ArrayBuffer | null;
  transform: Mat4;
  spawn: PlayerState;
  /** Non-fatal troubles, for the log: the world still opens. */
  warnings: readonly LoadErrorCode[];
};

export type LoadResult = { ok: true; world: LoadedWorld } | { ok: false; code: LoadErrorCode };

/** The same-origin address of one bundle file (the manifest names files, never URLs). */
export function assetUrl(worldId: string, path: string): string {
  return `/api/worlds/${encodeURIComponent(worldId)}/assets/${encodeURIComponent(path)}`;
}

/** Backoff between the three splat attempts (Requirement 1.3: up to two retries). */
export const SPLAT_RETRY_DELAYS_MS: readonly number[] = [250, 750];

async function fetchSplatWithRetries(ports: LoaderPorts, worldId: string, path: string): Promise<ArrayBuffer | null> {
  for (let attempt = 0; attempt <= SPLAT_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await ports.fetchAsset(worldId, path);
    } catch {
      const delay = SPLAT_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) return null;
      await ports.sleep(delay);
    }
  }
  return null;
}

export async function loadWorld(
  worldId: string,
  caps: DeviceCaps,
  ports: LoaderPorts,
  onProgress?: (stage: LoadStage) => void,
): Promise<LoadResult> {
  const stage = (s: LoadStage) => onProgress?.(s);

  stage("manifest");
  let manifest: WorldManifest;
  try {
    const parsed = WorldManifestSchema.safeParse(await ports.fetchManifest(worldId));
    if (!parsed.success) return { ok: false, code: "manifest_invalid" };
    manifest = parsed.data;
  } catch {
    return { ok: false, code: "manifest_invalid" };
  }

  const transform = orientationTransform(manifest.orientation);
  const spawn: PlayerState = { pos: manifest.spawn.position, yaw: manifest.spawn.yaw };

  /** The panorama/thumbnail rungs (Requirement 1.2). The chat is the shell's and works at every rung. */
  const fallback = async (warnings: LoadErrorCode[]): Promise<LoadResult> => {
    if (manifest.assets.pano) {
      try {
        const panoBytes = await ports.fetchAsset(worldId, manifest.assets.pano.path);
        stage("ready");
        return { ok: true, world: { manifest, rung: "pano", lod: null, splatBytes: null, colliderBytes: null, panoBytes, transform, spawn, warnings } };
      } catch {
        if (!manifest.assets.thumb) return { ok: false, code: "pano_failed" };
      }
    }
    if (manifest.assets.thumb) {
      stage("ready");
      return { ok: true, world: { manifest, rung: "thumb", lod: null, splatBytes: null, colliderBytes: null, panoBytes: null, transform, spawn, warnings } };
    }
    return { ok: false, code: "webgl_unavailable" };
  };

  if (!caps.webgl2) return fallback([]);

  stage("splat");
  const lod = chooseLod(caps, manifest.assets.splat);
  const splatBytes = await fetchSplatWithRetries(ports, worldId, lod.path);
  if (splatBytes === null) return { ok: false, code: "splat_failed" };

  let splatReady = false;
  try {
    splatReady = await ports.initSplat(splatBytes);
  } catch {
    splatReady = false;
  }
  if (!splatReady) return fallback([]);

  const warnings: LoadErrorCode[] = [];
  let colliderBytes: ArrayBuffer | null = null;
  if (manifest.assets.collider) {
    stage("collider");
    try {
      colliderBytes = await ports.fetchAsset(worldId, manifest.assets.collider.path);
    } catch {
      // Not fatal: walking falls back to the disc around the spawn (Requirement 2.5).
      warnings.push("collider_failed");
    }
  }

  stage("ready");
  return { ok: true, world: { manifest, rung: "splat", lod, splatBytes, colliderBytes, panoBytes: null, transform, spawn, warnings } };
}
