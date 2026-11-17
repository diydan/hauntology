import { color } from "@hauntology/shared/design/tokens";
import { hashText } from "@hauntology/shared/ghost/rng";
import { parseShellMessage, type Anchor, type ShellToViewer } from "@hauntology/shared/app/events";
import { atmosphereParams, tiltLook, type AtmosphereParams, type LookState, type TiltCalibration, type TiltReading } from "@hauntology/shared/viewer/atmosphere";
import { flicker } from "@hauntology/shared/viewer/flicker";
import { ghostPlacement, gradeParams, orbIntensity, orbPulse, promptFor, smoothHaunt, type PromptTarget } from "@hauntology/shared/viewer/haunt";
import { inputReduce } from "@hauntology/shared/viewer/input";
import { assetUrl, loadWorld, LOAD_STAGE_LABELS, type LoadStage, type LoadedWorld, type LoaderPorts } from "@hauntology/shared/viewer/loader";
import { constrainToDisc, stepMovement } from "@hauntology/shared/viewer/movement";
import { initialQuality, initialQualityLevel, nextQuality, RESOLUTION_SCALES } from "@hauntology/shared/viewer/quality";
import {
  SPRINT_MUL, WALK_SPEED, type DeviceCaps, type InputMode, type PlayerState, type Vec3,
} from "@hauntology/shared/viewer/types";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CAPSULE_RADIUS, collisionWorldFromGeometry, type CollisionWorld } from "./collision";
import { applyLook, combineInput, stickAxes } from "./controls";
import type { ViewerHandle, ViewerSetup } from "./types";

/**
 * The real Viewer (world-viewer tasks 3 and 4): three + Spark behind the shell's seam.
 * Thin glue over the pure logic in `@hauntology/shared/viewer/`: `loadWorld` decides the
 * rung, `stepMovement` walks, the BVH capsule (or the disc) keeps the player out of the
 * walls, `inputReduce` owns play/chat. The haunt layer is group 5; anchors and atmosphere
 * messages are stored here and drawn there.
 */

/** The fixed disc radius when a world has no Collider (Requirement 2.5). */
const DISC_RADIUS = 6;
const POSE_EVERY_MS = 250;

function deviceCaps(): DeviceCaps {
  let webgl2 = false;
  let maxTexture = 0;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    webgl2 = gl !== null;
    if (gl) maxTexture = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;
  } catch {
    webgl2 = false;
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    mobile: matchMedia("(pointer: coarse)").matches,
    ...(typeof nav.deviceMemory === "number" ? { memoryGb: nav.deviceMemory } : {}),
    ...(typeof nav.hardwareConcurrency === "number" ? { cores: nav.hardwareConcurrency } : {}),
    maxTexture,
    webgl2,
  };
}

function note(container: HTMLElement, text: string, galleryLink = false): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "ui-stack";
  div.dataset.viewerNote = "";
  const p = document.createElement("p");
  p.textContent = text;
  div.append(p);
  if (galleryLink) {
    const a = document.createElement("a");
    a.className = "ui-button";
    a.href = "/gallery";
    a.textContent = "Back to the Gallery";
    div.append(a);
  }
  container.append(div);
  return div;
}

export function mountViewer({ container, worldId, onMessage }: ViewerSetup): ViewerHandle {
  let disposed = false;
  let mode: InputMode = "play";
  let inputMode = inputReduce("play", "move");
  let cleanup: (() => void) | null = null;
  const pending: ShellToViewer[] = [];
  let deliver: ((m: ShellToViewer) => void) | null = null;

  const loadingNote = note(container, LOAD_STAGE_LABELS.manifest);

  void (async () => {
    let splatMesh: SplatMesh | null = null;
    let ghostSpriteUrl: string | null = null;
    const ports: LoaderPorts = {
      fetchManifest: async (id) => {
        const r = await fetch(`/api/worlds/${encodeURIComponent(id)}`);
        if (!r.ok) throw new Error("manifest fetch failed");
        const body: unknown = await r.json();
        return typeof body === "object" && body !== null && "manifest" in body ? (body as { manifest: unknown }).manifest : body;
      },
      fetchAsset: async (id, path) => {
        const r = await fetch(assetUrl(id, path));
        if (!r.ok) throw new Error("asset fetch failed");
        return r.arrayBuffer();
      },
      initSplat: async (bytes) => {
        splatMesh = new SplatMesh({ fileBytes: bytes });
        await splatMesh.initialized;
        return true;
      },
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    };

    const caps = deviceCaps();
    const result = await loadWorld(worldId, caps, ports, (stage: LoadStage) => {
      if (!disposed) loadingNote.querySelector("p")!.textContent = LOAD_STAGE_LABELS[stage];
    });
    if (disposed) return;
    loadingNote.remove();
    if (!result.ok) {
      note(container, "This place would not load. The chat still works, or you can choose another place.", true);
      return;
    }
    const world: LoadedWorld = result.world;
    if (world.rung !== "splat") onMessage({ t: "degraded", rung: world.rung });
    // The world's own ghost picture, when the Creator made one (best effort; the drawn ghost stands in).
    try {
      const r = await fetch(`/api/worlds/${encodeURIComponent(worldId)}/ghost`);
      if (r.ok) {
        const view = (await r.json()) as { spriteUrl?: string };
        if (typeof view.spriteUrl === "string") ghostSpriteUrl = view.spriteUrl;
      }
    } catch { /* the drawn ghost stands in */ }
    if (disposed) return;
    cleanup = startScene(container, world, splatMesh, caps, ghostSpriteUrl, {
      onMessage,
      mode: () => mode,
      movementEnabled: () => inputMode.movementEnabled,
      isDisposed: () => disposed,
      registerDeliver: (fn) => {
        deliver = fn;
        for (const m of pending.splice(0)) fn(m);
      },
    });
  })();

  return {
    send(message) {
      const m = parseShellMessage(message);
      if (m === null) return;
      if (m.t === "set_input_mode") {
        mode = m.mode;
        inputMode = inputReduce(inputMode.mode, mode === "chat" ? "open_chat" : "close_chat");
        if (mode === "chat") document.exitPointerLock?.();
      }
      if (deliver) deliver(m);
      else pending.push(m);
    },
    async dispose() {
      disposed = true;
      cleanup?.();
      container.replaceChildren();
    },
  };
}

type SceneHooks = {
  onMessage: (m: unknown) => void;
  mode: () => InputMode;
  movementEnabled: () => boolean;
  isDisposed: () => boolean;
  registerDeliver: (fn: (m: ShellToViewer) => void) => void;
};

const rgba = (hex: string, alpha: number): string => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

/** A soft round sprite texture, drawn once. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, rgba(color["orb-lantern-core"], 1));
  grad.addColorStop(0.18, rgba(color.lantern, 0.95));
  grad.addColorStop(0.45, rgba(color.lantern, 0.45));
  grad.addColorStop(1, rgba(color.lantern, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/**
 * The ghost's picture, drawn until the chosen sprite of `ghost-creator` reaches the
 * viewer through the shell contract: a translucent figure with a wavy hem, on clear ground.
 */
function ghostTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 384;
  const g = c.getContext("2d")!;
  g.fillStyle = rgba(color.ghost, 0.82);
  g.beginPath();
  g.moveTo(48, 356);
  g.lineTo(48, 150);
  g.bezierCurveTo(48, 70, 82, 28, 128, 28);
  g.bezierCurveTo(174, 28, 208, 70, 208, 150);
  g.lineTo(208, 356);
  for (let i = 0; i < 4; i++) {
    const x = 208 - i * 40;
    g.quadraticCurveTo(x - 10, 330, x - 20, 356);
    g.quadraticCurveTo(x - 30, 330, x - 40, 356);
  }
  g.closePath();
  g.fill();
  g.fillStyle = rgba(color.ink, 0.9);
  for (const x of [102, 154]) { g.beginPath(); g.arc(x, 140, 10, 0, Math.PI * 2); g.fill(); }
  g.beginPath(); g.ellipse(128, 178, 11, 15, 0, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Film grain: one small noise tile, repeated by the overlay. */
function grainDataUrl(): string {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const img = g.createImageData(128, 128);
  let seed = 20261117;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = seed % 256;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

function startScene(container: HTMLElement, world: LoadedWorld, splatMesh: SplatMesh | null, caps: DeviceCaps, ghostSpriteUrl: string | null, hooks: SceneHooks): () => void {
  const manifest = world.manifest;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  // Quality (7.1): start where this device's score puts it, then follow nextQuality's timing rules.
  let quality = initialQuality(initialQualityLevel(caps));
  const applyQuality = () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * RESOLUTION_SCALES[quality.level]);
    renderer.setSize(container.clientWidth || innerWidth, container.clientHeight || innerHeight);
    if (splatMesh) splatMesh.lodScale = [0.4, 0.65, 0.85, 1][quality.level] ?? 1;
  };
  applyQuality();
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", "The place in 3D. Walk with W, A, S and D or the arrow keys; click to look with the mouse.");
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(color.ink);
  const camera = new THREE.PerspectiveCamera(62, (container.clientWidth || innerWidth) / (container.clientHeight || innerHeight), 0.05, 500);
  camera.rotation.order = "YXZ";
  scene.add(new SparkRenderer({ renderer }));

  const transform = new THREE.Matrix4().fromArray([...world.transform]);
  if (world.rung === "splat" && splatMesh) {
    transform.decompose(splatMesh.position, splatMesh.quaternion, splatMesh.scale);
    scene.add(splatMesh);
  } else {
    // Panorama or thumbnail on a surrounding sphere; drag still looks around (PanoFallback rung).
    const url = world.rung === "pano" && manifest.assets.pano
      ? assetUrl(manifest.id, manifest.assets.pano.path)
      : manifest.assets.thumb ? assetUrl(manifest.id, manifest.assets.thumb.path) : null;
    if (url) {
      new THREE.TextureLoader().load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(60, 32, 16),
          new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }),
        );
        scene.add(sphere);
      });
    }
  }

  // The haunt layer (group 5): grade overlays over the canvas, orbs, the ghost, sky and weather.
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  container.classList.add("ui-viewer-stage");
  const overlay = (className: string): HTMLDivElement => {
    const d = document.createElement("div");
    d.className = className;
    container.append(d);
    return d;
  };
  const vignetteEl = overlay("ui-viewer-vignette");
  const grainEl = overlay("ui-viewer-grain");
  grainEl.style.backgroundImage = `url(${grainDataUrl()})`;
  const toolsEl = document.createElement("div");
  toolsEl.className = "ui-viewer-tools";
  container.append(toolsEl);

  const haunt = {
    anchors: [] as Anchor[],
    found: new Set<string>(),
    target: 0,
    level: 0,
    ghostVisible: false,
    ghostOpacity: 0,
    atmosphere: null as Parameters<typeof atmosphereParams>[0],
    params: atmosphereParams(null, 2, reducedMotion) as AtmosphereParams,
  };
  const orbGroup = new THREE.Group();
  scene.add(orbGroup);
  const orbTex = glowTexture();
  const orbGeo = new THREE.PlaneGeometry(1, 1);
  const rebuildOrbs = () => {
    orbGroup.clear();
    for (const a of haunt.anchors) {
      // A camera-facing plane, turned each frame below: the same path the ghost renders through.
      // Depth test off: a memory's glow is a hint, meant to be followed, not hidden by furniture.
      const s = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ map: orbTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0, side: THREE.DoubleSide }));
      s.position.set(a.pos[0], a.pos[1], a.pos[2]);
      s.renderOrder = 11; // after the Spark pass, or its fullscreen quad paints over transparencies
      s.userData.anchor = a;
      orbGroup.add(s);
    }
  };
  const ghost = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 1.45),
    new THREE.MeshBasicMaterial({ map: ghostTexture(), transparent: true, alphaTest: 0.05, depthWrite: false, opacity: 0, side: THREE.DoubleSide }),
  );
  ghost.visible = false;
  ghost.renderOrder = 10;
  scene.add(ghost);
  if (ghostSpriteUrl) {
    new THREE.TextureLoader().load(ghostSpriteUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      (ghost.material as THREE.MeshBasicMaterial).map = tex;
      (ghost.material as THREE.MeshBasicMaterial).needsUpdate = true;
    });
  }

  let precip: THREE.Points | null = null;
  let stars: THREE.Points | null = null;
  const applyAtmosphere = () => {
    const p = atmosphereParams(haunt.atmosphere, 2, reducedMotion);
    haunt.params = p;
    scene.fog = p.fogDensity > 0 ? new THREE.FogExp2(new THREE.Color(p.tint[0] * 0.4, p.tint[1] * 0.4, p.tint[2] * 0.45), p.fogDensity) : null;
    if (precip) { scene.remove(precip); precip.geometry.dispose(); precip = null; }
    if (p.precipitation.count > 0) {
      const n = p.precipitation.count;
      const pos = new Float32Array(n * 3);
      let s = 987654321;
      const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      for (let i = 0; i < n; i++) { pos[i * 3] = (rand() - 0.5) * 26; pos[i * 3 + 1] = rand() * 12; pos[i * 3 + 2] = (rand() - 0.5) * 26; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      precip = new THREE.Points(geo, new THREE.PointsMaterial({
        color: new THREE.Color(color.bone), size: p.precipitation.kind === "snow" ? 0.07 : 0.045,
        transparent: true, opacity: 0.75, depthWrite: false,
      }));
      scene.add(precip);
    }
    if (stars) { scene.remove(stars); stars.geometry.dispose(); stars = null; }
    const sky = haunt.atmosphere?.stars;
    if (p.sky.starsVisible && sky && sky.length > 0) {
      const pos = new Float32Array(sky.length * 3);
      sky.forEach((star, i) => {
        const az = (star.az * Math.PI) / 180, alt = (star.alt * Math.PI) / 180;
        pos[i * 3] = Math.sin(az) * Math.cos(alt) * 90;
        pos[i * 3 + 1] = Math.sin(alt) * 90;
        pos[i * 3 + 2] = -Math.cos(az) * Math.cos(alt) * 90;
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(color.bone), size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false }));
      scene.add(stars);
    }
  };

  // The ambient drone (5.5, stretch): two detuned oscillators through a low-pass, only after a gesture.
  const drone = { ctx: null as AudioContext | null, gain: null as GainNode | null, muted: false };
  const startDrone = () => {
    if (drone.ctx) { void drone.ctx.resume(); return; }
    try {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 240;
      for (const f of [55, 82.5, 110.3]) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        o.connect(filter);
        o.start();
      }
      filter.connect(gain).connect(ctx.destination);
      gain.gain.linearRampToValueAtTime(drone.muted ? 0 : 0.035, ctx.currentTime + 2);
      drone.ctx = ctx;
      drone.gain = gain;
    } catch { /* no audio here; the world is silent */ }
  };
  const muteButton = document.createElement("button");
  muteButton.type = "button";
  muteButton.className = "ui-button";
  muteButton.textContent = "Sound: on";
  muteButton.setAttribute("aria-pressed", "true");
  muteButton.addEventListener("click", () => {
    drone.muted = !drone.muted;
    muteButton.textContent = drone.muted ? "Sound: off" : "Sound: on";
    muteButton.setAttribute("aria-pressed", String(!drone.muted));
    if (drone.ctx && drone.gain) drone.gain.gain.setTargetAtTime(drone.muted ? 0 : 0.035, drone.ctx.currentTime, 0.2);
  });
  toolsEl.append(muteButton);

  // Collision: the collider merged into one world-space geometry, else the disc.
  let collision: CollisionWorld | null = null;
  if (world.colliderBytes) {
    new GLTFLoader().parseAsync(world.colliderBytes, "").then((gltf) => {
      const parts: THREE.BufferGeometry[] = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        if (o instanceof THREE.Mesh) parts.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
      });
      const merged = parts.length ? mergeGeometries(parts.map((g) => g.toNonIndexed())) : null;
      if (merged) {
        merged.applyMatrix4(transform);
        collision = collisionWorldFromGeometry(merged);
      }
    }).catch(() => { /* the disc fallback stays */ });
  }

  const eyeHeightRaw = world.spawn.pos[1] - manifest.floorY;
  const eyeHeight = eyeHeightRaw >= 0.5 && eyeHeightRaw <= 3 ? eyeHeightRaw : 1.6;
  const params = { walk: WALK_SPEED, sprintMul: SPRINT_MUL, eyeHeight, bounds: manifest.bounds, floorY: manifest.floorY };
  let player: PlayerState = { pos: [...world.spawn.pos] as Vec3, yaw: world.spawn.yaw };
  let look: LookState = { yaw: world.spawn.yaw, pitch: 0 };
  let lastSafe: Vec3 = [...world.spawn.pos] as Vec3;
  let lastPoseAt = 0;
  let lastPrompt: PromptTarget = null;

  // Input state.
  const keys = new Set<string>();
  let stick: { id: number; ox: number; oy: number; dx: number; dy: number } | null = null;
  let lookTouch: { id: number; x: number; y: number } | null = null;
  const onKey = (down: boolean) => (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    // While walking, the arrows are feet, not page scroll (keyboard-only path, 8.1).
    if (down && hooks.movementEnabled() && e.code.startsWith("Arrow")) e.preventDefault();
    if (down) keys.add(e.code); else keys.delete(e.code);
  };
  const kd = onKey(true), ku = onKey(false);
  addEventListener("keydown", kd);
  addEventListener("keyup", ku);

  const canvas = renderer.domElement;
  const onClick = () => {
    if (hooks.mode() === "play" && matchMedia("(pointer: fine)").matches) void canvas.requestPointerLock();
  };
  canvas.addEventListener("click", onClick);
  const onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement === canvas && hooks.movementEnabled()) look = applyLook(look, e.movementX, e.movementY);
  };
  addEventListener("mousemove", onMouseMove);

  const onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX < innerWidth / 2 && !stick) stick = { id: t.identifier, ox: t.clientX, oy: t.clientY, dx: 0, dy: 0 };
      else if (!lookTouch) lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  };
  const onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (stick && t.identifier === stick.id) { stick.dx = t.clientX - stick.ox; stick.dy = t.clientY - stick.oy; }
      if (lookTouch && t.identifier === lookTouch.id && hooks.movementEnabled()) {
        look = applyLook(look, (t.clientX - lookTouch.x) * 2.2, (t.clientY - lookTouch.y) * 2.2);
        lookTouch.x = t.clientX; lookTouch.y = t.clientY;
      }
    }
  };
  const onTouchEnd = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (stick && t.identifier === stick.id) stick = null;
      if (lookTouch && t.identifier === lookTouch.id) lookTouch = null;
    }
  };
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd);
  canvas.addEventListener("touchcancel", onTouchEnd);

  // Tilt to look (4.5): one tap asks (iOS permission), the next tap calibrates; drag remains.
  let tiltOn = false;
  let tiltCal: TiltCalibration | null = null;
  let tiltReading: TiltReading = null;
  const onOrient = (e: DeviceOrientationEvent) => {
    tiltReading = e.alpha === null || e.beta === null ? null : { alpha: e.alpha, beta: e.beta };
  };
  const tiltButton = document.createElement("button");
  tiltButton.type = "button";
  tiltButton.className = "ui-button";
  tiltButton.textContent = "Tilt to look";
  tiltButton.addEventListener("click", () => {
    void (async () => {
      const doe = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
      if (typeof doe.requestPermission === "function" && (await doe.requestPermission()) !== "granted") return;
      if (!tiltOn) {
        tiltOn = true;
        addEventListener("deviceorientation", onOrient);
        tiltButton.textContent = "Tap to set forward";
      } else if (tiltReading) {
        tiltCal = { ...tiltReading };
        tiltButton.textContent = "Tilt on — tap to recentre";
      }
    })();
  });
  if (matchMedia("(pointer: coarse)").matches) toolsEl.append(tiltButton);

  const onResize = () => {
    const w = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  addEventListener("resize", onResize);

  hooks.registerDeliver((m) => {
    if (m.t === "apply_view") {
      haunt.anchors = [...m.anchors];
      haunt.found = new Set(m.found);
      haunt.target = m.hauntLevel;
      haunt.ghostVisible = m.ghostVisible;
      rebuildOrbs();
    } else if (m.t === "set_atmosphere") {
      haunt.atmosphere = m.atmosphere;
      applyAtmosphere();
    }
  });
  canvas.addEventListener("pointerdown", startDrone);

  let lastFrameAt = performance.now();
  let frames = 0;
  let fpsWindowAt = lastFrameAt;
  renderer.setAnimationLoop(() => {
    if (hooks.isDisposed()) return;
    const frameNow = performance.now();
    const dtMs = frameNow - lastFrameAt;
    lastFrameAt = frameNow;
    if (document.hidden) return;
    frames += 1;
    if (frameNow - fpsWindowAt >= 1000) {
      const fps = (frames * 1000) / (frameNow - fpsWindowAt);
      frames = 0;
      fpsWindowAt = frameNow;
      const stepped = nextQuality(quality, fps, frameNow);
      if (stepped.level !== quality.level) {
        quality = stepped.state;
        applyQuality();
      } else quality = stepped.state;
      hooks.onMessage({ t: "fps", fps: Math.round(fps) });
    }
    if (tiltOn && tiltCal && hooks.movementEnabled()) look = tiltLook(look, tiltReading, tiltCal, dtMs);
    const yawDelta = look.yaw - player.yaw;
    if (!hooks.movementEnabled()) keys.clear();
    const input = combineInput(keys, stick ? stickAxes(stick.dx, stick.dy, 56) : null, yawDelta);
    if (hooks.movementEnabled()) {
      player = stepMovement(player, input, dtMs, params);
      player = {
        ...player,
        pos: collision
          ? collision.resolve(player.pos, eyeHeight, CAPSULE_RADIUS)
          : constrainToDisc(player.pos, world.spawn.pos, DISC_RADIUS, world.spawn.pos[1]),
      };
      if (!player.pos.every(Number.isFinite) || player.pos[1] < manifest.floorY - 1) player = { ...player, pos: [...lastSafe] as Vec3 };
      else lastSafe = [...player.pos] as Vec3;
    } else {
      player = { ...player, yaw: look.yaw };
    }
    // The haunt layer for this frame: grade and flicker on the canvas, tint on the splats,
    // orbs by proximity, the ghost placed and faded, weather falling around the camera.
    haunt.level = smoothHaunt(haunt.level, haunt.target, dtMs);
    const grade = gradeParams(haunt.level);
    const flick = 1 - (1 - flicker(frameNow, hashText(manifest.id), reducedMotion)) * haunt.level;
    const bright = (1 - grade.dim) * haunt.params.brightness * flick;
    canvas.style.filter = `saturate(${(1 - grade.desaturate).toFixed(3)}) brightness(${bright.toFixed(3)})`;
    vignetteEl.style.opacity = grade.vignette.toFixed(3);
    grainEl.style.opacity = grade.grain.toFixed(3);
    if (splatMesh) { const [tr = 1, tg = 1, tb = 1] = haunt.params.tint; splatMesh.recolor.setRGB(tr, tg, tb); }
    for (const child of orbGroup.children) {
      const orb = child as THREE.Mesh;
      const a = (orb.userData as { anchor: Anchor }).anchor;
      const d = Math.hypot(player.pos[0] - a.pos[0], player.pos[1] - a.pos[1], player.pos[2] - a.pos[2]);
      const k = orbIntensity(d, haunt.found.has(a.id), a.radius);
      (orb.material as THREE.MeshBasicMaterial).opacity = Math.min(1, k * 1.15);
      const scale = (0.8 + 0.55 * k) * orbPulse(frameNow, reducedMotion);
      orb.scale.set(scale, scale, 1);
      orb.quaternion.copy(camera.quaternion);
      orb.visible = k > 0;
    }
    haunt.ghostOpacity += ((haunt.ghostVisible ? 0.85 : 0) - haunt.ghostOpacity) * Math.min(1, dtMs / 350);
    let ghostAt: Vec3 | null = null;
    if (haunt.ghostOpacity > 0.01) {
      const nearest = haunt.anchors.filter((a) => !haunt.found.has(a.id))
        .sort((x, y) => Math.hypot(player.pos[0] - x.pos[0], player.pos[2] - x.pos[2]) - Math.hypot(player.pos[0] - y.pos[0], player.pos[2] - y.pos[2]))[0];
      const at = ghostPlacement(player.pos, player.yaw, nearest?.pos, frameNow, manifest.bounds);
      ghostAt = at;
      ghost.position.set(at[0], at[1], at[2]);
      ghost.rotation.set(0, Math.atan2(player.pos[0] - at[0], player.pos[2] - at[2]), 0);
      (ghost.material as THREE.MeshBasicMaterial).opacity = haunt.ghostOpacity;
      ghost.visible = true;
    } else ghost.visible = false;
    if (precip) {
      precip.position.set(player.pos[0], manifest.floorY, player.pos[2]);
      const arr = (precip.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
      const fall = (haunt.params.precipitation.kind === "snow" ? 1.1 : 8.5) * (dtMs / 1000);
      for (let i = 1; i < arr.length; i += 3) { const y = (arr[i] ?? 0) - fall; arr[i] = y < 0 ? y + 12 : y; }
      precip.geometry.getAttribute("position").needsUpdate = true;
    }
    if (stars) stars.position.set(player.pos[0], player.pos[1], player.pos[2]);
    const prompt = promptFor(player.pos, haunt.anchors, ghostAt, haunt.ghostVisible);
    if (prompt !== lastPrompt) {
      lastPrompt = prompt;
      hooks.onMessage({ t: "prompt", target: prompt });
    }
    if (drone.ctx && drone.gain && !drone.muted) {
      drone.gain.gain.setTargetAtTime(hooks.mode() === "chat" ? 0.012 : 0.035, drone.ctx.currentTime, 0.3);
    }

    camera.position.set(player.pos[0], player.pos[1], player.pos[2]);
    camera.rotation.set(look.pitch, look.yaw, 0);
    const now = performance.now();
    if (now - lastPoseAt >= POSE_EVERY_MS) {
      lastPoseAt = now;
      hooks.onMessage({ t: "pose", pos: [...player.pos], yaw: player.yaw });
    }
    renderer.render(scene, camera);
  });

  return () => {
    renderer.setAnimationLoop(null);
    removeEventListener("keydown", kd);
    removeEventListener("keyup", ku);
    removeEventListener("mousemove", onMouseMove);
    removeEventListener("resize", onResize);
    removeEventListener("deviceorientation", onOrient);
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    splatMesh?.dispose?.();
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        const m = o.material as THREE.Material & { map?: THREE.Texture };
        m.map?.dispose();
        m.dispose();
      }
    });
    orbTex.dispose();
    if (drone.ctx) void drone.ctx.close();
    renderer.dispose();
  };
}
