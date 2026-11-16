import { describe, expect, it } from "vitest";
import { assetUrl, loadWorld, SPLAT_RETRY_DELAYS_MS, type LoadStage, type LoaderPorts } from "./loader";
import { orientationTransform } from "./orientation";
import type { DeviceCaps } from "./types";

const MANIFEST = {
  id: "test-world",
  title: "A test place",
  createdAt: 1,
  source: "upload",
  assets: {
    splat: [
      { path: "splat-100k.spz", bytes: 1000, lod: "100k" },
      { path: "splat-full.spz", bytes: 9000, lod: "full" },
    ],
    collider: { path: "collider.glb", bytes: 500 },
    pano: { path: "pano.jpg", bytes: 2000 },
    thumb: { path: "thumb.jpg", bytes: 100 },
  },
  orientation: { upFix: [1, 0, 0, 0], scale: 2 },
  spawn: { position: [0, 1.6, 0], yaw: 0.5 },
  floorY: 0,
  bounds: { min: [-5, 0, -5], max: [5, 3, 5] },
  brief: "A place made of test data.",
};

const STRONG: DeviceCaps = { mobile: false, memoryGb: 16, cores: 8, maxTexture: 16384, webgl2: true };
const WEAK: DeviceCaps = { mobile: true, memoryGb: 2, cores: 2, maxTexture: 2048, webgl2: true };

type Calls = { manifests: number; assets: string[]; sleeps: number[]; inits: number };

function fakePorts(over: Partial<{ manifest: unknown; failAssets: Record<string, number>; initOk: boolean }> = {}): { ports: LoaderPorts; calls: Calls } {
  const calls: Calls = { manifests: 0, assets: [], sleeps: [], inits: 0 };
  const failsLeft = { ...(over.failAssets ?? {}) };
  const ports: LoaderPorts = {
    fetchManifest: async () => {
      calls.manifests += 1;
      return over.manifest ?? MANIFEST;
    },
    fetchAsset: async (_id, path) => {
      calls.assets.push(path);
      if ((failsLeft[path] ?? 0) > 0) {
        failsLeft[path] = (failsLeft[path] as number) - 1;
        throw new Error("network");
      }
      return new ArrayBuffer(8);
    },
    initSplat: async () => {
      calls.inits += 1;
      return over.initOk ?? true;
    },
    sleep: async (ms) => {
      calls.sleeps.push(ms);
    },
  };
  return { ports, calls };
}

/** A manifest with some assets removed. */
const without = (...names: ("collider" | "pano" | "thumb")[]) => {
  const assets = { ...MANIFEST.assets } as Record<string, unknown>;
  for (const n of names) delete assets[n];
  return { ...MANIFEST, assets };
};

describe("WorldLoader (world-viewer 3.1, 3.2 over fakes)", () => {
  it("loads the splat rung: labelled stages, LOD by device, orientation and spawn applied", async () => {
    const { ports, calls } = fakePorts();
    const stages: LoadStage[] = [];
    const r = await loadWorld("test-world", STRONG, ports, (s) => stages.push(s));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.world.rung).toBe("splat");
    expect(r.world.lod?.path).toBe("splat-full.spz");
    expect(r.world.colliderBytes).not.toBeNull();
    expect(r.world.warnings).toEqual([]);
    expect(r.world.transform).toEqual(orientationTransform({ upFix: [1, 0, 0, 0], scale: 2 }));
    expect(r.world.spawn).toEqual({ pos: [0, 1.6, 0], yaw: 0.5 });
    expect(stages).toEqual(["manifest", "splat", "collider", "ready"]);
    expect(calls.assets).toEqual(["splat-full.spz", "collider.glb"]);

    const weak = await loadWorld("test-world", WEAK, fakePorts().ports);
    expect(weak.ok && weak.world.lod?.path).toBe("splat-100k.spz");
  });

  it("retries a failed splat download twice with backoff, then gives up (Requirement 1.3)", async () => {
    const flaky = fakePorts({ failAssets: { "splat-full.spz": 2 } });
    const r = await loadWorld("test-world", STRONG, flaky.ports);
    expect(r.ok).toBe(true);
    expect(flaky.calls.assets.filter((a) => a === "splat-full.spz")).toHaveLength(3);
    expect(flaky.calls.sleeps).toEqual([...SPLAT_RETRY_DELAYS_MS]);

    const dead = fakePorts({ failAssets: { "splat-full.spz": 99 } });
    expect(await loadWorld("test-world", STRONG, dead.ports)).toEqual({ ok: false, code: "splat_failed" });
    expect(dead.calls.assets.filter((a) => a === "splat-full.spz")).toHaveLength(3);
  });

  it("refuses a bad manifest before any asset is fetched", async () => {
    const bad = fakePorts({ manifest: { id: "x" } });
    expect(await loadWorld("test-world", STRONG, bad.ports)).toEqual({ ok: false, code: "manifest_invalid" });
    expect(bad.calls.assets).toEqual([]);
  });

  it("keeps the world open when the collider fails, with a warning", async () => {
    const { ports } = fakePorts({ failAssets: { "collider.glb": 99 } });
    const r = await loadWorld("test-world", STRONG, ports);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.world.rung).toBe("splat");
    expect(r.world.colliderBytes).toBeNull();
    expect(r.world.warnings).toEqual(["collider_failed"]);
  });

  it("falls back pano then thumbnail when WebGL2 or the splat start is unavailable (Requirement 1.2)", async () => {
    const noGl: DeviceCaps = { ...STRONG, webgl2: false };
    const pano = fakePorts();
    const r1 = await loadWorld("test-world", noGl, pano.ports);
    expect(r1.ok && r1.world.rung).toBe("pano");
    expect(pano.calls.assets).toEqual(["pano.jpg"]); // no splat was fetched

    const noInit = fakePorts({ initOk: false });
    const r2 = await loadWorld("test-world", STRONG, noInit.ports);
    expect(r2.ok && r2.world.rung).toBe("pano");

    const panoDead = fakePorts({ failAssets: { "pano.jpg": 99 } });
    const r3 = await loadWorld("test-world", noGl, panoDead.ports);
    expect(r3.ok && r3.world.rung).toBe("thumb");

    const nothing = fakePorts({ manifest: without("pano", "thumb") });
    expect(await loadWorld("test-world", noGl, nothing.ports)).toEqual({ ok: false, code: "webgl_unavailable" });

    const panoOnly = fakePorts({ manifest: without("thumb"), failAssets: { "pano.jpg": 99 } });
    expect(await loadWorld("test-world", noGl, panoOnly.ports)).toEqual({ ok: false, code: "pano_failed" });
  });

  it("addresses bundle files on our own origin only", () => {
    expect(assetUrl("test-world", "splat-full.spz")).toBe("/api/worlds/test-world/assets/splat-full.spz");
    expect(assetUrl("a b", "x.spz")).toBe("/api/worlds/a%20b/assets/x.spz");
  });
});
