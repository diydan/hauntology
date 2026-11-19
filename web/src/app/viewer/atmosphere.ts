import { rasterizeSky, skyVisibility } from "@hauntology/shared/conditions/sky-texture";
import type { Atmosphere, TimeOfDay, WeatherClass } from "@hauntology/shared/conditions/types";
import { atmosphereLook, particleBudget, type AtmosphereLook } from "@hauntology/shared/conditions/weather";
import { color } from "@hauntology/shared/design/tokens";
import * as THREE from "three";

/** Maximum gain allowed for ambient condition loops (`conditions` 4.3; Requirement 4.4). */
export const AMBIENT_MAX_GAIN = 0.3;

export const REDUCED_PRECIP_SPEED_SCALE = 0.25;

export function ambientLoopPath(weather: WeatherClass, timeOfDay: TimeOfDay): string {
  const bucket = timeOfDay === "dawn" || timeOfDay === "day" ? "day" : "night";
  return `/sounds/ambient/${weather}-${bucket}.m4a`;
}

export function ambientGain(muted: boolean, ducked: boolean): number {
  if (muted) return 0;
  return ducked ? 0.1 : 0.28;
}

export type GradeUniforms = {
  uTint: { value: readonly [number, number, number] };
  uTintStrength: { value: number };
  uHaze: { value: number };
  uBrightness: { value: number };
  uStormFlash: { value: 0 };
};

export interface AtmospherePorts {
  rasterizeSky?: typeof rasterizeSky;
  fetchAudio?: (url: string) => Promise<Response>;
  createAudioContext?: () => AudioContext;
}

export interface AtmosphereController {
  readonly uniforms: GradeUniforms;
  readonly look: AtmosphereLook;
  readonly skyDome: THREE.Mesh | null;
  readonly precipMesh: THREE.InstancedMesh | null;
  readonly particleCount: number;
  readonly lastFallSpeed: number;
  setAtmosphere(atmosphere: Atmosphere | null): boolean;
  setQuality(quality: number): boolean;
  update(dtMs: number, playerPos: readonly [number, number, number]): void;
  unlockAudio(): void;
  setAudioState(muted: boolean, ducked: boolean): void;
  dispose(): void;
}

function atmosphereDigest(a: Atmosphere | null, quality: number, reducedMotion: boolean): string {
  const tier = quality <= 1 ? "low" : "hi";
  const motion = reducedMotion ? "rm" : "nm";
  if (!a) return `null|${tier}|${motion}`;
  const moonKey = a.moonSky ? `${a.moonSky.az}:${a.moonSky.alt}:${a.moonSky.lit}` : "";
  const starsKey = a.stars ? a.stars.map((s) => `${s.id}:${s.az}:${s.alt}:${s.mag}`).join(",") : "";
  return `${a.weather}|${a.timeOfDay}|${a.moon}|${moonKey}|${starsKey}|${tier}|${motion}`;
}

export function splatTintForLook(look: AtmosphereLook): readonly [number, number, number] {
  const s = look.tintStrength;
  if (s <= 0) return [1, 1, 1];
  return [
    1 - s + s * (look.tint[0] / 255),
    1 - s + s * (look.tint[1] / 255),
    1 - s + s * (look.tint[2] / 255),
  ];
}

export function createAtmosphereController(opts: {
  scene: THREE.Scene;
  gradeEl?: HTMLElement | null;
  floorY: number;
  quality: number;
  reducedMotion: boolean;
  ports?: AtmospherePorts;
}): AtmosphereController {
  const { scene, gradeEl, floorY, reducedMotion } = opts;
  const rasterizeFn = opts.ports?.rasterizeSky ?? rasterizeSky;
  const fetchAudio = opts.ports?.fetchAudio ?? ((url) => fetch(url));
  const createAudioContext = opts.ports?.createAudioContext ?? (() => new AudioContext());

  let quality = opts.quality;
  let current: Atmosphere | null = null;
  let lastKey: string | null = null;
  let currentLook = atmosphereLook("clear", "day");

  const uniforms: GradeUniforms = {
    uTint: { value: currentLook.tint },
    uTintStrength: { value: currentLook.tintStrength },
    uHaze: { value: currentLook.haze },
    uBrightness: { value: currentLook.brightness },
    uStormFlash: { value: 0 },
  };

  let precipMesh: THREE.InstancedMesh | null = null;
  let precipOffsets: Float32Array | null = null;
  let precipKind: "rain" | "snow" | null = null;
  let precipCount = 0;
  let lastFallSpeed = 0;
  const dummy = new THREE.Object3D();

  let skyDome: THREE.Mesh | null = null;
  let skyTex: THREE.DataTexture | null = null;

  let audioCtx: AudioContext | null = null;
  let audioGain: GainNode | null = null;
  let audioSource: AudioBufferSourceNode | null = null;
  let audioUnlocked = false;
  let audioMuted = false;
  let audioDucked = false;
  let audioUrl: string | null = null;
  let audioReqId = 0;
  let disposed = false;

  const stopAmbientSource = () => {
    if (audioSource) {
      try {
        audioSource.stop();
        audioSource.disconnect();
      } catch {
        // Ignore already-stopped source nodes
      }
      audioSource = null;
    }
    audioUrl = null;
  };

  const syncAmbient = () => {
    if (disposed || !audioUnlocked) return;
    if (audioGain && audioCtx) {
      audioGain.gain.setTargetAtTime(ambientGain(audioMuted, audioDucked), audioCtx.currentTime, 0.25);
    }
    if (!current) {
      audioReqId += 1;
      stopAmbientSource();
      return;
    }
    const nextUrl = ambientLoopPath(current.weather, current.timeOfDay);
    if (nextUrl === audioUrl && audioSource) return;

    const reqId = ++audioReqId;
    stopAmbientSource();
    audioUrl = nextUrl;

    void (async () => {
      try {
        const res = await fetchAudio(nextUrl);
        if (!res.ok || disposed || reqId !== audioReqId) return;
        const buf = await res.arrayBuffer();
        if (disposed || reqId !== audioReqId) return;
        if (!audioCtx) {
          audioCtx = createAudioContext();
          audioGain = audioCtx.createGain();
          audioGain.gain.value = Math.min(AMBIENT_MAX_GAIN, ambientGain(audioMuted, audioDucked));
          audioGain.connect(audioCtx.destination);
        } else if (audioCtx.state === "suspended") {
          await audioCtx.resume();
        }
        const decoded = await audioCtx.decodeAudioData(buf);
        if (disposed || reqId !== audioReqId || !audioGain) return;
        const src = audioCtx.createBufferSource();
        src.buffer = decoded;
        src.loop = true;
        src.connect(audioGain);
        src.start();
        audioSource = src;
      } catch {
        // Missing or undecodable optional ambient loops are skipped silently (conditions 4.3).
      }
    })();
  };

  const clearPrecip = () => {
    if (!precipMesh) return;
    scene.remove(precipMesh);
    precipMesh.geometry.dispose();
    (precipMesh.material as THREE.Material).dispose();
    precipMesh = null;
    precipOffsets = null;
    precipKind = null;
    precipCount = 0;
  };

  const clearSkyDome = () => {
    if (skyDome) {
      scene.remove(skyDome);
      skyDome.geometry.dispose();
      (skyDome.material as THREE.Material).dispose();
      skyDome = null;
    }
    if (skyTex) {
      skyTex.dispose();
      skyTex = null;
    }
  };

  const applyLook = (look: AtmosphereLook) => {
    currentLook = look;
    uniforms.uTint.value = look.tint;
    uniforms.uTintStrength.value = look.tintStrength;
    uniforms.uHaze.value = look.haze;
    uniforms.uBrightness.value = look.brightness;
    uniforms.uStormFlash.value = 0;

    scene.fog =
      look.haze > 0
        ? new THREE.FogExp2(
            new THREE.Color((look.tint[0] / 255) * 0.4, (look.tint[1] / 255) * 0.4, (look.tint[2] / 255) * 0.45),
            look.haze * 0.045,
          )
        : null;

    if (gradeEl) {
      const alpha = look.tintStrength * 0.24 + look.haze * 0.14;
      gradeEl.style.backgroundColor =
        alpha > 0 ? `rgba(${look.tint[0]}, ${look.tint[1]}, ${look.tint[2]}, ${Math.min(0.45, alpha).toFixed(3)})` : "transparent";
    }
  };

  const rebuild = () => {
    clearPrecip();
    clearSkyDome();

    if (!current) {
      applyLook(atmosphereLook("clear", "day"));
      syncAmbient();
      return;
    }

    applyLook(atmosphereLook(current.weather, current.timeOfDay));

    // Capped instanced rain / snow (`conditions` 4.2; Requirement 4.3).
    const count = particleBudget(current.weather, { quality, reducedMotion });
    if (count > 0) {
      const isSnow = current.weather === "snow";
      precipKind = isSnow ? "snow" : "rain";
      precipCount = count;
      const geo = isSnow ? new THREE.BoxGeometry(0.045, 0.045, 0.045) : new THREE.BoxGeometry(0.012, 0.28, 0.012);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(isSnow ? color.bone : color["art-glass"]),
        transparent: true,
        opacity: isSnow ? 0.8 : 0.65,
        depthWrite: false,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.frustumCulled = false;

      const offsets = new Float32Array(count * 3);
      let seed = 987654321;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      for (let i = 0; i < count; i++) {
        const x = (rand() - 0.5) * 24;
        const y = rand() * 12;
        const z = (rand() - 0.5) * 24;
        offsets[i * 3] = x;
        offsets[i * 3 + 1] = y;
        offsets[i * 3 + 2] = z;
        dummy.position.set(x, y, z);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      precipOffsets = offsets;
      precipMesh = mesh;
      scene.add(mesh);
    }

    // Sky dome from pre-rasterized RGBA star/moon DataTexture (`conditions` 4.4; Requirement 6.2).
    const vis = skyVisibility(current.weather, current.timeOfDay);
    if (vis > 0) {
      const sky = rasterizeFn(current.stars ?? [], current.moonSky, current.weather, current.timeOfDay, { low: quality <= 1 });
      const dataTex = new THREE.DataTexture(sky.data, sky.width, sky.height, THREE.RGBAFormat);
      dataTex.colorSpace = THREE.SRGBColorSpace;
      dataTex.flipY = true;
      dataTex.needsUpdate = true;
      skyTex = dataTex;

      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(120, 32, 16),
        new THREE.MeshBasicMaterial({
          map: dataTex,
          side: THREE.BackSide,
          transparent: true,
          depthWrite: false,
          fog: false,
        }),
      );
      dome.renderOrder = -10;
      skyDome = dome;
      scene.add(dome);
    }

    syncAmbient();
  };

  return {
    uniforms,
    get look() {
      return currentLook;
    },
    get skyDome() {
      return skyDome;
    },
    get precipMesh() {
      return precipMesh;
    },
    get particleCount() {
      return precipCount;
    },
    get lastFallSpeed() {
      return lastFallSpeed;
    },
    setAtmosphere(atmosphere: Atmosphere | null) {
      if (disposed) return false;
      const nextKey = atmosphereDigest(atmosphere, quality, reducedMotion);
      if (nextKey === lastKey) return false;
      lastKey = nextKey;
      current = atmosphere;
      rebuild();
      return true;
    },
    setQuality(nextQuality: number) {
      if (disposed) return false;
      const oldTier = quality <= 1;
      const newTier = nextQuality <= 1;
      quality = nextQuality;
      if (oldTier === newTier || lastKey === null) return false;
      lastKey = atmosphereDigest(current, quality, reducedMotion);
      rebuild();
      return true;
    },
    update(dtMs: number, playerPos: readonly [number, number, number]) {
      if (disposed) return;
      if (precipMesh && precipOffsets && precipCount > 0) {
        precipMesh.position.set(playerPos[0], floorY, playerPos[2]);
        const baseSpeed = precipKind === "snow" ? 1.1 : 8.5;
        const speed = baseSpeed * (reducedMotion ? REDUCED_PRECIP_SPEED_SCALE : 1);
        lastFallSpeed = speed;
        const drop = (speed * Math.max(0, dtMs)) / 1000;
        for (let i = 0; i < precipCount; i++) {
          const x = precipOffsets[i * 3]!;
          const rawY = precipOffsets[i * 3 + 1]! - drop;
          const y = ((rawY % 12) + 12) % 12;
          const z = precipOffsets[i * 3 + 2]!;
          precipOffsets[i * 3 + 1] = y;
          dummy.position.set(x, y, z);
          dummy.updateMatrix();
          precipMesh.setMatrixAt(i, dummy.matrix);
        }
        precipMesh.instanceMatrix.needsUpdate = true;
      }
      if (skyDome) {
        skyDome.position.set(playerPos[0], playerPos[1], playerPos[2]);
      }
    },
    unlockAudio() {
      if (disposed) return;
      audioUnlocked = true;
      syncAmbient();
    },
    setAudioState(muted: boolean, ducked: boolean) {
      audioMuted = muted;
      audioDucked = ducked;
      if (audioGain && audioCtx) {
        audioGain.gain.setTargetAtTime(ambientGain(muted, ducked), audioCtx.currentTime, 0.2);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      audioReqId += 1;
      stopAmbientSource();
      clearPrecip();
      clearSkyDome();
      if (audioCtx) {
        void audioCtx.close().catch(() => undefined);
        audioCtx = null;
        audioGain = null;
      }
      scene.fog = null;
      if (gradeEl) gradeEl.style.backgroundColor = "transparent";
    },
  };
}
