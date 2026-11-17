import { parseShellMessage, type ShellToViewer } from "@hauntology/shared/app/events";
import { tiltLook, type LookState, type TiltCalibration, type TiltReading } from "@hauntology/shared/viewer/atmosphere";
import { inputReduce } from "@hauntology/shared/viewer/input";
import { assetUrl, loadWorld, LOAD_STAGE_LABELS, type LoadStage, type LoadedWorld, type LoaderPorts } from "@hauntology/shared/viewer/loader";
import { constrainToDisc, stepMovement } from "@hauntology/shared/viewer/movement";
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

    const result = await loadWorld(worldId, deviceCaps(), ports, (stage: LoadStage) => {
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
    cleanup = startScene(container, world, splatMesh, {
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

function startScene(container: HTMLElement, world: LoadedWorld, splatMesh: SplatMesh | null, hooks: SceneHooks): () => void {
  const manifest = world.manifest;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(container.clientWidth || innerWidth, container.clientHeight || innerHeight);
  renderer.domElement.style.touchAction = "none";
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0b10);
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

  // Input state.
  const keys = new Set<string>();
  let stick: { id: number; ox: number; oy: number; dx: number; dy: number } | null = null;
  let lookTouch: { id: number; x: number; y: number } | null = null;
  const onKey = (down: boolean) => (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
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
  if (matchMedia("(pointer: coarse)").matches) container.append(tiltButton);

  const onResize = () => {
    const w = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  addEventListener("resize", onResize);

  hooks.registerDeliver((m) => {
    // Anchors, haunt level and atmosphere are drawn by the haunt layer (group 5); stored when it lands.
    void m;
  });

  let lastFrameAt = performance.now();
  renderer.setAnimationLoop(() => {
    if (hooks.isDisposed()) return;
    const frameNow = performance.now();
    const dtMs = frameNow - lastFrameAt;
    lastFrameAt = frameNow;
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
    renderer.dispose();
  };
}
