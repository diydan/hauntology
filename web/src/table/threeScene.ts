import {
  AmbientLight, BoxGeometry, CanvasTexture, CircleGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, PointLight, Points, PointsMaterial, Quaternion, RingGeometry, Scene, BufferGeometry, SRGBColorSpace,
} from "three";
import { color } from "@hauntology/shared/design/tokens";
import { BOARD } from "@hauntology/shared/table/marks";
import { MAX_TABLE_FPS } from "@hauntology/shared/table/plan";
import { RagDoll, HEAD_HEIGHT } from "./carry";
import { BOARD_WIDTH, RELIC_SIZE, SHELF_X, STANDEE_HEIGHT, STANDEE_WIDTH, TABLE_SCALE, WHISPER_PICTURE_HEIGHT, type PieceId, type TableModel } from "./model";
import { worldToBoard, type Anchor, type Fov, type Quat } from "./view";

/**
 * The three.js scene of the Spirit table (spirit-table 2.1 to 2.5, 3.2, 9.1): a slab with an inlay, six floors with a label each, low
 * interior walls with door gaps and tall back and side walls with an open front, flat standees that turn about their up axis to face the
 * Player, the Whisper's plane with a faded hem, a glow and mist, Mark tags tied by a thin stem, the Cold Spot glow, the ring under a picked
 * piece and the lit room and landing ring of a carry. It builds and syncs without a renderer, so a test can read the graph; drawing it
 * needs WebGL (`renderer.ts`). It reads a `TableModel` and nothing else, and every colour is from the design tokens.
 */

/** A picture a piece may wear: its address and how big it is. A picture over 120 kilobytes, or of unknown size, is not used; a round card is drawn instead (2.5, 6.4). */
export const PICTURE_MAX_BYTES = 120 * 1024;
export type PictureRef = Readonly<{ url: string; bytes: number }>;
export const pictureFits = (p: PictureRef | undefined): p is PictureRef => !!p && Number.isFinite(p.bytes) && p.bytes > 0 && p.bytes <= PICTURE_MAX_BYTES;

const C = (name: keyof typeof color): Color => new Color(color[name]);
const SLAB_TOP = 0;
const ROW_COUNT = 14;

function canvasTexture(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  let g: CanvasRenderingContext2D | null = null;
  try { g = cv.getContext("2d"); } catch { g = null; }
  if (!g) return null;
  draw(g, w, h);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
}

const cardTexture = (label: string, ring: string, fill: string): CanvasTexture | null => canvasTexture((g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = fill; g.beginPath(); g.arc(w / 2, h * 0.3, w * 0.36, 0, Math.PI * 2); g.fill();
  g.fillRect(w * 0.3, h * 0.55, w * 0.4, h * 0.4);
  g.strokeStyle = ring; g.lineWidth = 6; g.beginPath(); g.arc(w / 2, h * 0.3, w * 0.36, 0, Math.PI * 2); g.stroke();
  g.fillStyle = ring; g.font = `bold ${Math.round(w * 0.42)}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(label.slice(0, 1).toUpperCase(), w / 2, h * 0.3);
}, 128, 200);

const labelTexture = (text: string): CanvasTexture | null => canvasTexture((g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = color.bone; g.font = `${Math.round(h * 0.5)}px serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2, w - 8);
}, 256, 64);

const tagTexture = (glyph: string): CanvasTexture | null => canvasTexture((g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = color.wood; g.strokeStyle = color.lantern; g.lineWidth = 4;
  g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 14); g.fill(); g.stroke();
  g.fillStyle = color.bone; g.font = `bold ${glyph.length > 2 ? 26 : 44}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(glyph, w / 2, h / 2);
}, 128, 64);

const whisperTexture = (): CanvasTexture | null => canvasTexture((g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, color.ghost); grad.addColorStop(0.7, color.ghost); grad.addColorStop(1, "rgba(159,232,208,0)"); // the faded hem
  g.fillStyle = grad; g.beginPath(); g.moveTo(w * 0.5, 0); g.quadraticCurveTo(w * 0.95, h * 0.15, w * 0.85, h); g.lineTo(w * 0.15, h); g.quadraticCurveTo(w * 0.05, h * 0.15, w * 0.5, 0); g.fill();
}, 128, 256);

type Standee = { id: PieceId; group: Group; mesh: Mesh; ring: Mesh; orig: Float32Array; doll: RagDoll; kind: "pawn" | "suspect" };
type TagObj = { mesh: Mesh; stem: Mesh };

export type SceneOptions = Readonly<{ reducedMotion: boolean; portraits?: Readonly<Record<string, PictureRef>>; fov?: Fov }>;

export type TableScene = Readonly<{
  scene: Scene;
  camera: PerspectiveCamera;
  /** Place the Table (the anchor) and turn the camera. */
  setView: (anchor: Anchor, q: Quat, aspect: number) => void;
  /** Bring every piece to where the model says, and the Whisper, tags and rings with it. `dtMs` is the time since the last frame. */
  sync: (model: TableModel, tMs: number, dtMs: number) => void;
  /** Light a piece's ring (the picked piece). */
  select: (id: PieceId | null) => void;
  /** Start, move and end a carry of a Suspect (9.1): `head` is where the finger's plane point is; `roomZone` the room to light. */
  carry: (suspect: string | null, head: Readonly<{ x: number; z: number }> | null, roomZone: string | null) => void;
  /** A soft pulse on the Table for Place; none under reduced motion. */
  pulse: () => void;
  /** Names of the objects in the graph, for tests. */
  stats: () => Readonly<{ rooms: number; standees: number; relics: number; tags: number; triangles: number }>;
  dispose: () => void;
}>;

/** Build the scene for a model. The set of pieces is fixed by the model's own ids: a new model with the same pool is synced, not rebuilt. */
export function createTableScene(model: TableModel, o: SceneOptions): TableScene {
  const scene = new Scene();
  const fov: Fov = o.fov ?? { vertical: 55, aspect: 390 / 700 };
  const camera = new PerspectiveCamera(fov.vertical, fov.aspect, 0.05, 20);
  const anchor = new Group(); anchor.scale.setScalar(TABLE_SCALE); scene.add(anchor);
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(d: T): T => { disposables.push(d); return d; };

  // lights: physical units, so small candela values for a small table
  scene.add(new AmbientLight(C("bone"), 0.35));
  const key = new PointLight(C("lantern-hi"), 2.2, 0, 2); key.position.set(0.2, 0.9, 0.5); anchor.add(key);
  const wash = new PointLight(C("ghost"), 0.6, 0, 2); anchor.add(wash);

  const std = (hex: keyof typeof color, rough = 0.8): MeshStandardMaterial => track(new MeshStandardMaterial({ color: C(hex), roughness: rough }));
  const box = (w: number, h: number, d: number, mat: MeshStandardMaterial, x: number, y: number, z: number): Mesh => {
    const m = new Mesh(track(new BoxGeometry(w, h, d)), mat); m.position.set(x, y, z); anchor.add(m); return m;
  };

  // slab, tray and the inlay
  const slabD = 2 * BOARD.D + 0.5;
  box(BOARD_WIDTH + 0.5, 0.014, slabD, std("wood-3", 0.55), 0, -0.007 + SLAB_TOP, 0.06);
  box(BOARD_WIDTH + 0.04, 0.003, 2 * BOARD.D + 0.04, std("leather", 0.7), 0, 0.0015, 0);

  // six rooms: floor, label, low interior walls with door gaps, tall back and side walls, open front
  const floors = new Map<string, MeshStandardMaterial>();
  const floorMesh = new Map<string, Mesh>();
  const wallMat = std("wood-2", 0.9);
  for (const r of model.rooms) {
    const mat = std("wood", 0.75); floors.set(r.zone, mat);
    const f = new Mesh(track(new BoxGeometry(BOARD.W - 0.0015, 0.004, BOARD.D - 0.0015)), mat); f.position.set(r.center.x, 0.004, r.center.z); anchor.add(f); floorMesh.set(r.zone, f);
    const tex = labelTexture(r.name);
    if (tex) track(tex);
    const lab = new Mesh(track(new PlaneGeometry(0.138, 0.034)), track(new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, ...(tex ? {} : { color: C("bone") }) })));
    lab.rotation.x = -Math.PI / 2; lab.position.set(r.center.x, 0.007, r.center.z - BOARD.D * 0.36); anchor.add(lab);
    const rug = new Mesh(track(new BoxGeometry(BOARD.W * 0.55, 0.002, BOARD.D * 0.4)), std("leather", 0.9)); rug.position.set(r.center.x, 0.0065, r.center.z); anchor.add(rug);
  }
  const WH = 0.07; // low wall height
  // low interior walls with a door gap in the middle of each: two across the rows (between the front and back rooms) and two between the columns
  for (const c of [-0.5 * BOARD.W, 0.5 * BOARD.W]) for (const side of [-1, 1]) box(0.0075, WH, BOARD.D * 0.34, wallMat, c, WH / 2, side * BOARD.D * 0.5);
  for (let col = 0; col < 3; col++) for (const side of [-1, 1]) box(BOARD.W * 0.3, WH, 0.0075, wallMat, (col - 1) * BOARD.W + side * BOARD.W * 0.33, WH / 2, 0);
  box(BOARD_WIDTH, 0.3, 0.0075, wallMat, 0, 0.15, -BOARD.D);
  box(0.0075, 0.3, 2 * BOARD.D, wallMat, -1.5 * BOARD.W, 0.15, 0);
  box(0.0075, 0.3, 2 * BOARD.D, wallMat, 1.5 * BOARD.W, 0.15, 0);

  // Cold Spot glow over its room
  const coldMat = track(new MeshBasicMaterial({ color: C("art-glass"), transparent: true, opacity: 0.0, depthWrite: false, side: DoubleSide }));
  const cold = new Mesh(track(new CircleGeometry(BOARD.D * 0.45, 32)), coldMat); cold.rotation.x = -Math.PI / 2; cold.position.y = 0.012; cold.visible = false; anchor.add(cold);

  // Relics on the Shelf
  const shelfMat = std("art-wood", 0.5);
  box(0.12, 0.012, 2 * BOARD.D + 0.04, shelfMat, SHELF_X, -0.0, 0);
  const relicMeshes = new Map<string, Mesh>();
  for (const r of model.relics) {
    const m = new Mesh(track(new BoxGeometry(RELIC_SIZE * 0.8, RELIC_SIZE * 0.8, RELIC_SIZE * 0.8)), std("art-brass", 0.35)); m.position.set(r.pos.x, RELIC_SIZE * 0.4 + 0.006, r.pos.z); anchor.add(m); relicMeshes.set(r.id, m);
  }

  // standees: Pawns and Suspects (a flat picture on 15 rows, so a held Suspect can bend)
  const standees = new Map<PieceId, Standee>();
  const makeStandee = (id: PieceId, kind: "pawn" | "suspect", label: string, ringHex: keyof typeof color, mono: boolean): void => {
    const geo = track(new PlaneGeometry(STANDEE_WIDTH, STANDEE_HEIGHT, 1, ROW_COUNT)); geo.translate(0, STANDEE_HEIGHT / 2, 0);
    const tex = cardTexture(label, mono ? color.dust : color[ringHex], mono ? color["ink-deep"] : color["wood-2"]);
    if (tex) track(tex);
    const mat = track(new MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, side: DoubleSide, ...(tex ? {} : { color: mono ? C("dust") : C(ringHex) }) }));
    const mesh = new Mesh(geo, mat);
    const group = new Group(); group.add(mesh);
    const base = new Mesh(track(new CircleGeometry(STANDEE_WIDTH * 0.45, 20)), track(new MeshBasicMaterial({ color: C("ink-deep") }))); base.rotation.x = -Math.PI / 2; base.position.y = 0.002; group.add(base);
    const ring = new Mesh(track(new RingGeometry(STANDEE_WIDTH * 0.5, STANDEE_WIDTH * 0.58, 32)), track(new MeshBasicMaterial({ color: C("lantern-hi"), transparent: true, opacity: 0.0, side: DoubleSide })));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.004; group.add(ring);
    anchor.add(group);
    standees.set(id, { id, group, mesh, ring, orig: Float32Array.from(geo.attributes.position!.array as ArrayLike<number>), doll: new RagDoll(STANDEE_HEIGHT, o.reducedMotion), kind });
  };
  for (const p of model.pawns) makeStandee(p.id, "pawn", p.nickname, p.active ? "lantern-hi" : "ash", p.mono);
  for (const s of model.suspects) makeStandee(s.id, "suspect", s.name, "bone", false);

  // the Whisper: a plane with a faded hem, a glow and a few mist points
  const wTex = whisperTexture(); if (wTex) track(wTex);
  const whisper = new Mesh(track(new PlaneGeometry(0.6 * WHISPER_PICTURE_HEIGHT, WHISPER_PICTURE_HEIGHT)), track(new MeshBasicMaterial({ map: wTex, transparent: true, opacity: 0.8, depthWrite: false, side: DoubleSide, ...(wTex ? {} : { color: C("ghost") }) })));
  whisper.geometry.translate(0, WHISPER_PICTURE_HEIGHT / 2, 0);
  const whisperGroup = new Group(); whisperGroup.add(whisper); anchor.add(whisperGroup);
  const mistGeo = track(new BufferGeometry());
  const mistN = 24, mistBase = new Float32Array(mistN * 3);
  for (let i = 0; i < mistN; i++) { const a = (i / mistN) * Math.PI * 2 * 3, r = 0.05 + (i % 5) * 0.012; mistBase[3 * i] = Math.cos(a) * r; mistBase[3 * i + 1] = (i / mistN) * 0.25; mistBase[3 * i + 2] = Math.sin(a) * r; }
  mistGeo.setAttribute("position", new Float32BufferAttribute(mistBase.slice(), 3));
  const mist = new Points(mistGeo, track(new PointsMaterial({ color: C("ghost"), size: 0.012, transparent: true, opacity: 0.5, depthWrite: false })));
  mist.visible = !o.reducedMotion; whisperGroup.add(mist);
  const glowLight = new PointLight(C("ghost"), 0, 0, 2); whisperGroup.add(glowLight);

  // rings: the picked piece, the carry's landing, the lit room under a carried Suspect
  const pickRing = new Mesh(track(new RingGeometry(0.05, 0.062, 32)), track(new MeshBasicMaterial({ color: C("lantern-hi"), transparent: true, opacity: 0.9, side: DoubleSide })));
  pickRing.rotation.x = -Math.PI / 2; pickRing.visible = false; anchor.add(pickRing);
  const landing = new Mesh(track(new RingGeometry(0.035, 0.046, 32)), track(new MeshBasicMaterial({ color: C("ghost"), transparent: true, opacity: 0.9, side: DoubleSide })));
  landing.rotation.x = -Math.PI / 2; landing.position.y = 0.012; landing.visible = false; anchor.add(landing);

  // tags: a plane with a glyph and a thin stem (3.2)
  const tags = new Map<string, TagObj>();
  const tagTex = new Map<string, CanvasTexture | null>();
  const getTag = (key: string, glyph: string): TagObj => {
    let t = tags.get(key);
    if (t) return t;
    if (!tagTex.has(glyph)) { const x = tagTexture(glyph); if (x) track(x); tagTex.set(glyph, x); }
    const tex = tagTex.get(glyph) ?? null;
    const mesh = new Mesh(track(new PlaneGeometry(glyph.length > 2 ? 0.17 : 0.09, 0.07)), track(new MeshBasicMaterial({ map: tex, transparent: true, side: DoubleSide, depthWrite: false, ...(tex ? {} : { color: C("lantern") }) })));
    const stem = new Mesh(track(new BoxGeometry(0.003, 1, 0.003)), track(new MeshBasicMaterial({ color: C("lantern") })));
    anchor.add(mesh); anchor.add(stem);
    t = { mesh, stem }; tags.set(key, t); return t;
  };

  const targets = new Map<PieceId, { x: number; z: number }>();
  let selected: PieceId | null = null;
  let carrying: { id: PieceId; head: { x: number; z: number } | null; zone: string | null } | null = null;
  let pulseT = 0;
  const eye = new Object3D();
  void eye;

  const setView: TableScene["setView"] = (a, q, aspect) => {
    anchor.position.set(a.x, a.y, a.z); anchor.rotation.set(0, a.facing, 0);
    camera.quaternion.copy(new Quaternion(q.x, q.y, q.z, q.w));
    if (Number.isFinite(aspect) && aspect > 0 && camera.aspect !== aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); }
    lastAnchor = a;
  };
  let lastAnchor: Anchor | null = null;

  const sync: TableScene["sync"] = (m, tMs, dtMs) => {
    const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs / 1000 : 0;
    const eyeB = lastAnchor ? worldToBoard(lastAnchor, { x: 0, y: 0, z: 0 }) : { x: 0, y: 1, z: 2 };
    const lit = carrying?.zone ?? null;
    for (const r of m.rooms) {
      const mat = floors.get(r.zone);
      if (mat) { mat.emissive.copy(r.zone === lit ? C("lantern") : r.solution ? C("ghost") : new Color(0, 0, 0)); mat.emissiveIntensity = r.zone === lit || r.solution ? 0.45 : 0; mat.color.copy(r.inspected ? C("wood-3") : C("wood")); }
      if (r.coldSpot) { cold.visible = true; cold.position.x = r.center.x; cold.position.z = r.center.z; coldMat.opacity = o.reducedMotion ? 0.28 : 0.22 + 0.08 * Math.sin(tMs / 700); } 
    }
    if (!m.rooms.some((r) => r.coldSpot)) cold.visible = false;
    for (const r of m.relics) { const x = relicMeshes.get(r.id); if (x) { x.position.x = r.pos.x; x.position.z = r.pos.z; } }
    const place = (id: PieceId, pos: { x: number; z: number }): void => {
      const s = standees.get(id); if (!s) return;
      const isCarried = carrying?.id === id && s.doll.busy;
      targets.set(id, pos);
      if (!isCarried && !s.doll.busy) { s.group.position.set(pos.x, 0, pos.z); }
      else if (!isCarried && s.doll.mode !== "held") { const k = Math.min(1, dt * 24); s.group.position.x += (pos.x - s.group.position.x) * k; s.group.position.z += (pos.z - s.group.position.z) * k; } // let go: it falls into its place
      if (!s.doll.busy) {
        s.mesh.position.y = 0;
        (s.mesh.geometry.attributes.position!.array as Float32Array).set(s.orig); s.mesh.geometry.attributes.position!.needsUpdate = true;
      }
      s.group.rotation.y = Math.atan2(eyeB.x - s.group.position.x, eyeB.z - s.group.position.z); // about the up axis only: it stands, it only turns to face you
    };
    for (const p of m.pawns) place(p.id, p.pos);
    for (const s of m.suspects) place(s.id, s.pos);
    // the carried Suspect hangs from the finger and swings
    if (carrying) {
      const s = standees.get(carrying.id);
      if (s && carrying.head && s.doll.mode === "held") {
        const dx = carrying.head.x - s.group.position.x, dz = carrying.head.z - s.group.position.z;
        const k = Math.min(1, dt * 14);
        const nx = s.group.position.x + dx * k, nz = s.group.position.z + dz * k;
        const ry = s.group.rotation.y, along = (nx - s.group.position.x) * Math.cos(ry) - (nz - s.group.position.z) * Math.sin(ry), depth = (nx - s.group.position.x) * Math.sin(ry) + (nz - s.group.position.z) * Math.cos(ry);
        s.group.position.set(nx, 0, nz);
        s.doll.step(dt, along, depth);
      }
    }
    for (const s of standees.values()) {
      if (s.doll.busy && !(carrying?.id === s.id && s.doll.mode === "held")) s.doll.step(dt);
      if (s.doll.busy) { const out = s.mesh.geometry.attributes.position!.array as Float32Array; s.doll.deform(s.orig, out); s.mesh.geometry.attributes.position!.needsUpdate = true; }
      (s.ring.material as MeshBasicMaterial).opacity = selected === s.id ? 0.85 : 0;
    }
    // the Whisper
    whisperGroup.position.set(m.whisper.pos.x, m.whisper.height, m.whisper.pos.z);
    whisperGroup.rotation.y = Math.atan2(eyeB.x - m.whisper.pos.x, eyeB.z - m.whisper.pos.z);
    (whisper.material as MeshBasicMaterial).opacity = 0.45 + 0.4 * m.whisper.glow;
    glowLight.intensity = 0.4 * m.whisper.glow;
    if (!o.reducedMotion) {
      const pos = mist.geometry.attributes.position as Float32BufferAttribute;
      for (let i = 0; i < mistN; i++) { pos.setY(i, ((mistBase[3 * i + 1]! + tMs / 4000 * 0.1 * (1 + (i % 3))) % 0.25)); }
      pos.needsUpdate = true;
    }
    // tags
    const live = new Set<string>();
    for (const t of m.tags) {
      const key2 = `${t.piece}|${t.kind}`; live.add(key2);
      const obj = getTag(key2, t.glyph);
      obj.mesh.visible = obj.stem.visible = true;
      obj.mesh.position.set(t.at.x, t.height, t.at.z);
      obj.mesh.rotation.y = Math.atan2(eyeB.x - t.at.x, eyeB.z - t.at.z);
      obj.stem.scale.y = t.height; obj.stem.position.set(t.at.x, t.height / 2, t.at.z);
    }
    for (const [k2, obj] of tags) if (!live.has(k2)) obj.mesh.visible = obj.stem.visible = false;
    // rings
    const target = selected ? m.rooms.find((r) => r.id === selected) ?? [...m.pawns, ...m.suspects, ...m.relics].find((p) => p.id === selected) : undefined;
    if (target) {
      const p = "center" in target ? target.center : target.pos;
      pickRing.visible = true; pickRing.position.set(p.x, 0.012, p.z);
    } else pickRing.visible = false;
    if (carrying?.head) { landing.visible = true; landing.position.x = carrying.head.x; landing.position.z = carrying.head.z; } else landing.visible = false;
    // the Place pulse
    if (pulseT > 0) { pulseT = Math.max(0, pulseT - dt); const k = 1 - pulseT / 0.6; pickRing.visible = true; pickRing.scale.setScalar(1 + 6 * k); pickRing.position.set(0, 0.012, 0); (pickRing.material as MeshBasicMaterial).opacity = 0.9 * (1 - k); } else { pickRing.scale.setScalar(1); (pickRing.material as MeshBasicMaterial).opacity = 0.9; }
  };

  const api: TableScene = {
    scene, camera, setView, sync,
    select: (id) => { selected = id; },
    carry: (suspect, head, roomZone) => {
      if (suspect === null) {
        if (carrying) { const s = standees.get(carrying.id); s?.doll.release(); carrying = null; }
        return;
      }
      if (!carrying || carrying.id !== `suspect:${suspect}`) {
        const s = standees.get(`suspect:${suspect}`);
        if (!s) return;
        s.doll.grab();
        carrying = { id: s.id, head, zone: roomZone };
      }
      carrying.head = head; carrying.zone = roomZone;
    },
    pulse: () => { if (!o.reducedMotion) pulseT = 0.6; },
    stats: () => {
      let triangles = 0;
      anchor.traverse((n) => { const g = (n as Mesh).geometry as BufferGeometry | undefined; if (g) triangles += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3; });
      return { rooms: floors.size, standees: standees.size, relics: relicMeshes.size, tags: [...tags.values()].filter((t) => t.mesh.visible).length, triangles };
    },
    dispose: () => { for (const d of disposables) d.dispose(); disposables.length = 0; scene.clear(); },
  };
  void floorMesh; void HEAD_HEIGHT; void MAX_TABLE_FPS; void targets;
  return api;
}
