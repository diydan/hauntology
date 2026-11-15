// Spirit table: a MOCKUP of a private 3D board that only shows through a phone.
// A Gothic cutaway dollhouse sits on your real table (camera) or on a stand-in table, with six sculpted rooms,
// the six canonical Relics on a side curio shelf, Living & Poltergeist player pawns, six Suspects in the front
// line-up, séance hatpin marks, Cold Spot frost, and the Whisper floating above in a 3D spectral shroud.
// Clues (a code in four pieces on mirror shards, an iron street plate, a spiked phone slip, a torn calendar) hang
// in a 3D ring around you, out of sight until you look at them. All numbers are made up (555-01xx is reserved for fiction).
import * as THREE from './vendor/three.js';
import { placeFor } from './ar-place.js';
import { makeChain, stepChain, chainUnrest, deformVertices } from './ar-rag.js';
import { roomAtPoint, lineupPos, slotPos, applyDrop } from './ar-marks.js';
import { loadGlb } from './ar-gltf.js';

const $ = (s) => document.querySelector(s);
const q = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rad = (d) => (d * Math.PI) / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOutBack = (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

// ------------------------------------------------------------------ sample data
const W = 0.115, D = 0.095, WALL = 0.0045;
const TRAY_Z = D + 0.017 + 0.0225 + 0.002; // the middle of the tray in front of the board, where the line-up stands
const SHELF_X = 1.5 * W + 0.038; // side curio shelf holding the six canonical Relics
const LIFT = 0.042; // how high a carried effigy hangs above its sliding plinth
const ROOMS = [
  { id: 'library', name: 'Library', c: 0, r: 0, floor: 0x3b2a1e, rug: 0x5c1d22, kind: 'wood' },
  { id: 'study', name: 'Study', c: 1, r: 0, floor: 0x462a20, rug: 0x243b2f, kind: 'wood' },
  { id: 'nursery', name: 'Nursery', c: 2, r: 0, floor: 0x3a4350, rug: 0x2c364a, kind: 'wood' },
  { id: 'kitchen', name: 'Kitchen', c: 0, r: 1, floor: 0x464a42, rug: 0x6b4d33, kind: 'tile' },
  { id: 'hall', name: 'Hall', c: 1, r: 1, floor: 0x4f3826, rug: 0x642228, kind: 'wood' },
  { id: 'cellar', name: 'Cellar', c: 2, r: 1, floor: 0x2d3136, rug: 0x22262b, kind: 'slate' },
];
const COLD_SPOT_ROOM = 'nursery';
const INSPECTED_ROOMS = ['library', 'hall'];
const roomAt = (id) => ROOMS.find((r) => r.id === id);
const roomCenter = (r) => new THREE.Vector3((r.c - 1) * W, 0, (r.r - 0.5) * D);
const SUSPECTS = [ // they start in the line-up: no character has a place in the rules, so none stands in a room until you mark one
  { id: 'cora', name: 'Cora Bell' },
  { id: 'vane', name: 'Lady Vane' },
  { id: 'pike', name: 'Dr. Pike' },
  { id: 'thorne', name: 'Thorne' },
  { id: 'percy', name: 'Percy' },
  { id: 'dunmore', name: 'Dunmore' },
];
const RELICS = [
  { id: 'music_box', mesh: 'relic_music_box', name: 'The Music Box', col: 0, row: 0, room: 'nursery', note: 'Pinned brass cylinder and steel comb inside a mahogany case. It stops mid-bar when the frost creeps in.' },
  { id: 'wax_hand', mesh: 'relic_wax_hand', name: 'The Hand of Glory', col: 1, row: 0, room: 'study', note: 'Pale tallow fingers over a tarnished brass saucer, stamped with a crimson palm seal.' },
  { id: 'locket', mesh: 'relic_locket', name: 'The Cameo Locket', col: 0, row: 1, room: 'library', note: 'Seed-pearl bezel around a dark oval cameo whose face has been scratched away.' },
  { id: 'planchette', mesh: 'relic_planchette', name: 'The Planchette', col: 1, row: 1, room: 'hall', note: 'Heart-shaped walnut board on three brass casters with a magnifying oculus.' },
  { id: 'silver_key', mesh: 'relic_silver_key', name: 'The Cellar Key', col: 0, row: 2, room: 'cellar', note: 'Heavy tarnished silver ward-key, cold to the touch even beside the range.' },
  { id: 'bell', mesh: 'relic_bell', name: 'The Séance Bell', col: 1, row: 2, room: 'kitchen', note: 'Turned walnut baluster handle over aged brass; its iron clapper trembles on its own.' },
];
const PAWNS = [
  { id: 'seat1', name: 'Your pawn (active turn)', room: 'study', dx: -0.032, dz: 0.018, collar: 0xe0a43a, active: true, ghost: false, note: 'Carved lantern pawn ringed in brass — it is your turn to act.' },
  { id: 'seat2', name: 'Ada’s pawn', room: 'library', dx: 0.033, dz: 0.02, collar: 0x76b8a6, active: false, ghost: false, note: 'A living investigator searching the upper rooms.' },
  { id: 'seat3', name: 'Miles’s pawn', room: 'hall', dx: 0.016, dz: 0.026, collar: 0xc45c4b, active: false, ghost: false, note: 'Standing just inside the front threshold of the Hall.' },
  { id: 'seat4', name: 'Poltergeist pawn', room: 'cellar', dx: -0.024, dz: 0.02, collar: 0x7e8288, active: false, ghost: true, note: 'Fractured monochrome ash-stone. A fallen investigator who now haunts the house.' },
];
const NOTES = [
  { room: 'cellar', text: '✕ ruled out', color: '#ff9a9a', tilt: -0.055 },
  { room: 'kitchen', text: '? maybe', color: '#f2c879', tilt: 0.05 },
];
const GHOST_Y = 0.085; // how high her feet hover above the floor
// Clues: a = turn from straight ahead (radians, positive is to your right), e = look up (positive) or down.
const CLUES = [
  { id: 'pin1', kind: 'pin', n: 1, text: '4', title: 'Code piece 1 of 4', a: -0.95, e: 0.12 },
  { id: 'pin2', kind: 'pin', n: 2, text: '7', title: 'Code piece 2 of 4', a: 0.85, e: 0.32 },
  { id: 'pin3', kind: 'pin', n: 3, text: '1', title: 'Code piece 3 of 4', a: 2.45, e: 0.04 },
  { id: 'pin4', kind: 'pin', n: 4, text: '9', title: 'Code piece 4 of 4', a: -2.4, e: 0.62 },
  { id: 'address', kind: 'address', text: '9 Marrow Lane', title: 'An address', a: 3.05, e: -0.42 },
  { id: 'phone', kind: 'phone', text: '555-0142', title: 'A phone number', a: -1.7, e: -0.02 },
  { id: 'date', kind: 'date', day: '12', month: 'MARCH', year: '1931', text: '12 March 1931', title: 'A date', a: 1.65, e: 0.1 },
];
const CLUE_MESH = { pin: 'clue_shard', address: 'clue_plate', phone: 'clue_slip', date: 'clue_calendar' };
const CLUE_R = 1.5; // metres from you
const GHOST_TOUR = ['hall', 'kitchen', 'library', 'study', 'nursery', 'cellar'];

// ------------------------------------------------------------------ state
const S = { cam: false, tilt: false, notes: true, yaw: Number(q.get('yaw')) || 0, pitch: q.has('pitch') ? Number(q.get('pitch')) : -0.88,
  sel: null, dev: null, lastDrag: -1e9 };

// ------------------------------------------------------------------ renderer & lighting
const stage = $('#stage'), glCanvas = $('#gl'), tableCanvas = $('#table'), video = $('#cam');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true, powerPreference: 'low-power' });
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.02, 12);
scene.add(camera);
const anchor = new THREE.Group();
scene.add(anchor);

scene.add(new THREE.HemisphereLight(0x9eb0d4, 0x24160c, 1.08));
const sun = new THREE.DirectionalLight(0xfff0dc, 1.3);
sun.position.set(-0.6, 1.25, 0.9);
scene.add(sun);
const moonRim = new THREE.DirectionalLight(0x9fc8dc, 0.62); // pale moonlight slanting through the three Gothic lancet windows
moonRim.position.set(0.25, 0.85, -1.15);
scene.add(moonRim);

function resize() {
  const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  drawTable();
}

// ------------------------------------------------------------------ stand-in table (used when the camera is off)
function drawTable() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.round(stage.clientWidth * 1.24 * dpr * 0.6), h = Math.round(stage.clientHeight * 1.24 * dpr * 0.6);
  tableCanvas.width = w; tableCanvas.height = h;
  const g = tableCanvas.getContext('2d');
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#34231a'); bg.addColorStop(1, '#1d1209');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const plank = h / 7;
  for (let i = 0; i < 7; i++) {
    const y = i * plank, tint = 0.5 + rnd() * 0.5;
    g.fillStyle = `rgba(${90 + tint * 40},${55 + tint * 25},${30 + tint * 14},.28)`; g.fillRect(0, y, w, plank);
    for (let k = 0; k < 26; k++) { // grain
      g.strokeStyle = `rgba(20,10,4,${0.05 + rnd() * 0.1})`; g.lineWidth = 1;
      const yy = y + rnd() * plank; g.beginPath(); g.moveTo(0, yy);
      g.bezierCurveTo(w * 0.3, yy + (rnd() - 0.5) * 6, w * 0.6, yy + (rnd() - 0.5) * 6, w, yy + (rnd() - 0.5) * 4); g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, y, w, 2);
    const jx = rnd() * w; g.fillRect(jx, y, 2, plank); // butt joint
  }
  g.strokeStyle = 'rgba(15,8,3,.45)'; g.lineWidth = 3; g.beginPath(); g.arc(w * 0.82, h * 0.22, h * 0.035, 0, 7); g.stroke(); // mug ring
  const lamp = g.createRadialGradient(w * 0.2, h * 0.1, 0, w * 0.2, h * 0.1, w * 0.9);
  lamp.addColorStop(0, 'rgba(255,190,110,.28)'); lamp.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = lamp; g.fillRect(0, 0, w, h);
  const vg = g.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.65)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
}

// ------------------------------------------------------------------ small helpers & procedural surface craft
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const radialTex = (rgb) => canvasTex(128, 128, (g, w, h) => {
  const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  r.addColorStop(0, `rgba(${rgb},1)`); r.addColorStop(0.35, `rgba(${rgb},.35)`); r.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});
function hexRgb(n) { return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function floorTex(r) {
  const [br, bg, bb] = hexRgb(r.floor);
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = `rgb(${br},${bg},${bb})`; g.fillRect(0, 0, w, h);
    let seed = r.c * 31 + r.r * 97 + 13; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    if (r.kind === 'tile') {
      const s = 16;
      for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
        const dark = ((x / s + y / s) % 2) === 0;
        const k = dark ? 0.78 : 1.16;
        g.fillStyle = `rgb(${Math.round(br * k)},${Math.round(bg * k)},${Math.round(bb * k)})`;
        g.fillRect(x + 1, y + 1, s - 2, s - 2);
      }
      g.strokeStyle = 'rgba(12,14,16,.48)'; g.lineWidth = 1;
      for (let i = 0; i <= w; i += s) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
    } else if (r.kind === 'slate') {
      for (let y = 0; y < h; y += 22) {
        const off = (y % 44 === 0) ? 0 : 14;
        for (let x = -14; x < w; x += 28) {
          const k = 0.85 + rnd() * 0.3;
          g.fillStyle = `rgb(${Math.round(br * k)},${Math.round(bg * k)},${Math.round(bb * k)})`;
          g.fillRect(x + off + 1, y + 1, 26, 20);
        }
      }
    } else {
      const pw = 16;
      for (let x = 0; x < w; x += pw) {
        const k = 0.86 + rnd() * 0.28;
        g.fillStyle = `rgb(${Math.round(br * k)},${Math.round(bg * k)},${Math.round(bb * k)})`;
        g.fillRect(x, 0, pw - 1, h);
        g.fillStyle = 'rgba(8,5,3,.52)'; g.fillRect(x, 0, 1, h);
        const jy = Math.round(rnd() * h); g.fillRect(x, jy, pw, 1.2);
      }
    }
    const vg = g.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.38)');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
  });
}
function rugTex(hex) {
  const [rr, rg, rb] = hexRgb(hex);
  return canvasTex(128, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    // Fringed ends left & right
    g.strokeStyle = 'rgba(225,212,184,.65)'; g.lineWidth = 1.4;
    for (let y = 8; y < h - 8; y += 4) { g.beginPath(); g.moveTo(1, y); g.lineTo(7, y); g.moveTo(w - 7, y); g.lineTo(w - 1, y); g.stroke(); }
    g.fillStyle = `rgb(${rr},${rg},${rb})`; g.fillRect(6, 4, w - 12, h - 8);
    g.strokeStyle = 'rgba(224,164,58,.58)'; g.lineWidth = 2.5; g.strokeRect(11, 9, w - 22, h - 18);
    g.strokeStyle = 'rgba(20,16,14,.55)'; g.lineWidth = 1.5; g.strokeRect(16, 14, w - 32, h - 28);
    // Victorian centre medallion
    g.fillStyle = 'rgba(224,164,58,.24)'; g.beginPath();
    g.moveTo(w / 2, 22); g.lineTo(w / 2 + 22, h / 2); g.lineTo(w / 2, h - 22); g.lineTo(w / 2 - 22, h / 2); g.closePath(); g.fill();
  });
}
function labelTex(text, size = 54, color = '#efe3c8') {
  return canvasTex(256, 64, (g, w, h) => {
    g.font = `600 ${size}px Georgia, "Times New Roman", serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(text.toUpperCase(), w / 2 + 2, h / 2 + 3);
    g.fillStyle = color; g.fillText(text.toUpperCase(), w / 2, h / 2);
  });
}
function pillTex(text, color) {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = 'rgba(12,12,18,.86)'; g.beginPath(); g.roundRect(4, 6, w - 8, h - 12, 24); g.fill();
    g.strokeStyle = color; g.lineWidth = 3; g.stroke();
    g.font = '600 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 1);
  });
}
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...o });

// ------------------------------------------------------------------ the board & 3D asset attachment points
const board = new THREE.Group();
anchor.add(board);
const hit = []; // things a tap can select
const floors = {}; // room id -> floor mesh
const roomPos = {}; // room id -> centre (board space)
const relicGroups = [];
const pawnGroups = [];
const fallbackShell = new THREE.Group(); // minimal box shell shown until spirit-table.glb swaps in
board.add(fallbackShell);
const kitLayer = new THREE.Group(); // sculpted 3D dollhouse, room vignettes, cold spot frost & inspected lenses
board.add(kitLayer);
const animProps = { horse: null, pendulum: null, frost: null, frostMats: [], turnRing: null, hearthLight: null, studyLight: null };

(function buildBoard() {
  const slabW = 3 * W + 0.036, slabD = 2 * D + 0.036;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(slabW, 0.014, slabD), std(0x2b1a10, { roughness: 0.55 }));
  slab.position.y = -0.007; fallbackShell.add(slab);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(slabW, 0.012, 0.046), std(0x2b1a10, { roughness: 0.55 }));
  tray.position.set(0, -0.006, TRAY_Z); fallbackShell.add(tray);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.014, 2 * D + 0.024), std(0x2b1a10, { roughness: 0.55 }));
  shelf.position.set(SHELF_X, -0.007, 0); fallbackShell.add(shelf);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.46), new THREE.MeshBasicMaterial({
    map: canvasTex(256, 180, (g, w, h) => { g.shadowColor = 'rgba(0,0,0,.95)'; g.shadowBlur = 34; g.fillStyle = '#000'; g.fillRect(w * 0.18, h * 0.2, w * 0.64, h * 0.58); }),
    transparent: true, depthWrite: false, opacity: 0.64, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0.028, -0.0162, 0.02); board.add(shadow);

  for (const r of ROOMS) {
    const c = roomCenter(r); roomPos[r.id] = c;
    const fm = std(0xffffff, { map: floorTex(r), roughness: r.kind === 'slate' ? 0.92 : 0.78, metalness: 0.04, emissive: 0x000000 });
    const f = new THREE.Mesh(new THREE.BoxGeometry(W - 0.001, 0.004, D - 0.001), fm);
    f.position.set(c.x, 0.002, c.z); f.userData = { type: 'room', id: r.id }; board.add(f); floors[r.id] = f; hit.push(f);
    if (r.kind !== 'slate') {
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.66, D * 0.52), std(0xffffff, { map: rugTex(r.rug), transparent: true, roughness: 0.95 }));
      rug.rotation.x = -Math.PI / 2; rug.position.set(c.x, 0.0042, c.z - 0.003); board.add(rug);
    }
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.0165), new THREE.MeshBasicMaterial({ map: labelTex(r.name), transparent: true, depthWrite: false }));
    lab.rotation.x = -Math.PI / 2; lab.position.set(c.x, 0.0046, c.z + (r.r === 0 ? 0.016 : D / 2 - 0.012)); board.add(lab);
  }

  // Warm miniature candlelight inside the Study & glowing coal grate in the Kitchen
  const st = roomPos.study, kt = roomPos.kitchen;
  const studyLight = new THREE.PointLight(0xffb464, 0.0032, 0.24, 2);
  studyLight.position.set(st.x + 0.02, 0.052, st.z - 0.028); board.add(studyLight); animProps.studyLight = studyLight;
  const hearthLight = new THREE.PointLight(0xff6e38, 0.0028, 0.22, 2);
  hearthLight.position.set(kt.x - 0.036, 0.022, kt.z - 0.01); board.add(hearthLight); animProps.hearthLight = hearthLight;

  // Six canonical Relics arranged in the six velvet alcoves of the side Relic Shelf
  const gold = std(0xc8a44a, { metalness: 0.85, roughness: 0.3, emissive: 0x241800 });
  for (const rl of RELICS) {
    const rx = SHELF_X - 0.014 + rl.col * 0.026, rz = (rl.row - 1) * 0.062, baseY = 0.0045 + rl.col * 0.0035;
    const g = new THREE.Group(); g.position.set(rx, baseY, rz); g.userData = { type: 'relic', id: rl.id };
    const tokenSlot = new THREE.Group(); g.add(tokenSlot);
    const mover = new THREE.Group(); mover.position.y = 0.009; g.add(mover);
    const fb = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.014, 12), gold); fb.name = 'fallback'; mover.add(fb);
    if (rl.id === 'wax_hand') {
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc46b }));
      flame.scale.y = 1.75; flame.position.set(0, 0.035, 0); flame.name = 'flame'; mover.add(flame);
      const light = new THREE.PointLight(0xffa850, 0.0026, 0.22, 2); light.position.set(0, 0.038, 0); light.name = 'light'; mover.add(light);
    }
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.026, 0.026), new THREE.MeshBasicMaterial({ map: radialTex('255,198,108'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.65 }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.0048; g.add(halo);
    const hitbox = new THREE.Mesh(new THREE.SphereGeometry(0.0135, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    hitbox.position.y = 0.018; hitbox.userData = g.userData; g.add(hitbox); hit.push(hitbox);
    g.userData.mover = mover; g.userData.tokenSlot = tokenSlot; relicGroups.push(g); board.add(g);
  }

  // Sample Living & Poltergeist Player Pawns in rooms
  for (const pw of PAWNS) {
    const c = roomPos[pw.room], g = new THREE.Group();
    g.position.set(c.x + pw.dx, 0.004, c.z + pw.dz); g.userData = { type: 'pawn', id: pw.id };
    const fb = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.009, 0.036, 14), std(pw.collar, { roughness: pw.ghost ? 0.9 : 0.5 }));
    fb.position.y = 0.018; fb.name = 'fallback'; g.add(fb);
    if (!pw.ghost) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0074, 0.0013, 8, 18), std(pw.collar, { roughness: 0.35, metalness: 0.25, emissive: pw.collar, emissiveIntensity: 0.18 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.0245; g.add(ring);
    }
    const hitbox = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.048, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hitbox.position.y = 0.024; hitbox.userData = g.userData; g.add(hitbox); hit.push(hitbox);
    pawnGroups.push({ pw, g }); board.add(g);
  }
})();

// ------------------------------------------------------------------ figures (cut-out art stood up on 3D plinths)
const loader = new THREE.TextureLoader();
const loadTex = (url) => new Promise((res, rej) => loader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, rej));
const standees = []; // { id, mesh, ring, base }
let ghost = null; // { group, plane, glow, light, mist, shroudMats }

const BONE_TINT = new THREE.Color(0xdcd7cf), PALLOR_TINT = new THREE.Color(0x768c88);

async function buildFigures() {
  const whisperTex = loadTex('art/whisper.webp');
  const ringTex = canvasTex(128, 128, (g, w, h) => { g.strokeStyle = 'rgba(224,164,58,.88)'; g.lineWidth = 5; g.shadowColor = 'rgba(224,164,58,.9)'; g.shadowBlur = 10; g.beginPath(); g.arc(w / 2, h / 2, w * 0.36, 0, 7); g.stroke(); });
  const stainTex = canvasTex(128, 128, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(4,6,9,.94)'); r.addColorStop(0.55, 'rgba(6,10,13,.62)'); r.addColorStop(1, 'rgba(6,10,13,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
  const threadTex = canvasTex(8, 96, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(159,232,208,0)'); gr.addColorStop(0.7, 'rgba(180,215,205,.38)'); gr.addColorStop(1, 'rgba(215,232,226,.78)'); g.fillStyle = gr; g.fillRect(w * 0.25, 0, w * 0.5, h); });
  await Promise.all(SUSPECTS.map(async (s) => {
    const tex = await loadTex(`art/${s.id}.webp`);
    const h = 0.105, w = h * (tex.image.width / tex.image.height), topY = h + 0.0046;
    const g = new THREE.Group();
    const lp = lineupPos(SUSPECTS.indexOf(s), SUSPECTS.length, 0.062, TRAY_Z); g.position.set(lp.x, 0, lp.z);
    const base = new THREE.Group(); base.position.y = 0.0015;
    const fbDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0135, 0.003, 24), std(0x1a1410, { roughness: 0.4, metalness: 0.4 }));
    fbDisc.name = 'fallback'; base.add(fbDisc); g.add(base);
    const stain = new THREE.Mesh(new THREE.PlaneGeometry(0.068, 0.068), new THREE.MeshBasicMaterial({ map: stainTex, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
    stain.rotation.x = -Math.PI / 2; stain.position.y = 0.0012; g.add(stain);
    const geo = new THREE.PlaneGeometry(w, h, 4, 18); geo.translate(0, h / 2 + 0.0046, 0); // slots cleanly into the brass clasp jaws of suspect_plinth
    const plane = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide, color: 0xdcd7cf, toneMapped: false }));
    plane.userData = { type: 'suspect', id: s.id }; g.add(plane); hit.push(plane);
    const threadGeo = new THREE.PlaneGeometry(0.0011, 0.26); threadGeo.translate(0, 0.13, 0);
    const thread = new THREE.Mesh(threadGeo, new THREE.MeshBasicMaterial({ map: threadTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0, toneMapped: false }));
    thread.position.y = topY - 0.002; thread.visible = false; g.add(thread); // taut marionette filament rising into the dark while held
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, opacity: 0 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.0035; g.add(ring);
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: pillTex('maybe here', '#f2c879'), transparent: true, depthTest: false }));
    badge.scale.set(0.06, 0.015, 1); badge.position.y = topY + 0.014; badge.renderOrder = 9; badge.visible = false; g.add(badge); // shows only while you have marked this character
    board.add(g);
    standees.push({ id: s.id, s, g, base, stain, thread, plane, ring, badge, w, h, topY, orig: geo.attributes.position.array.slice(),
      mode: 'idle', tx: lp.x, tz: lp.z, vy: 0, rig: null, phi: 0, u: 0, wLag: 0, holdT: 0, pallor: 0, settleT: 0 });
  }));

  const wt = await whisperTex;
  const gh = 0.2, gw = gh * (wt.image.width / wt.image.height);
  const group = new THREE.Group(); board.add(group);
  const geo = new THREE.PlaneGeometry(gw, gh); geo.translate(0, gh / 2, 0);
  const fade = canvasTex(4, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff'); gr.addColorStop(0.62, '#fff'); gr.addColorStop(1, '#222'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  fade.colorSpace = THREE.NoColorSpace;
  const plane = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: wt, alphaMap: fade, transparent: true, alphaTest: 0.01, side: THREE.DoubleSide, opacity: 0.92, depthWrite: false, toneMapped: false }));
  plane.renderOrder = 5; group.add(plane);
  const proxy = new THREE.Mesh(new THREE.PlaneGeometry(gw * 0.45, gh * 0.9), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
  proxy.position.y = gh / 2; proxy.userData = { type: 'ghost' }; plane.add(proxy); hit.push(proxy);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex('120,230,210'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
  glow.scale.set(0.34, 0.34, 1); glow.position.y = gh * 0.55; glow.renderOrder = 4; group.add(glow);
  const light = new THREE.PointLight(0x7fe0d0, 0.0055, 0.4, 2); light.position.y = gh * 0.5; group.add(light);
  const N = 70, pos = new Float32Array(N * 3), seed = [];
  for (let i = 0; i < N; i++) seed.push({ a: Math.random() * 6.28, r: 0.015 + Math.random() * 0.07, s: 0.01 + Math.random() * 0.02, p: Math.random() });
  const mgeo = new THREE.BufferGeometry(); mgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mist = new THREE.Points(mgeo, new THREE.PointsMaterial({ size: 0.014, map: radialTex('170,240,225'), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  mist.frustumCulled = false; group.add(mist);
  ghost = { group, plane, glow, light, mist, seed, pos, shroudMats: [], from: new THREE.Vector3(), to: new THREE.Vector3(), t0: performance.now() / 1000, room: 'hall', tourIdx: 0 };
  const h0 = roomPos.hall; group.position.set(h0.x, GHOST_Y, h0.z); ghost.from.copy(group.position); ghost.to.copy(group.position);
}

// the private layer: this player's own notebook marks (impaled as séance hatpins when 3D kit loads)
const notesGroup = new THREE.Group(); board.add(notesGroup);
const noteSlots = [];
for (const n of NOTES) {
  const c = roomCenter(roomAt(n.room));
  const slot = new THREE.Group(); slot.position.set(c.x, 0.004, c.z + 0.01); slot.rotation.z = n.tilt || 0; notesGroup.add(slot);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: pillTex(n.text, n.color), transparent: true, depthTest: false }));
  sp.position.set(0, 0.144, 0.003); sp.scale.set(0.074, 0.0185, 1); sp.renderOrder = 9; slot.add(sp);
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.0009, 0.15, 0.0009), new THREE.MeshBasicMaterial({ color: new THREE.Color(n.color), transparent: true, opacity: 0.55, depthWrite: false }));
  stem.position.set(0, 0.075, 0); stem.name = 'fallback'; slot.add(stem);
  noteSlots.push(slot);
}

// ------------------------------------------------------------------ clues in a 3D ring around you
function clueTex(c) {
  if (c.kind === 'pin') return canvasTex(256, 256, (g, w, h) => {
    g.font = '700 170px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(143,227,212,.95)'; g.shadowBlur = 26; g.fillStyle = '#e9fff9'; g.fillText(c.text, w / 2, h * 0.46);
    g.shadowBlur = 0;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(w / 2 + (i - 1.5) * 26, h * 0.9, 7, 0, 7); g.fillStyle = i === c.n - 1 ? '#8fe3d4' : 'rgba(143,227,212,.25)'; g.fill(); }
  });
  if (c.kind === 'address') return canvasTex(512, 128, (g, w, h) => {
    g.font = '600 52px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(239,226,194,.8)'; g.shadowBlur = 12; g.fillStyle = '#efe2c2'; g.fillText(c.text.toUpperCase(), w / 2, h * 0.46);
    g.shadowBlur = 0; g.strokeStyle = 'rgba(239,226,194,.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(40, h * 0.8); g.quadraticCurveTo(w / 2, h * 0.86, w - 40, h * 0.78); g.stroke();
  });
  if (c.kind === 'phone') return canvasTex(512, 128, (g, w, h) => {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 26px system-ui, sans-serif'; g.fillStyle = 'rgba(255,154,154,.7)'; g.fillText('CALL', w / 2, h * 0.14);
    g.font = 'italic 700 74px "Brush Script MT", "Segoe Script", "Snell Roundhand", cursive';
    g.shadowColor = 'rgba(255,120,120,.9)'; g.shadowBlur = 14; g.fillStyle = '#ff9a9a'; g.fillText(c.text, w / 2, h * 0.6);
  });
  return canvasTex(256, 320, (g, w, h) => { // a torn calendar page mounted on the 3D mahogany calendar backboard
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 14; g.fillStyle = '#efe6cf'; g.beginPath(); g.moveTo(16, 16); g.lineTo(w - 16, 16); g.lineTo(w - 16, h - 36);
    for (let x = w - 16, i = 0; x > 16; x -= 14, i++) g.lineTo(x, h - 36 + (i % 2 ? 8 : -2));
    g.closePath(); g.fill(); g.shadowBlur = 0;
    g.fillStyle = '#a83a3a'; g.fillRect(16, 16, w - 32, 54);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.font = '700 32px Georgia, serif'; g.fillText(c.month, w / 2, 44);
    g.fillStyle = '#2a2018'; g.font = '700 128px Georgia, serif'; g.fillText(c.day, w / 2, 150);
    g.font = '600 40px Georgia, serif'; g.fillText(c.year, w / 2, 238);
  });
}
const CLUE_SIZE = { pin: [0.33, 0.33], address: [0.6, 0.15], phone: [0.58, 0.145], date: [0.285, 0.355] };
const cluesRoot = new THREE.Group(); scene.add(cluesRoot);
const clueObjs = [];
const hintTex = canvasTex(128, 128, (g, w, h) => { // a dark disc, a teal ring and a question mark: readable over a camera picture too
  g.fillStyle = 'rgba(8,18,20,.55)'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.43, 0, 7); g.fill();
  g.strokeStyle = 'rgba(143,227,212,.95)'; g.lineWidth = 7; g.shadowColor = 'rgba(143,227,212,1)'; g.shadowBlur = 12; g.beginPath(); g.arc(w / 2, h / 2, w * 0.38, 0, 7); g.stroke();
  g.shadowBlur = 0; g.fillStyle = 'rgba(190,255,245,.95)'; g.font = '700 70px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', w / 2, h / 2 + 5);
});
for (const c of CLUES) {
  const g = new THREE.Group();
  const basePos = new THREE.Vector3(Math.sin(c.a) * Math.cos(c.e) * CLUE_R, Math.sin(c.e) * CLUE_R, -Math.cos(c.a) * Math.cos(c.e) * CLUE_R);
  g.position.copy(basePos);
  g.lookAt(0, basePos.y * 0.25, 0); // orient +Z toward the viewer so the 3D clue frame faces inward
  const [sw, sh] = CLUE_SIZE[c.kind];
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: clueTex(c), transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
  sp.position.z = 0.022; sp.scale.set(sw, sh, 1); sp.renderOrder = 8; sp.userData = { type: 'clue', id: c.id };
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: hintTex, transparent: true, depthWrite: false, opacity: 0.8 }));
  glow.scale.set(0.3, 0.3, 1); glow.renderOrder = 7;
  g.add(glow); g.add(sp); cluesRoot.add(g);
  clueObjs.push({ c, g, sp, glow, baseY: basePos.y, frame3d: null, frameMats: [], w: sw, h: sh, p: 0, found: false, foundT: -9 });
}
function syncClue3D(o, vis) {
  if (!o.frame3d) return;
  o.frame3d.visible = vis > 0.015;
  if (!o.frame3d.visible) return;
  for (const m of o.frameMats) m.mat.opacity = m.base * vis;
}
let lastFindAt = performance.now();
let boardOffSince = -1;
const clueCount = () => clueObjs.filter((o) => o.found).length;
function buzz() { if (!reduced && navigator.vibrate) navigator.vibrate([18, 50, 18]); }
function markFound(o, quiet) {
  if (o.found) return;
  o.found = true; o.p = 1; o.foundT = performance.now() / 1000; o.sp.material.opacity = 1; syncClue3D(o, 1); hit.push(o.sp);
  lastFindAt = performance.now(); renderClues();
  if (!quiet) { say(`Found: ${o.c.title}`, `It says ${o.c.text}. Open Clues to see all you have.`); buzz(); }
}
function renderClues() {
  const n = clueCount(), btn = $('#b-clues');
  btn.replaceChildren(Object.assign(document.createElement('span'), { textContent: 'Clues' }), Object.assign(document.createElement('small'), { textContent: `${n}/${CLUES.length}` }));
  $('#sheet-count').textContent = `${n} of ${CLUES.length}`;
  const pins = clueObjs.filter((o) => o.c.kind === 'pin').sort((a, b) => a.c.n - b.c.n);
  $('#code-line').textContent = `Code so far: ${pins.map((o) => (o.found ? o.c.text : '?')).join(' ')}`;
  $('#clue-list').replaceChildren(...clueObjs.map((o) => {
    const li = document.createElement('li'); li.dataset.found = o.found ? '1' : '0';
    li.append(Object.assign(document.createElement('b'), { textContent: o.c.title }), Object.assign(document.createElement('span'), { textContent: o.found ? o.c.text : 'Not found yet' }));
    return li;
  }));
}

// ------------------------------------------------------------------ attach full 3D glTF 2.0 asset kit (`models/spirit-table.glb`)
function apply3DKit(kit) {
  // 1. Gothic Cutaway Dollhouse Chassis (replaces fallback boxes)
  const chassis = kit.instantiate('dollhouse_chassis');
  if (chassis) { kitLayer.add(chassis); fallbackShell.visible = false; }

  // 2. Six Sculpted Canonical Relics + Stepped Ivory/Brass QR Tokens on the side shelf
  for (const g of relicGroups) {
    const rl = RELICS.find((x) => x.id === g.userData.id);
    const tok = kit.instantiate('relic_token');
    if (tok) g.userData.tokenSlot.add(tok);
    const relicMesh = rl && kit.instantiate(rl.mesh);
    if (relicMesh) {
      const fb = g.userData.mover.getObjectByName('fallback');
      if (fb) g.userData.mover.remove(fb);
      g.userData.mover.add(relicMesh);
    }
  }

  // 3. Whisper 3D Draped Spectral Shroud + Nursery Cold Spot Crystalline Frost
  if (ghost) {
    const shroud = kit.instantiate('whisper_shroud', true);
    if (shroud) {
      shroud.renderOrder = 4;
      shroud.traverse((o) => { if (o.isMesh) { o.renderOrder = 4; ghost.shroudMats.push({ mat: o.material, base: o.material.opacity }); } });
      ghost.plane.add(shroud);
    }
  }
  const frost = kit.instantiate('cold_spot_frost', true);
  if (frost) {
    const nc = roomPos[COLD_SPOT_ROOM];
    frost.position.set(nc.x, 0.0042, nc.z);
    frost.traverse((o) => { if (o.isMesh) animProps.frostMats.push({ mat: o.material, base: o.material.opacity }); });
    kitLayer.add(frost); animProps.frost = frost;
  }

  // 4. Turned Ebony & Brass Suspect Plinths + Living & Poltergeist Player Pawns + Brass Turn Ring
  for (const s of standees) {
    const plinth = kit.instantiate('suspect_plinth');
    if (plinth) {
      const fb = s.base.getObjectByName('fallback'); if (fb) s.base.remove(fb);
      plinth.position.y = -0.0015; // bottom of plinth rests flush on the floorboards when s.base.position.y = groundOff + 0.0015
      s.base.add(plinth);
    }
  }
  for (const { pw, g } of pawnGroups) {
    const mesh = kit.instantiate(pw.ghost ? 'pawn_poltergeist' : 'pawn_living');
    if (mesh) {
      const fb = g.getObjectByName('fallback'); if (fb) g.remove(fb);
      g.add(mesh);
    }
    if (pw.active) {
      const tr = kit.instantiate('pawn_turn_ring');
      if (tr) { tr.position.y = 0.0004; g.add(tr); animProps.turnRing = tr; }
    }
  }

  // 5. Séance Hatpins for Private Room Marks + Miniature Brass Magnifying Lenses on Inspected Rooms
  for (const slot of noteSlots) {
    const pin = kit.instantiate('mark_hatpin');
    if (pin) {
      const fb = slot.getObjectByName('fallback'); if (fb) slot.remove(fb);
      slot.add(pin);
    }
  }
  for (const rid of INSPECTED_ROOMS) {
    const lens = kit.instantiate('inspected_lens');
    if (lens) {
      const c = roomPos[rid];
      lens.position.set(c.x - 0.033, 0.0041, c.z + 0.028);
      lens.rotation.y = rid === 'library' ? 0.52 : -0.68;
      notesGroup.add(lens);
    }
  }

  // 6. Six Sculpted Room Furniture Vignettes + Animatable Rocking Horse & Grandfather Clock Pendulum
  for (const r of ROOMS) {
    const v = kit.instantiate(`room_${r.id}`);
    if (v) { const c = roomPos[r.id]; v.position.set(c.x, 0.004, c.z); kitLayer.add(v); }
  }
  const horse = kit.instantiate('nursery_horse');
  if (horse) {
    const c = roomPos.nursery;
    horse.position.set(c.x - 0.028, 0.004, c.z + 0.006); horse.rotation.y = 0.42;
    kitLayer.add(horse); animProps.horse = horse;
  }
  const pendulum = kit.instantiate('hall_pendulum');
  if (pendulum) {
    const c = roomPos.hall;
    pendulum.position.set(c.x + 0.041, 0.004 + 0.033, c.z - 0.031);
    kitLayer.add(pendulum); animProps.pendulum = pendulum;
  }

  // 7. Floating 3D Spirit Clue Frames (mirror shards, rusted street plate, desk spike slip, mahogany calendar)
  for (const o of clueObjs) {
    const frame = kit.instantiate(CLUE_MESH[o.c.kind], true);
    if (frame) {
      frame.traverse((m) => {
        if (m.isMesh) {
          const base = m.material.opacity ?? 1;
          m.material.transparent = true;
          o.frameMats.push({ mat: m.material, base });
        }
      });
      o.frame3d = frame; o.g.add(frame);
      syncClue3D(o, o.found ? 1 : o.p * o.p);
    }
  }
}

// ------------------------------------------------------------------ placing the board
let placeT0 = -1;
const pulse = new THREE.Mesh(new THREE.RingGeometry(0.19, 0.196, 64), new THREE.MeshBasicMaterial({ color: 0xb9a6ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
pulse.rotation.x = -Math.PI / 2; pulse.position.y = -0.0155; board.add(pulse);
const _f = new THREE.Vector3();
let lastHeading = { x: 0, z: -1 };
// Point the camera the way the phone points (tilt), or the way the Player dragged it. Placing must use the same aim the Player sees.
function aimCamera(sway) {
  if (S.tilt && S.dev) deviceQuat(camera.quaternion, S.dev);
  else { _eu.set(S.pitch, S.yaw + sway, 0, 'YXZ'); camera.quaternion.setFromEuler(_eu); }
}
function place() {
  aimCamera(0); // the phone's own heading, not the one the view had before Tilt switched on
  camera.getWorldDirection(_f);
  const p = placeFor(_f, lastHeading); lastHeading = p.heading;
  anchor.position.set(p.x, p.y, p.z);
  anchor.rotation.y = p.facing; // the board's front edge faces you
  cluesRoot.rotation.y = p.facing; // and the ring of clues is centred on the same direction
  placeT0 = performance.now();
}

// ------------------------------------------------------------------ the card under the picture
const cardT = $('#card-t'), cardP = $('#card-p');
function say(t, p) { cardT.textContent = t; cardP.textContent = p; }
const peopleIn = (room) => SUSPECTS.filter((s) => marks[s.id] === room).map((s) => s.name);
function select(hitData) {
  for (const f of Object.values(floors)) f.material.emissive.setHex(0x000000);
  S.sel = hitData || null;
  if (!hitData) return say('Your private table', `Only your phone sees it. ${CLUES.length} clues hang around you: turn round and look for the ? rings.`);
  if (hitData.type === 'suspect') { const x = SUSPECTS.find((y) => y.id === hitData.id), r = marks[x.id] && roomAt(marks[x.id]); say(x.name, r ? `Your mark: maybe in the ${r.name}. Drag ${x.name} off the rooms to take it back.` : `In the line-up. Drag ${x.name} onto a room to leave your own mark there.`); }
  else if (hitData.type === 'room') {
    const r = roomAt(hitData.id); floors[r.id].material.emissive.setHex(0x3a2a18);
    const who = peopleIn(r.id);
    const cold = r.id === COLD_SPOT_ROOM ? 'Crystalline frost rims the floorboards — the Cold Spot is here.' : '';
    const insp = INSPECTED_ROOMS.includes(r.id) ? 'A brass magnifying glass marks this room as already inspected.' : '';
    say(r.name, [who.length ? who.join(' and ') + (who.length > 1 ? ' are' : ' is') + ' marked here by you.' : 'No suspect marks here.', cold, insp].filter(Boolean).join(' '));
  } else if (hitData.type === 'relic') {
    const rl = RELICS.find((x) => x.id === hitData.id);
    say(rl.name, rl.note);
  } else if (hitData.type === 'pawn') {
    const pw = PAWNS.find((x) => x.id === hitData.id);
    say(pw.name, pw.note);
  } else if (hitData.type === 'clue') { const o = clueObjs.find((x) => x.c.id === hitData.id); say(o.c.title, `It says ${o.c.text}.`); }
  else if (hitData.type === 'ghost') say('The Whisper', 'Draped in a spectral shroud that does not appear on the TV. Only your phone shows her.');
}

// ------------------------------------------------------------------ input: drag to look, tap to pick
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let drag = null, pick = null;
glCanvas.addEventListener('pointerdown', (e) => { glCanvas.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() }; pick = carry ? null : standeeAt(e.clientX, e.clientY); });
glCanvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (carry) { moveCarry(e.clientX, e.clientY); return; } // a character is in your hand: the finger moves it, not the view
  if (pick) { // the finger went down on a character: after a few pixels it picks the character up
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) { if (startCarry(pick, e.clientX, e.clientY)) { moveCarry(e.clientX, e.clientY); return; } pick = null; }
    return;
  }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (S.tilt) return; // the phone itself is the controller
  const k = camera.fov * (Math.PI / 180) / stage.clientHeight;
  S.yaw += dx * k; S.pitch = clamp(S.pitch + dy * k, -1.45, 1.2); S.lastDrag = performance.now();
});
glCanvas.addEventListener('pointerup', (e) => {
  if (!drag) return;
  if (carry) { endCarry(false); drag = null; pick = null; return; }
  const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy), dt = performance.now() - drag.t; drag = null;
  if (moved > 8 || dt > 500) return;
  const r = glCanvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const objs = hit.filter((o) => o.visible !== false);
  const hits = ray.intersectObjects(objs, false);
  // prefer a figure, pawn or relic over the floor under it
  const best = hits.find((h) => h.object.userData.type !== 'room') || hits[0];
  select(best ? best.object.userData : null);
});
glCanvas.addEventListener('pointercancel', () => { if (carry) endCarry(true); drag = null; pick = null; });

// ------------------------------------------------------------------ marks: drag a character onto a room to leave your own "maybe here"
// The mark is yours alone: it lives on this phone, changes no rule and is never shown to anyone else. Drop a character on a room to mark it,
// and anywhere else to take the mark back. While it is in your hand it hangs from your finger like a rag doll (rag-doll physics: js/ar-rag.js).
const marks = {}; // suspect id -> room id
let carry = null; // { s, grabX, grabZ, hx, hz, hover }
const roomByCR = (c, r) => ROOMS.find((x) => x.c === c && x.r === r);
const roomUnder = (x, z) => { const p = roomAtPoint(x, z, W, D); return p ? roomByCR(p.c, p.r) : null; };
const groundAt = (x, z) => (roomUnder(x, z) ? 0.004 : 0); // the floors are 4 mm thick, the tray is flat
const haptic = (v) => { if (!reduced && navigator.vibrate) navigator.vibrate(v); };
const uOf = (s, pos) => pos.x * Math.cos(s.phi) - pos.z * Math.sin(s.phi); // sideways position along the picture's own direction
function replaceMarks(next) { for (const k of Object.keys(marks)) delete marks[k]; Object.assign(marks, next); }
function layout() { // where each character should stand: in the room it is marked on, else in the line-up
  const count = {};
  [...standees].sort((a, b) => SUSPECTS.findIndex((x) => x.id === a.id) - SUSPECTS.findIndex((x) => x.id === b.id)).forEach((s) => {
    const r = marks[s.id] && roomAt(marks[s.id]);
    if (r) { const k = (count[r.id] = count[r.id] || 0); count[r.id]++; const c = roomPos[r.id], o = slotPos(k, W, D); s.tx = c.x + o.x; s.tz = c.z + o.z; }
    else { const lp = lineupPos(SUSPECTS.findIndex((x) => x.id === s.id), SUSPECTS.length, 0.062, TRAY_Z); s.tx = lp.x; s.tz = lp.z; }
  });
}
function refreshBadges() { standees.forEach((s) => { s.badge.visible = S.notes && !!marks[s.id]; }); }
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _inv = new THREE.Matrix4(), _hit = new THREE.Vector3();
function fingerOnPlane(cx, cy, y) { // where the finger's ray meets a flat plane at height y above the board, in the board's own frame
  const r = glCanvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  board.updateWorldMatrix(true, false); _inv.copy(board.matrixWorld).invert();
  const local = ray.ray.clone().applyMatrix4(_inv); _plane.constant = -y;
  return local.intersectPlane(_plane, _hit) ? _hit.clone() : null;
}
function standeeAt(cx, cy) {
  const r = glCanvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(standees.map((s) => s.plane), false);
  return hits.length ? standees.find((s) => s.plane === hits[0].object) : null;
}
const dropRing = new THREE.Mesh(new THREE.PlaneGeometry(0.056, 0.056), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.92, map: canvasTex(128, 128, (g, w, h) => {
  const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.44);
  r.addColorStop(0, 'rgba(6,9,12,.85)'); r.addColorStop(0.75, 'rgba(10,18,18,.45)'); r.addColorStop(1, 'rgba(10,18,18,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(159,232,208,.78)'; g.lineWidth = 4; g.shadowColor = 'rgba(159,232,208,.8)'; g.shadowBlur = 8; g.beginPath(); g.arc(w / 2, h / 2, w * 0.34, 0, 7); g.stroke();
}) }));
dropRing.rotation.x = -Math.PI / 2; dropRing.visible = false; dropRing.renderOrder = 6; board.add(dropRing); // occult mark where the suspended effigy will drop
function setHover(room) { for (const f of Object.values(floors)) f.material.emissive.setHex(0); if (room) floors[room.id].material.emissive.setHex(0x1b332e); }
function startCarry(s, cx, cy) {
  const P = fingerOnPlane(cx, cy, 0.004 + LIFT + s.topY); // the unseen hand pinches the crown, leaving the body dangling below
  if (!P) return false;
  carry = { s, grabX: s.g.position.x - P.x, grabZ: s.g.position.z - P.z, hx: s.g.position.x, hz: s.g.position.z, hover: null };
  s.mode = 'held'; s.vy = 0;
  if (!reduced) { s.phi = s.plane.rotation.y; s.u = uOf(s, s.g.position); s.wLag = 0; s.holdT = 0; s.rig = makeChain(7, s.h, s.u, s.g.position.y + s.topY);
    const crook = (SUSPECTS.indexOf(s.s) % 2 ? 1 : -1) * 0.0026; s.rig.q[2] += crook; s.rig.q[4] += crook * 1.35; } // asymmetric neck-cock on lift
  haptic([8, 30, 16]); select({ type: 'suspect', id: s.id });
  return true;
}
function moveCarry(cx, cy) {
  const P = fingerOnPlane(cx, cy, 0.004 + LIFT + carry.s.topY); if (!P) return;
  carry.hx = clamp(P.x + carry.grabX, -1.5 * W - 0.02, 1.5 * W + 0.02); carry.hz = clamp(P.z + carry.grabZ, -D, TRAY_Z + 0.03);
  const room = roomUnder(carry.hx, carry.hz);
  if ((room && room.id) !== (carry.hover && carry.hover.id)) { carry.hover = room; setHover(room); haptic(5); }
}
function endCarry(cancelled) {
  const s = carry.s, room = cancelled ? (marks[s.id] && roomAt(marks[s.id])) : roomUnder(carry.hx, carry.hz);
  setHover(null);
  replaceMarks(applyDrop(marks, s.id, room ? room.id : null)); layout(); refreshBadges();
  carry = null; s.vy = 0; s.settleT = 0;
  if (reduced || !s.rig) { s.mode = 'idle'; s.rig = null; s.pallor = 0; s.g.position.set(s.tx, groundAt(s.tx, s.tz), s.tz); } else s.mode = 'falling'; // reduced motion: no fall, no wobble
  haptic(30);
  select({ type: 'suspect', id: s.id });
}
function rigStep(s, dt, pinned, restoreK) { // dead-weight marionette step + 3D shroud deformation
  const g = s.g.position;
  stepChain(s.rig, dt, { holdX: s.u, holdY: g.y + s.topY, pinned, restoreK, restTopX: s.u, restTopY: g.y + s.topY, floorY: groundAt(g.x, g.z) + 0.0046 });
  const pos = s.plane.geometry.attributes.position; deformVertices(s.rig, s.orig, pos.array, s.topY, s.h, s.u, g.y, s.wLag); pos.needsUpdate = true;
}
function applyPallor(s, target, k) {
  s.pallor += (target - s.pallor) * k;
  s.plane.material.color.copy(BONE_TINT).lerp(PALLOR_TINT, s.pallor);
  s.plane.material.opacity = 1 - s.pallor * 0.12;
  const groundOff = groundAt(s.g.position.x, s.g.position.z) - s.g.position.y;
  s.base.position.y = groundOff + 0.0015; // physical plinth stays flat on the floorboards like a sliding planchette
  s.base.rotation.y = s.plane.rotation.y;
  s.ring.position.y = groundOff + 0.0035;
  s.stain.position.y = groundOff + 0.0012;
  s.stain.material.opacity = s.pallor * 0.85;
  const sc = 0.8 + s.pallor * 0.45; s.stain.scale.set(sc, sc, 1);
  s.thread.visible = !reduced && s.mode === 'held' && s.pallor > 0.02;
  s.thread.material.opacity = s.pallor * 0.48;
  s.thread.rotation.y = s.plane.rotation.y;
}
function stepMotionAxes(s, prevX, prevZ, dt, k) {
  const dx = s.g.position.x - prevX, dz = s.g.position.z - prevZ;
  const c = Math.cos(s.phi), sn = Math.sin(s.phi);
  s.u += dx * c - dz * sn;
  const dw = dx * sn + dz * c;
  s.wLag += (clamp((dw / Math.max(dt, 1e-3)) * 0.055, -0.036, 0.036) - s.wLag) * k;
}
function gazeYaw(s) { const local = s.g.worldToLocal(_w.clone()); return Math.atan2(local.x, local.z); }
function creepPhi(s, rate) { const d = ((gazeYaw(s) - s.phi + Math.PI * 3) % (Math.PI * 2)) - Math.PI; s.phi += d * rate; s.plane.rotation.y = s.phi; }
function updateStandee(s, t, dt) {
  const g = s.g, on = S.sel && S.sel.type === 'suspect' && S.sel.id === s.id, ease = (k) => Math.min(1, dt * k);
  s.ring.material.opacity += (((on && s.mode === 'idle') ? 0.82 : 0) - s.ring.material.opacity) * ease(10);
  if (s.mode === 'idle') {
    if (Math.abs(g.position.x - s.tx) > 1e-4 || Math.abs(g.position.z - s.tz) > 1e-4) { g.position.x += (s.tx - g.position.x) * ease(10); g.position.z += (s.tz - g.position.z) * ease(10); }
    g.position.y = groundAt(g.position.x, g.position.z);
    s.plane.rotation.y = gazeYaw(s); s.plane.rotation.z = 0; s.base.rotation.y = s.plane.rotation.y;
    s.plane.position.y += ((on ? 0.004 : 0) - s.plane.position.y) * ease(8);
    if (s.pallor > 1e-3) applyPallor(s, 0, ease(8)); else if (s.thread.visible) s.thread.visible = false;
    return;
  }
  s.plane.position.y = 0;
  const prevX = g.position.x, prevZ = g.position.z;
  if (s.mode === 'held') {
    s.holdT += dt;
    g.position.x += (carry.hx - g.position.x) * ease(s.rig ? 14 : 40); g.position.z += (carry.hz - g.position.z) * ease(s.rig ? 14 : 40);
    g.position.y += (groundAt(g.position.x, g.position.z) + LIFT - g.position.y) * ease(11);
    applyPallor(s, 1, ease(7));
    if (s.rig) {
      stepMotionAxes(s, prevX, prevZ, dt, ease(9));
      creepPhi(s, ease(1.5)); // slowly turns in mid-air to keep watching you
      const spasm = Math.sin(s.holdT * 17.3) * Math.sin(s.holdT * 6.7) > 0.8 ? Math.sin(s.holdT * 41) * 0.0085 : 0;
      s.plane.rotation.z = spasm;
      rigStep(s, dt, true, 0);
    } else s.plane.rotation.y = gazeYaw(s);
    return;
  }
  if (s.mode === 'falling') { // dead drop: heavy plummet, zero rebound, crooked slump onto the floorboards
    g.position.x += (s.tx - g.position.x) * ease(18); g.position.z += (s.tz - g.position.z) * ease(18);
    stepMotionAxes(s, prevX, prevZ, dt, ease(10));
    s.vy -= 8.5 * dt; g.position.y += s.vy * dt;
    const floor = groundAt(g.position.x, g.position.z);
    if (g.position.y <= floor) {
      g.position.y = floor; s.vy = 0; s.mode = 'settle'; s.settleT = 0;
      const slump = (SUSPECTS.indexOf(s.s) % 2 ? 1 : -1) * 0.0024; s.rig.p[2] += slump; s.rig.q[2] = s.rig.p[2];
    }
    applyPallor(s, 0.85, ease(8));
    s.plane.rotation.z *= Math.max(0, 1 - dt * 12);
    rigStep(s, dt, false, 0);
    return;
  }
  // settle: brief dead stillness on the floorboards, then drawn upright head-first as if hauled by unseen strings
  s.settleT += dt;
  g.position.x += (s.tx - g.position.x) * ease(16); g.position.z += (s.tz - g.position.z) * ease(16); g.position.y = groundAt(g.position.x, g.position.z);
  stepMotionAxes(s, prevX, prevZ, dt, ease(12));
  s.wLag *= Math.max(0, 1 - dt * 10);
  const rise = clamp((s.settleT - 0.16) / 0.68, 0, 1), restoreK = rise * rise * (3 - 2 * rise);
  creepPhi(s, ease(rise > 0.15 ? 4.5 : 0.4));
  s.plane.rotation.z *= Math.max(0, 1 - dt * 10);
  applyPallor(s, 1 - rise, ease(6));
  rigStep(s, dt, false, restoreK);
  const { off, speed } = chainUnrest(s.rig, s.u, g.position.y + s.topY);
  if (s.settleT > 0.9 && off < 0.0012 && speed < 8e-5 && Math.abs(s.wLag) < 4e-4) {
    const pos = s.plane.geometry.attributes.position; pos.array.set(s.orig); pos.needsUpdate = true;
    applyPallor(s, 0, 1); s.plane.rotation.z = 0; s.rig = null; s.mode = 'idle';
  }
}

// ------------------------------------------------------------------ phone sensors
const _e = new THREE.Euler(), _q1 = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2), _q0 = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1);
const screenAngle = () => (screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle : window.orientation || 0);
function deviceQuat(q, d) {
  _e.set(rad(d.beta), rad(d.alpha), -rad(d.gamma), 'YXZ'); q.setFromEuler(_e);
  q.multiply(_q1); q.multiply(_q0.setFromAxisAngle(_z, -rad(screenAngle())));
}
let listening = false;
function onOrient(e) { if (e.beta != null && e.alpha != null) { const first = !S.dev; S.dev = { alpha: e.alpha, beta: e.beta, gamma: e.gamma }; if (first && S.wantTilt) setTilt(true, true); } }
function listen() { if (!listening) { listening = true; addEventListener('deviceorientation', onOrient); } }
function setTilt(on, auto) {
  if (!on && S.tilt) { _eu.setFromQuaternion(camera.quaternion, 'YXZ'); S.yaw = _eu.y; S.pitch = clamp(_eu.x, -1.45, 1.2); } // keep the view where it is
  S.tilt = on; $('#b-tilt').setAttribute('aria-pressed', String(on)); $('#b-tilt').textContent = on ? 'Tilt on' : 'Tilt';
  if (on) { place(); if (!auto) say('Tilt is on', 'Turn your phone to look around the table. Tap Place to move the board.'); }
}
async function askTilt() {
  S.wantTilt = true;
  const DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === 'function') { // iPhone: needs a tap
    let r = 'denied'; try { r = await DOE.requestPermission(); } catch { /* ignore */ }
    if (r !== 'granted') { S.wantTilt = false; return say('Motion is blocked', 'You can still drag to look around. Allow motion in Safari settings to use tilt.'); }
  }
  listen();
  if (S.dev) return setTilt(true);
  say('Looking for the tilt sensor', 'Move your phone a little.');
  setTimeout(() => { if (!S.dev) { S.wantTilt = false; say('No tilt sensor here', 'Drag to look around instead. Every part still works by touch.'); } }, 1500);
}
// Tilt should be the default where it works: Android needs no permission, so just listen and switch on at the first real reading.
if (!(window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === 'function')) { S.wantTilt = true; listen(); }

// ------------------------------------------------------------------ camera
async function toggleCamera() {
  const btn = $('#b-cam');
  if (S.cam) { stopCam(); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return say('No camera here', 'This page needs https and a camera. The stand-in table stays on.');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    video.srcObject = stream; video.hidden = false; await video.play().catch(() => {});
    tableCanvas.style.display = 'none'; S.cam = true; btn.setAttribute('aria-pressed', 'true'); btn.textContent = 'Camera on';
    say('Point at a table', 'Tap Place when the board should land. The picture never leaves your phone.');
  } catch { say('Camera is blocked', 'Nothing is lost. The stand-in table stays on.'); }
}
function stopCam() {
  const s = video.srcObject; if (s) s.getTracks().forEach((t) => t.stop());
  video.srcObject = null; video.hidden = true; tableCanvas.style.display = ''; S.cam = false;
  $('#b-cam').setAttribute('aria-pressed', 'false'); $('#b-cam').textContent = 'Camera';
}
addEventListener('pagehide', stopCam);

$('#b-cam').addEventListener('click', toggleCamera);
$('#b-place').addEventListener('click', () => { place(); say('Board placed', 'It stays where you put it. Move the phone to look around it.'); });
$('#b-tilt').addEventListener('click', () => { if (S.tilt) { S.wantTilt = false; setTilt(false); say('Tilt is off', 'Drag the picture to look around.'); } else askTilt(); });
const sheet = $('#sheet'), card = $('#card'), arrowEl = $('#arrow'), boardArrowEl = $('#arrow-board');
function openSheet(on) { sheet.hidden = !on; card.hidden = on; $('#b-clues').setAttribute('aria-pressed', String(on)); }
$('#b-clues').addEventListener('click', () => openSheet(sheet.hidden));
$('#sheet-close').addEventListener('click', () => openSheet(false));
$('#t-notes').addEventListener('click', () => { S.notes = !S.notes; $('#t-notes').setAttribute('aria-pressed', String(S.notes)); $('#t-notes').textContent = S.notes ? 'My marks: on' : 'My marks: off'; notesGroup.visible = S.notes; refreshBadges(); });
$('#t-list').addEventListener('click', () => { clueObjs.forEach((o) => markFound(o, true)); say('Every clue is shown as text', 'Open Clues to read them. You did not have to look around.'); });

// ------------------------------------------------------------------ frame loop
const _w = new THREE.Vector3(), _eu = new THREE.Euler(), _fwd = new THREE.Vector3(), _cp = new THREE.Vector3(), _dir = new THREE.Vector3(), _qi = new THREE.Quaternion();
let raf = 0, last = 0;
function frame(now) {
  raf = requestAnimationFrame(frame);
  const t = now / 1000, dt = Math.min(0.1, (now - last) / 1000 || 0.016); last = now;

  // camera
  aimCamera(!S.tilt && now - S.lastDrag > 2500 && !reduced ? Math.sin(t * 0.45) * 0.045 : 0);
  if (!S.cam) { // slide the stand-in table so it moves with the board
    _eu.setFromQuaternion(camera.quaternion, 'YXZ');
    const k = stage.clientHeight / (camera.fov * Math.PI / 180), limX = stage.clientWidth * 0.11, limY = stage.clientHeight * 0.11;
    tableCanvas.style.transform = `translate(${clamp(_eu.y * k, -limX, limX)}px, ${clamp(_eu.x * k, -limY, limY)}px)`;
  }

  // board arrives
  if (placeT0 >= 0) {
    const p = clamp((now - placeT0) / 700, 0, 1), e = reduced ? 1 : easeOutBack(p);
    board.scale.setScalar(0.88 + 0.12 * e);
    pulse.material.opacity = reduced ? 0 : (1 - p) * 0.8; pulse.scale.setScalar(0.5 + p * 1.6);
    if (p >= 1) placeT0 = -2;
  }

  scene.updateMatrixWorld();

  // clues: a faint glow shows where one hangs; keep your view on it for about half a second to materialize its 3D frame & read it
  camera.getWorldDirection(_fwd); camera.getWorldPosition(_w); _qi.copy(camera.quaternion).invert();
  let near = null, nearD = 9;
  for (const o of clueObjs) {
    if (!reduced) o.g.position.y = o.baseY + Math.sin(t * 1.15 + o.c.a * 3) * 0.018;
    o.g.getWorldPosition(_cp); _dir.copy(_cp).sub(_w).normalize();
    const d = Math.acos(clamp(_fwd.dot(_dir), -1, 1));
    if (!o.found) {
      o.p = clamp(o.p + (d < 0.2 ? dt / 0.7 : -dt / 1.4), 0, 1);
      const vis = o.p * o.p;
      o.sp.material.opacity = vis;
      syncClue3D(o, vis);
      o.glow.material.opacity = (0.7 + clamp(1 - d / 0.9, 0, 1) * 0.3) * (1 - o.p);
      const pulse = reduced ? 1 : 1 + 0.07 * Math.sin(t * 2.4 + o.c.a * 5); o.glow.scale.set(0.3 * pulse, 0.3 * pulse, 1);
      if (d < nearD) { nearD = d; near = o; }
      if (o.p >= 1) markFound(o);
    } else {
      const k = reduced ? 1 : 1 + 0.3 * Math.max(0, 1 - (t - o.foundT) / 0.5);
      o.sp.scale.set(o.w * k, o.h * k, 1); o.glow.visible = false;
      if (o.frame3d) o.frame3d.rotation.z = reduced ? 0 : Math.sin(t * 0.85 + o.c.a * 2) * 0.025;
    }
  }
  // arrows at the edge of the picture: one to the nearest clue you have not found, one to the board when it is out of view
  const pointAt = (el, world, rxk, ryk) => {
    _dir.copy(world).sub(_w).applyQuaternion(_qi);
    const ang = Math.atan2(_dir.y, _dir.x);
    el.style.transform = `translate(-50%, -50%) translate(${Math.cos(ang) * stage.clientWidth * rxk}px, ${-Math.sin(ang) * stage.clientHeight * ryk}px)`;
    el.firstElementChild.style.transform = `rotate(${-ang}rad)`;
  };
  const clueArrow = sheet.hidden && near && nearD > 0.55 && now - lastFindAt > 3000;
  arrowEl.hidden = !clueArrow;
  if (clueArrow) { near.g.getWorldPosition(_cp); pointAt(arrowEl, _cp, 0.38, 0.33); }
  anchor.getWorldPosition(_cp); _dir.copy(_cp).sub(_w).normalize();
  if (Math.acos(clamp(_fwd.dot(_dir), -1, 1)) > 0.8) { if (boardOffSince < 0) boardOffSince = now; } else boardOffSince = -1;
  const boardArrow = sheet.hidden && boardOffSince >= 0 && now - boardOffSince > 2000;
  boardArrowEl.hidden = !boardArrow;
  if (boardArrow) pointAt(boardArrowEl, _cp, 0.3, 0.26);

  // relics: float above their curio shelf tokens, turn slowly, flicker candlelight
  for (const g of relicGroups) {
    const m = g.userData.mover;
    m.position.y = 0.0085 + (reduced ? 0 : Math.sin(t * 1.5 + g.position.z * 32 + g.position.x * 20) * 0.0015);
    if (!reduced) m.rotation.y = t * 0.65 + g.position.z * 8;
    const l = m.getObjectByName('light');
    if (l) {
      l.intensity = 0.0026 + (reduced ? 0 : Math.sin(t * 13) * 0.0004 + Math.sin(t * 5.7) * 0.0004);
      const f = m.getObjectByName('flame'); if (f) f.scale.y = 1.75 + (reduced ? 0 : Math.sin(t * 13) * 0.18);
    }
  }

  // haunted miniature room life (all motion halted under prefers-reduced-motion)
  if (animProps.horse) animProps.horse.rotation.z = reduced ? 0 : Math.sin(t * 1.85) * 0.095;
  if (animProps.pendulum) animProps.pendulum.rotation.z = reduced ? 0 : Math.sin(t * Math.PI) * 0.16;
  if (animProps.turnRing && !reduced) animProps.turnRing.rotation.y = t * 0.55;
  if (animProps.studyLight && !reduced) animProps.studyLight.intensity = 0.0032 + Math.sin(t * 7.4) * 0.00045;
  if (animProps.hearthLight && !reduced) animProps.hearthLight.intensity = 0.0028 + Math.sin(t * 5.1) * 0.0005;
  if (animProps.frostMats.length && !reduced) {
    const pulseFrost = 0.82 + Math.sin(t * 1.35) * 0.18;
    for (const fm of animProps.frostMats) fm.mat.opacity = fm.base * pulseFrost;
  }

  // suspects face you (around the up axis only, like a standee), the selected one glows
  camera.getWorldPosition(_w);
  for (const s of standees) updateStandee(s, t, dt);
  dropRing.visible = !!carry; if (carry) dropRing.position.set(carry.hx, groundAt(carry.hx, carry.hz) + 0.002, carry.hz);

  // the Whisper: drifts room to room in her 3D shroud, bobs, flickers, trails mist
  if (ghost) {
    const G = ghost;
    if (t - G.t0 > 7.5) { G.t0 = t; G.tourIdx = (G.tourIdx + 1) % GHOST_TOUR.length; G.room = GHOST_TOUR[G.tourIdx]; const c = roomPos[G.room]; G.from.copy(G.group.position); G.to.set(c.x, GHOST_Y, c.z); }
    const p = clamp((t - G.t0) / 3, 0, 1), se = p * p * (3 - 2 * p);
    G.group.position.lerpVectors(G.from, G.to, se); G.group.position.y = GHOST_Y + (reduced ? 0 : Math.sin(t * 1.3) * 0.008);
    const lg = G.group.worldToLocal(_w.clone()); G.plane.rotation.y = Math.atan2(lg.x, lg.z); G.plane.rotation.z = reduced ? 0 : Math.sin(t * 0.9) * 0.025;
    const flick = !reduced && (Math.sin(t * 2.1) * Math.sin(t * 3.7) > 0.93);
    G.plane.material.opacity = flick ? 0.55 : 0.92; G.glow.material.opacity = 0.5 + (reduced ? 0 : Math.sin(t * 1.1) * 0.08);
    for (const sm of G.shroudMats) sm.mat.opacity = sm.base * (flick ? 0.55 : 1);
    for (let i = 0; i < G.seed.length; i++) {
      const sd = G.seed[i]; const u = (t * sd.s * 3 + sd.p) % 1;
      G.pos[i * 3] = Math.cos(sd.a + t * 0.3) * sd.r * (0.6 + u * 0.6); G.pos[i * 3 + 1] = u * 0.22; G.pos[i * 3 + 2] = Math.sin(sd.a + t * 0.3) * sd.r * (0.6 + u * 0.6);
    }
    G.mist.geometry.attributes.position.needsUpdate = true;
    G.mist.material.opacity = reduced ? 0.25 : 0.55;
  }
  renderer.render(scene, camera);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } });

// ------------------------------------------------------------------ go
addEventListener('resize', resize);
resize();
_eu.set(S.pitch, S.yaw, 0, 'YXZ'); camera.quaternion.setFromEuler(_eu);
place();
const kitPromise = loadGlb('models/spirit-table.glb', THREE).catch(() => null);
Promise.all([buildFigures(), kitPromise]).then(([, kit]) => {
  if (kit) apply3DKit(kit);
  layout(); standees.forEach((x) => x.g.position.set(x.tx, 0, x.tz));
  const mk = q.get('mark'); // ?mark=cora:kitchen,pike:hall puts those marks on at the start (for testing)
  if (mk) { const next = {}; mk.split(',').forEach((pair) => { const [id, room] = pair.split(':'); if (SUSPECTS.some((x) => x.id === id) && roomAt(room)) next[id] = room; }); replaceMarks(next); layout(); standees.forEach((x) => x.g.position.set(x.tx, groundAt(x.tx, x.tz), x.tz)); refreshBadges(); }
  const want = q.get('sel');
  if (want) { const s = SUSPECTS.find((x) => x.id === want); select(s ? { type: 'suspect', id: s.id } : { type: want === 'ghost' ? 'ghost' : 'room', id: want }); }
}).catch((err) => say('Could not load the figures', String(err && err.message || err)));
raf = requestAnimationFrame(frame);
{ // test and screenshot helpers: ?look=pin2 turns the view to a clue (&lookoff=0.35 starts beside it), ?found=all or ?found=pin1,pin2 marks clues found, ?sheet=1 opens the list
  const look = CLUES.find((c) => c.id === q.get('look'));
  if (look) { S.yaw = anchor.rotation.y - look.a; S.pitch = look.e - (Number(q.get('lookoff')) || 0); S.lastDrag = performance.now(); } // lookoff: start this many radians below the clue
  const f = q.get('found');
  if (f) clueObjs.filter((o) => f === 'all' || f.split(',').includes(o.c.id)).forEach((o) => markFound(o, true));
  if (q.get('sheet')) openSheet(true);
}
renderClues();
window.__ar = { step: (dt, n = 1) => { for (let i = 0; i < n; i++) { camera.getWorldPosition(_w); for (const s of standees) updateStandee(s, 0, dt); } }, // test hook: advance the characters without drawing
  marks, layout, place, aim: aimCamera, select, S, camera, anchor, ghost: () => ghost, standees, floors, hit, clues: clueObjs, relics: relicGroups, pawns: pawnGroups, animProps, markFound };
