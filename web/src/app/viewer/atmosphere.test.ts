import { rasterizeSky } from "@hauntology/shared/conditions/sky-texture";
import type { Atmosphere } from "@hauntology/shared/conditions/types";
import { atmosphereLook } from "@hauntology/shared/conditions/weather";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  AMBIENT_MAX_GAIN,
  REDUCED_PRECIP_SPEED_SCALE,
  ambientGain,
  ambientLoopPath,
  createAtmosphereController,
  splatTintForLook,
} from "./atmosphere";

const NIGHT_CLEAR: Atmosphere = {
  timeOfDay: "night",
  weather: "clear",
  tempBand: "cold",
  windBand: "calm",
  moon: "full moon",
  stars: [{ id: 0, az: 120, alt: 45, mag: 0.2 }],
  moonSky: { az: 200, alt: 35, lit: 1 },
};

const STORM_NIGHT: Atmosphere = {
  timeOfDay: "night",
  weather: "storm",
  tempBand: "cold",
  windBand: "windy",
  moon: "new moon",
  stars: [{ id: 0, az: 120, alt: 45, mag: 0.2 }],
};

const RAIN_DAY: Atmosphere = {
  timeOfDay: "day",
  weather: "rain",
  tempBand: "mild",
  windBand: "breezy",
  moon: "first quarter",
};

describe("viewer atmosphere controller (conditions 4.1, 4.2, 4.3, 4.4)", () => {
  it("applies atmosphereLook to grade uniforms and fog, is idempotent, and restores neutral on null", () => {
    const scene = new THREE.Scene();
    const gradeEl = { style: { backgroundColor: "" } } as unknown as HTMLElement;
    const ctrl = createAtmosphereController({ scene, gradeEl, floorY: 0, quality: 2, reducedMotion: false });

    expect(ctrl.setAtmosphere(STORM_NIGHT)).toBe(true);
    const stormLook = atmosphereLook("storm", "night");
    expect(ctrl.uniforms.uTint.value).toEqual(stormLook.tint);
    expect(ctrl.uniforms.uTintStrength.value).toBe(stormLook.tintStrength);
    expect(ctrl.uniforms.uHaze.value).toBe(stormLook.haze);
    expect(ctrl.uniforms.uBrightness.value).toBe(stormLook.brightness);
    expect(ctrl.uniforms.uStormFlash.value).toBe(0);
    expect(scene.fog).toBeInstanceOf(THREE.FogExp2);
    expect(gradeEl.style.backgroundColor).toContain("rgba(");

    // Idempotent on same value and structurally equal copy
    expect(ctrl.setAtmosphere(STORM_NIGHT)).toBe(false);
    expect(ctrl.setAtmosphere({ ...STORM_NIGHT, stars: [...(STORM_NIGHT.stars ?? [])] })).toBe(false);

    // Restores neutral look on null
    expect(ctrl.setAtmosphere(null)).toBe(true);
    expect(ctrl.uniforms.uTintStrength.value).toBe(0);
    expect(ctrl.uniforms.uHaze.value).toBe(0);
    expect(ctrl.uniforms.uBrightness.value).toBe(1);
    expect(scene.fog).toBeNull();
    expect(gradeEl.style.backgroundColor).toBe("transparent");
    expect(splatTintForLook(ctrl.look)).toEqual([1, 1, 1]);

    ctrl.dispose();
  });

  it("caps instanced rain and snow by particleBudget and slows fall to quarter speed under reduced motion", () => {
    const scene = new THREE.Scene();
    const normalCtrl = createAtmosphereController({ scene, floorY: 0, quality: 3, reducedMotion: false });

    normalCtrl.setAtmosphere(NIGHT_CLEAR);
    expect(normalCtrl.precipMesh).toBeNull();
    expect(normalCtrl.particleCount).toBe(0);

    normalCtrl.setAtmosphere(RAIN_DAY);
    expect(normalCtrl.precipMesh).toBeInstanceOf(THREE.InstancedMesh);
    expect(normalCtrl.particleCount).toBe(1200);

    // Quality <= 1 lowers cap to 400
    expect(normalCtrl.setQuality(1)).toBe(true);
    expect(normalCtrl.particleCount).toBe(400);

    normalCtrl.update(100, [0, 1.6, 0]);
    const normalSpeed = normalCtrl.lastFallSpeed;
    normalCtrl.dispose();

    const reducedScene = new THREE.Scene();
    const reducedCtrl = createAtmosphereController({ scene: reducedScene, floorY: 0, quality: 3, reducedMotion: true });
    reducedCtrl.setAtmosphere(RAIN_DAY);
    expect(reducedCtrl.particleCount).toBe(120);
    reducedCtrl.update(100, [0, 1.6, 0]);
    expect(reducedCtrl.lastFallSpeed).toBeCloseTo(normalSpeed * REDUCED_PRECIP_SPEED_SCALE);
    reducedCtrl.dispose();
  });

  it("rasterizes the sky dome DataTexture once per Atmosphere, skips zero-visibility skies, calls rasterizeSky 0 times across 1000 frames, and disposes cleanly", () => {
    const scene = new THREE.Scene();
    const spy = vi.fn(rasterizeSky);
    const ctrl = createAtmosphereController({
      scene,
      floorY: 0,
      quality: 1,
      reducedMotion: false,
      ports: { rasterizeSky: spy },
    });

    // Zero visibility: storm at night hides sky, dome is not added and rasterizeSky is not called
    ctrl.setAtmosphere(STORM_NIGHT);
    expect(ctrl.skyDome).toBeNull();
    expect(spy).toHaveBeenCalledTimes(0);

    // Visible sky at clear night: rasterizeSky called once, dome uses DataTexture (512x256 at low quality)
    ctrl.setAtmosphere(NIGHT_CLEAR);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(ctrl.skyDome).toBeInstanceOf(THREE.Mesh);
    const mat = ctrl.skyDome!.material as THREE.MeshBasicMaterial;
    const dataTex = mat.map as THREE.DataTexture;
    expect(dataTex).toBeInstanceOf(THREE.DataTexture);
    const img = dataTex.image as { width: number; height: number };
    expect(img.width).toBe(512);
    expect(img.height).toBe(256);

    // 1000 frame updates never call rasterizeSky again
    for (let i = 0; i < 1000; i++) {
      ctrl.update(16, [i * 0.01, 1.6, 0]);
    }
    expect(spy).toHaveBeenCalledTimes(1);

    ctrl.dispose();
    expect(ctrl.skyDome).toBeNull();
    expect(ctrl.precipMesh).toBeNull();
    expect(scene.children).toHaveLength(0);
  });

  it("ambient loop paths, <= 0.3 gain caps, and silent fallback when files are missing", async () => {
    expect(ambientLoopPath("rain", "dawn")).toBe("/sounds/ambient/rain-day.m4a");
    expect(ambientLoopPath("storm", "dusk")).toBe("/sounds/ambient/storm-night.m4a");
    for (const muted of [false, true]) {
      for (const ducked of [false, true]) {
        const g = ambientGain(muted, ducked);
        expect(g).toBeLessThanOrEqual(AMBIENT_MAX_GAIN);
        if (muted) expect(g).toBe(0);
      }
    }

    const fetchAudio = vi.fn(async () => new Response(null, { status: 404 }));
    const scene = new THREE.Scene();
    const ctrl = createAtmosphereController({
      scene,
      floorY: 0,
      quality: 2,
      reducedMotion: false,
      ports: { fetchAudio },
    });

    // Never fetches before a user gesture
    ctrl.setAtmosphere(STORM_NIGHT);
    expect(fetchAudio).toHaveBeenCalledTimes(0);

    // Unlocks after gesture and skips 404 silently
    ctrl.unlockAudio();
    await Promise.resolve();
    expect(fetchAudio).toHaveBeenCalledWith("/sounds/ambient/storm-night.m4a");
    ctrl.dispose();
  });
});
