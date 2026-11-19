import { color, role } from "@hauntology/shared/design/tokens";
import type { SightPayload } from "@hauntology/shared/puzzles/types";
import { SIGN_LABELS, type PublicWorldClue, type Sign } from "@hauntology/shared/puzzles/world-clues";
import { clueAnswerLines, WORLD_WIRE_LABELS } from "@hauntology/shared/viewer/world-clues";
import * as THREE from "three";

const WIRE_COLORS = [
  color["art-red"],
  color["art-blue"],
  color["art-green"],
  color["art-yellow"],
  color["art-violet"],
  color["art-white"],
] as const;

/** Draws one of the six geometric Sign marks inside `(cx, cy, r)`. */
export function drawSignMark(ctx: CanvasRenderingContext2D, sign: Sign, cx: number, cy: number, r: number, stroke: string): void {
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.fillStyle = stroke;
  ctx.lineWidth = Math.max(2, r * 0.16);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  switch (sign) {
    case "moon": {
      ctx.arc(cx, cy, r * 0.85, 0.35 * Math.PI, 1.65 * Math.PI);
      ctx.quadraticCurveTo(cx - r * 0.1, cy, cx + Math.cos(0.35 * Math.PI) * r * 0.85, cy + Math.sin(0.35 * Math.PI) * r * 0.85);
      ctx.stroke();
      break;
    }
    case "key": {
      ctx.arc(cx - r * 0.38, cy, r * 0.34, 0, Math.PI * 2);
      ctx.moveTo(cx - r * 0.04, cy);
      ctx.lineTo(cx + r * 0.85, cy);
      ctx.moveTo(cx + r * 0.55, cy);
      ctx.lineTo(cx + r * 0.55, cy + r * 0.35);
      ctx.moveTo(cx + r * 0.82, cy);
      ctx.lineTo(cx + r * 0.82, cy + r * 0.25);
      ctx.stroke();
      break;
    }
    case "eye": {
      ctx.moveTo(cx - r * 0.9, cy);
      ctx.quadraticCurveTo(cx, cy - r * 0.65, cx + r * 0.9, cy);
      ctx.quadraticCurveTo(cx, cy + r * 0.65, cx - r * 0.9, cy);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "hand": {
      ctx.roundRect(cx - r * 0.42, cy - r * 0.05, r * 0.84, r * 0.72, r * 0.2);
      for (const ox of [-0.32, -0.1, 0.12, 0.34]) {
        ctx.moveTo(cx + ox * r, cy - r * 0.05);
        ctx.lineTo(cx + ox * r, cy - r * 0.72);
      }
      ctx.stroke();
      break;
    }
    case "star": {
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI * i) / 5 - Math.PI / 2;
        const rad = i % 2 === 0 ? r * 0.88 : r * 0.38;
        const x = cx + Math.cos(a) * rad;
        const y = cy + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case "bell": {
      ctx.moveTo(cx - r * 0.65, cy + r * 0.45);
      ctx.quadraticCurveTo(cx - r * 0.5, cy - r * 0.75, cx, cy - r * 0.75);
      ctx.quadraticCurveTo(cx + r * 0.5, cy - r * 0.75, cx + r * 0.65, cy + r * 0.45);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.68, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/** Always-visible still plaque showing the Sign mark and its word label (no answer). */
export function buildSignTexture(clue: PublicWorldClue): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = role["surface-panel"];
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = role.accent;
    g.lineWidth = 4;
    g.strokeRect(4, 4, 248, 120);
    drawSignMark(g, clue.sign, 62, 64, 34, role.accent);
    g.fillStyle = role.text;
    g.font = "600 28px monospace";
    g.textBaseline = "middle";
    g.fillText(SIGN_LABELS[clue.sign].toUpperCase(), 114, 52);
    g.fillStyle = role["text-quiet"];
    g.font = "16px monospace";
    g.fillText(clue.zone, 114, 86, 126);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawSightPreview(g: CanvasRenderingContext2D, sight: SightPayload): void {
  if (sight.kind === "wires") {
    sight.order.forEach((id, i) => {
      const y = 32 + i * 26;
      const idx = ((id % WORLD_WIRE_LABELS.length) + WORLD_WIRE_LABELS.length) % WORLD_WIRE_LABELS.length;
      g.strokeStyle = WIRE_COLORS[idx]!;
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(22, y);
      g.lineTo(84, y);
      g.stroke();
      g.fillStyle = role.text;
      g.font = "15px monospace";
      g.fillText(`${i + 1}. ${WORLD_WIRE_LABELS[idx]}`, 96, y + 5, 210);
    });
    return;
  }
  if (sight.kind === "clock") {
    g.strokeStyle = role.accent;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(64, 96, 40, 0, Math.PI * 2);
    g.stroke();
    const ha = (((sight.h % 12) + sight.m / 60) / 12) * Math.PI * 2 - Math.PI / 2;
    const ma = (sight.m / 60) * Math.PI * 2 - Math.PI / 2;
    g.beginPath();
    g.moveTo(64, 96);
    g.lineTo(64 + Math.cos(ha) * 22, 96 + Math.sin(ha) * 22);
    g.moveTo(64, 96);
    g.lineTo(64 + Math.cos(ma) * 33, 96 + Math.sin(ma) * 33);
    g.stroke();
  }
  if (sight.kind === "photo") {
    g.fillStyle = color["art-wood"];
    g.fillRect(20, 24, 92, 92);
    for (const sh of sight.picture.shapes.slice(0, 6)) {
      g.fillStyle = color["art-gold"];
      const sx = 24 + sh.x * 84;
      const sy = 28 + sh.y * 84;
      const sr = Math.max(4, sh.s * 42);
      g.beginPath();
      if (sh.t === "circle") g.arc(sx, sy, sr, 0, Math.PI * 2);
      else g.rect(sx - sr, sy - sr, sr * 2, sr * 2);
      g.fill();
    }
  }
  const lines = clueAnswerLines(sight);
  const startX = sight.kind === "clock" || sight.kind === "photo" ? 124 : 24;
  g.fillStyle = role.accent;
  g.font = "600 18px monospace";
  g.fillText(lines[0] ?? "", startX, 54, 300 - startX);
  g.fillStyle = role.text;
  g.font = "600 22px monospace";
  lines.slice(1).forEach((line, i) => {
    g.fillText(line, startX, 88 + i * 28, 300 - startX);
  });
}

/** Answer overlay texture shown cleanly only within 3 m and inside the camera's view cone (2.1, 2.3). */
export function buildAnswerTexture(clue: PublicWorldClue): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 192;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = role["surface-raised"];
    g.fillRect(0, 0, 320, 192);
    g.strokeStyle = role.line;
    g.lineWidth = 3;
    g.strokeRect(3, 3, 314, 186);
    drawSightPreview(g, clue.sight);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
