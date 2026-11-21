import { knockWords } from "../puzzles/knock";
import { hash } from "../puzzles/rng";
import type { SightPayload } from "../puzzles/types";
import { CLUE_READ_METRES, SIGN_LABELS, type PublicWorldClue, type Sign } from "../puzzles/world-clues";
import { orbPulse } from "./haunt";
import { clamp, clamp01, clampToBounds, finiteOr, type Bounds, type Vec3 } from "./types";

/**
 * Pure Viewer rules for World Clues (`.kiro/specs/world-clues`, Requirements 2.1, 2.3, 4.3):
 * placing props near Zone anchors, fading answers cleanly within 3 metres and the view cone,
 * pulsing at most at the orb's slow rhythm, and expressing answers with text labels as well as colour.
 */

/** Camera forward-cone cosine cutoff: 60° half-angle (`cos(pi/3) = 0.5`). */
export const CLUE_VIEW_COS = 0.5;

export const WORLD_WIRE_LABELS = [
  "red circle",
  "blue square",
  "green triangle",
  "yellow diamond",
  "violet cross",
  "white hexagon",
] as const;

export const WORLD_SHELF_LABELS = [
  "candlestick",
  "key",
  "cup",
  "book",
  "bell",
  "lamp",
  "hat",
  "vase",
  "mirror",
  "box",
  "moon",
  "star",
] as const;

export type PlacedWorldClueProp = Readonly<{
  zone: string;
  sign: Sign;
  sight: SightPayload;
  pos: Vec3;
}>;

/**
 * Places every Public View World Clue / Decoy deterministically near a Zone anchor (or fallback ring
 * inside `bounds` if anchors are not supplied), staying clamped inside `bounds`.
 */
export function cluePropPositions(
  clues: readonly PublicWorldClue[],
  anchors: readonly { pos: Vec3 }[],
  bounds: Bounds,
  floorY: number,
  eyeHeight = 1.6,
): readonly PlacedWorldClueProp[] {
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cz = (bounds.min[2] + bounds.max[2]) / 2;
  const y = clamp(floorY + eyeHeight * 0.85, bounds.min[1] + 0.35, bounds.max[1] - 0.25);

  return clues.map((c, idx) => {
    const base = anchors.length > 0 ? anchors[idx % anchors.length]!.pos : null;
    const h = hash("world-clue-prop", c.zone, c.sign, idx);
    const angle = ((h % 360) * Math.PI) / 180;
    const dist = base ? 0.75 + (idx % 3) * 0.15 : 1.6 + (idx % 3) * 0.4;
    const originX = base && Number.isFinite(base[0]) ? base[0] : cx;
    const originZ = base && Number.isFinite(base[2]) ? base[2] : cz;
    const raw: Vec3 = [originX + Math.cos(angle) * dist, y, originZ + Math.sin(angle) * dist];
    return { zone: c.zone, sign: c.sign, sight: c.sight, pos: clampToBounds(raw, bounds) };
  });
}

/**
 * Clarity in `[0, 1]` for reading a World Clue prop's answer: `0` when outside `CLUE_READ_METRES`
 * (3 m) or outside the camera's forward cone, growing linearly toward `1` as distance shrinks.
 */
export function clueClarity(cameraPos: Vec3, yaw: number, propPos: Vec3, maxDist = CLUE_READ_METRES): number {
  if (!cameraPos.every(Number.isFinite) || !propPos.every(Number.isFinite) || !Number.isFinite(yaw)) return 0;
  const limit = finiteOr(maxDist, CLUE_READ_METRES);
  if (limit <= 0) return 0;
  const dx = propPos[0] - cameraPos[0];
  const dy = propPos[1] - cameraPos[1];
  const dz = propPos[2] - cameraPos[2];
  const dist = Math.hypot(dx, dy, dz);
  if (dist > limit) return 0;
  if (dist < 1e-6) return 1;
  const hLen = Math.hypot(dx, dz);
  if (hLen > 1e-6) {
    // Camera yaw 0 faces -Z: forward = (-sin(yaw), 0, -cos(yaw)).
    const dot = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / hLen;
    if (dot < CLUE_VIEW_COS) return 0;
  }
  return clamp01(1 - dist / limit);
}

/** Slow glow pulse only (no flashing; reduced under `reducedMotion`), reusing the orb pulse curve. */
export function clueGlowPulse(tMs: number, reducedMotion: boolean): number {
  return orbPulse(tMs, reducedMotion);
}

/** Non-colour text summary of a World Clue's answer so no clue relies on colour alone (2.3, 4.3). */
export function clueAnswerLines(sight: SightPayload): readonly string[] {
  switch (sight.kind) {
    case "clock":
      return ["Clock stopped:", `${sight.h}:${String(sight.m).padStart(2, "0")}`];
    case "safe":
      return ["Plaque code:", sight.code.join(" · ")];
    case "wires":
      return ["Fuse box:", ...sight.order.map((id, i) => `${i + 1}. ${WORLD_WIRE_LABELS[((id % WORLD_WIRE_LABELS.length) + WORLD_WIRE_LABELS.length) % WORLD_WIRE_LABELS.length]}`)];
    case "moved":
      return ["Shelf order:", sight.shelf.map((id) => WORLD_SHELF_LABELS[((id % WORLD_SHELF_LABELS.length) + WORLD_SHELF_LABELS.length) % WORLD_SHELF_LABELS.length]).join(", ")];
    case "photo":
      return ["Photo frame:", `${sight.cols}x${sight.rows} · ${sight.picture.shapes.length} shapes`];
    case "knock":
      return ["Secret knock:", knockWords(sight)];
  }
}

export const worldClueAccessibleLabel = (sign: Sign, zone: string): string => `${SIGN_LABELS[sign]} clue in ${zone}`;
