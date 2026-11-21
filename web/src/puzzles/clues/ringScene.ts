import { CanvasTexture, Group, Sprite, SpriteMaterial, SRGBColorSpace, type PerspectiveCamera, type Scene, type Texture } from "three";
import { clueTitle, RING_RADIUS_M, type ClueForm, type SpiritClue } from "@hauntology/shared/puzzles/clues";
import { clueSpot, drawnClues } from "@hauntology/shared/puzzles/ring";

/**
 * The three.js side of the Clue ring (puzzles 10.6, Requirement 15.5, 15.9): each clue is a sprite hanging `RING_RADIUS_M` from the middle,
 * where the Player looks. An unread clue is a dark disc with a light ring and a question mark (it shows on any backdrop, the camera included);
 * a read clue shows its text on a card that tells its form apart by SHAPE and not by colour alone: a Code piece is a digit with dots for its
 * place, an Address is underlined letters, a Phone number is handwriting on a slanted line, a Date is a torn page. It builds and syncs
 * without a renderer, so a test reads the graph; drawing it needs WebGL, which a jsdom test cannot prove (the same as the Table). At most 12
 * sprites are made. The colours are the design tokens' (`bone` ink on `ink` ground, no hue).
 */
export type Labeller = (clue: SpiritClue, read: boolean) => Texture | null;

const INK = "#0b0b0d";
const BONE = "#e8e1d0";

function drawn(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  let g: CanvasRenderingContext2D | null = null;
  try { g = cv.getContext("2d"); } catch { g = null; }
  if (!g) return null;
  draw(g);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** The mark of a form, drawn behind its text: dots for a Code piece's place, an underline, a slanted baseline, a torn edge. */
export function formMark(form: ClueForm): "dots" | "underline" | "slant" | "torn" {
  return form === "code" ? "dots" : form === "address" ? "underline" : form === "phone" ? "slant" : "torn";
}

export const canvasLabeller: Labeller = (clue, read) => drawn(256, 256, (g) => {
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = INK; g.strokeStyle = BONE; g.lineWidth = 8;
  if (!read) {
    g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = BONE; g.font = "bold 120px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("?", 128, 136);
    return;
  }
  const mark = formMark(clue.form);
  g.beginPath(); g.roundRect(8, 56, 240, 144, 16); g.fill(); g.stroke();
  g.fillStyle = BONE; g.strokeStyle = BONE; g.textAlign = "center"; g.textBaseline = "middle";
  if (mark === "dots") {
    g.font = "bold 84px monospace"; g.fillText(clue.text, 128, 116);
    for (let i = 0; i < (clue.of ?? 0); i++) { g.beginPath(); g.arc(128 + (i - ((clue.of ?? 1) - 1) / 2) * 22, 176, i + 1 === clue.place ? 8 : 4, 0, Math.PI * 2); if (i + 1 === clue.place) g.fill(); else g.stroke(); }
  } else if (mark === "underline") {
    g.font = "26px serif"; g.fillText(clue.text, 128, 120, 220); g.lineWidth = 3; g.beginPath(); g.moveTo(24, 140); g.lineTo(232, 140); g.stroke();
  } else if (mark === "slant") {
    g.save(); g.translate(128, 128); g.rotate(-0.12); g.font = "italic 34px serif"; g.fillText(clue.text, 0, 0, 220); g.restore();
  } else {
    g.font = "26px serif"; g.fillText(clue.text, 128, 124, 220); g.lineWidth = 3; g.beginPath();
    for (let x = 16; x <= 240; x += 16) g.lineTo(x, 190 + (x / 16 % 2 === 0 ? 6 : -6));
    g.stroke();
  }
});

export type RingScene = Readonly<{
  group: Group;
  /** The clue ids drawn, in order (at most 12). */
  ids: readonly string[];
  /** The text label of every clue, for a screen reader (read or not): the same words the Clue list uses. */
  labels: ReadonlyMap<string, string>;
  setRead: (read: ReadonlySet<string>) => void;
  /** A soft pulse on a clue that was just read (a visual twin of the click buzz); a no-op when still. */
  pulse: (id: string, still: boolean) => void;
  /** Move the pulses on by `dtMs`. */
  update: (dtMs: number) => void;
  dispose: () => void;
}>;

const SPRITE_SIZE = 0.42;
const PULSE_MS = 400;

export function createRingScene(clues: readonly SpiritClue[], label: Labeller = canvasLabeller): RingScene {
  const group = new Group();
  const shown = drawnClues(clues);
  const sprites = new Map<string, { sprite: Sprite; unread: Texture | null; read: Texture | null; isRead: boolean; pulseMs: number }>();
  const labels = new Map<string, string>();
  for (const c of shown) {
    const unread = label(c, false);
    const mat = new SpriteMaterial({ ...(unread ? { map: unread } : {}), color: unread ? 0xffffff : 0xe8e1d0, transparent: true, depthTest: false });
    const sprite = new Sprite(mat);
    const p = clueSpot(c, RING_RADIUS_M);
    sprite.position.set(p.x, p.y, p.z);
    sprite.scale.set(SPRITE_SIZE, SPRITE_SIZE, 1);
    sprite.name = `clue:${c.id}`;
    sprite.userData = { clueId: c.id, form: c.form, mark: formMark(c.form) };
    group.add(sprite);
    sprites.set(c.id, { sprite, unread, read: null, isRead: false, pulseMs: 0 });
    labels.set(c.id, `${clueTitle(c)}: not found yet`);
  }
  return {
    group,
    ids: shown.map((c) => c.id),
    labels,
    setRead(read) {
      for (const c of shown) {
        const s = sprites.get(c.id); if (!s) continue;
        const now = read.has(c.id);
        if (now === s.isRead) continue;
        s.isRead = now;
        const mat = s.sprite.material as SpriteMaterial;
        if (now) { s.read ??= label(c, true); if (s.read) { mat.map = s.read; mat.color.set(0xffffff); } else mat.color.set(0xffffff); mat.needsUpdate = true; }
        else if (s.unread) { mat.map = s.unread; mat.needsUpdate = true; }
        s.sprite.scale.set(SPRITE_SIZE * (now ? 1.5 : 1), SPRITE_SIZE * (now ? 1.0 : 1), 1);
        labels.set(c.id, now ? `${clueTitle(c)}: ${c.text}` : `${clueTitle(c)}: not found yet`);
      }
    },
    pulse(id, still) { const s = sprites.get(id); if (s && !still) s.pulseMs = PULSE_MS; },
    update(dtMs) {
      for (const s of sprites.values()) {
        if (s.pulseMs <= 0) continue;
        s.pulseMs = Math.max(0, s.pulseMs - dtMs);
        const k = 1 + 0.25 * Math.sin((1 - s.pulseMs / PULSE_MS) * Math.PI);
        s.sprite.scale.set(SPRITE_SIZE * (s.isRead ? 1.5 : 1) * k, SPRITE_SIZE * (s.isRead ? 1.0 : 1) * k, 1);
      }
    },
    dispose() {
      for (const s of sprites.values()) { (s.sprite.material as SpriteMaterial).dispose(); s.unread?.dispose(); s.read?.dispose(); }
      group.clear();
    },
  };
}

/**
 * Hang the ring in the Spirit table's scene (spirit-table 3.6, Requirement 7.1): the same scene and the same camera as the Table, so the ring
 * turns with the same view. It follows the camera's position (the Player is the middle of both) and returns the way to take itself down.
 * `read` is read now and then by the Table's own loop through the returned `sync`.
 */
export function hangClueRing(clues: readonly SpiritClue[], read: () => ReadonlySet<string>, label: Labeller = canvasLabeller): (ctx: Readonly<{ scene: Scene; camera: PerspectiveCamera }>) => () => void {
  return ({ scene, camera }) => {
    const ring = createRingScene(clues, label);
    ring.setRead(read());
    ring.group.position.copy(camera.position);
    scene.add(ring.group);
    return () => { scene.remove(ring.group); ring.dispose(); };
  };
}
