// Spirit table: a MOCKUP of a private 3D board that only shows through a phone.
// A haunted-house floor plan sits on your real table (camera) or on a stand-in table, with the six Suspects standing in
// its rooms and the Whisper floating above. Nothing here is game logic: every position, name and note is sample data.
// Clues (a code in four pieces, an address, a phone number, a date) hang in a ring around you, out of sight until you
// look at them. All the numbers are made up: the phone number is in the 555-01xx range that is reserved for fiction.
// Anchoring is 3-DoF (the phone's tilt turns the view; walking toward the board does not move you closer). A real build
// would use WebXR hit-test on Android and this tilt fallback on iPhone, where Safari has no WebXR.
import * as THREE from './vendor/three.js';

const $ = (s) => document.querySelector(s);
const q = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TABLE_Y = -0.7; // metres below the phone: where the table is assumed to be
const rad = (d) => (d * Math.PI) / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOutBack = (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

// ------------------------------------------------------------------ sample data
const W = 0.115, D = 0.095, WALL = 0.004;
const ROOMS = [
  { id: 'library', name: 'Library', c: 0, r: 0, floor: 0x35402f, rug: 0x5a2a2a },
  { id: 'study', name: 'Study', c: 1, r: 0, floor: 0x4a2c26, rug: 0x2a3a4a },
  { id: 'nursery', name: 'Nursery', c: 2, r: 0, floor: 0x3a4658, rug: 0x7a6a8a },
  { id: 'kitchen', name: 'Kitchen', c: 0, r: 1, floor: 0x4a5a44, rug: 0x6a5a3a },
  { id: 'hall', name: 'Hall', c: 1, r: 1, floor: 0x5a4a3a, rug: 0x6a2a2e },
  { id: 'cellar', name: 'Cellar', c: 2, r: 1, floor: 0x2f343c, rug: 0x23262c },
];
const roomAt = (id) => ROOMS.find((r) => r.id === id);
const roomCenter = (r) => new THREE.Vector3((r.c - 1) * W, 0, (r.r - 0.5) * D);
const SUSPECTS = [
  { id: 'cora', name: 'Cora Bell', room: 'library', dx: -0.028, dz: 0.012 },
  { id: 'vane', name: 'Lady Vane', room: 'hall', dx: -0.03, dz: -0.004 },
  { id: 'pike', name: 'Dr. Pike', room: 'hall', dx: 0.028, dz: 0.012 },
  { id: 'thorne', name: 'Thorne', room: 'kitchen', dx: 0.0, dz: 0.012 },
  { id: 'percy', name: 'Percy', room: 'cellar', dx: 0.0, dz: 0.012 },
  { id: 'dunmore', name: 'Dunmore', room: 'study', dx: -0.026, dz: 0.014 },
];
const RELICS = [
  { id: 'key', name: 'The brass key', room: 'library', dx: 0.03, dz: 0.022 },
  { id: 'candle', name: 'The candlestick', room: 'study', dx: 0.03, dz: 0.02 },
  { id: 'locket', name: 'The locket', room: 'nursery', dx: -0.02, dz: 0.012 },
];
const NOTES = [
  { room: 'cellar', text: '✕ ruled out', color: '#ff9a9a' },
  { room: 'kitchen', text: '? maybe', color: '#f2c879' },
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
const CLUE_R = 1.5; // metres from you
const GHOST_TOUR = ['hall', 'kitchen', 'library', 'study', 'nursery', 'cellar'];

// ------------------------------------------------------------------ state
const S = { cam: false, tilt: false, notes: true, yaw: Number(q.get('yaw')) || 0, pitch: q.has('pitch') ? Number(q.get('pitch')) : -0.88,
  sel: null, dev: null, lastDrag: -1e9 };

// ------------------------------------------------------------------ renderer
const stage = $('#stage'), glCanvas = $('#gl'), tableCanvas = $('#table'), video = $('#cam');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true, powerPreference: 'low-power' });
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.02, 12);
scene.add(camera);
const anchor = new THREE.Group();
scene.add(anchor);

scene.add(new THREE.HemisphereLight(0x9aa6c8, 0x20150c, 1.05));
const sun = new THREE.DirectionalLight(0xfff0dc, 1.25);
sun.position.set(-0.6, 1.2, 0.9);
scene.add(sun);

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

// ------------------------------------------------------------------ small helpers
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const radialTex = (rgb) => canvasTex(128, 128, (g, w, h) => {
  const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  r.addColorStop(0, `rgba(${rgb},1)`); r.addColorStop(0.35, `rgba(${rgb},.35)`); r.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});
function labelTex(text, size = 54, color = '#efe3c8') {
  return canvasTex(256, 64, (g, w, h) => {
    g.font = `600 ${size}px Georgia, "Times New Roman", serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(text.toUpperCase(), w / 2 + 2, h / 2 + 3);
    g.fillStyle = color; g.fillText(text.toUpperCase(), w / 2, h / 2);
  });
}
function pillTex(text, color) {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = 'rgba(12,12,18,.82)'; g.beginPath(); g.roundRect(4, 6, w - 8, h - 12, 24); g.fill();
    g.strokeStyle = color; g.lineWidth = 3; g.stroke();
    g.font = '600 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 1);
  });
}
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...o });
function box(parent, w, h, d, x, z, color, y0 = 0.004, o = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std(color, o));
  m.position.set(x, y0 + h / 2, z); parent.add(m); return m;
}
function cyl(parent, r, h, x, z, color, y0 = 0.004, o = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), std(color, o));
  m.position.set(x, y0 + h / 2, z); parent.add(m); return m;
}

// ------------------------------------------------------------------ the board
const board = new THREE.Group();
anchor.add(board);
const hit = []; // things a tap can select
const floors = {}; // room id -> floor mesh
const roomPos = {}; // room id -> centre (board space)
const relicGroups = [];

(function buildBoard() {
  const slabW = 3 * W + 0.034, slabD = 2 * D + 0.034;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(slabW, 0.014, slabD), std(0x2b1a10, { roughness: 0.55 }));
  slab.position.y = -0.007; board.add(slab);
  const inlay = new THREE.Mesh(new THREE.BoxGeometry(slabW + 0.006, 0.003, slabD + 0.006), std(0x9a7a3a, { metalness: 0.85, roughness: 0.35 }));
  inlay.position.y = -0.0125; board.add(inlay);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42), new THREE.MeshBasicMaterial({
    map: canvasTex(256, 180, (g, w, h) => { g.shadowColor = 'rgba(0,0,0,.95)'; g.shadowBlur = 34; g.fillStyle = '#000'; g.fillRect(w * 0.22, h * 0.22, w * 0.56, h * 0.56); }),
    transparent: true, depthWrite: false, opacity: 0.6, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0.012, -0.0145, 0.02); board.add(shadow);

  for (const r of ROOMS) {
    const c = roomCenter(r); roomPos[r.id] = c;
    const fm = std(r.floor, { roughness: 0.9, emissive: 0x000000 });
    const f = new THREE.Mesh(new THREE.BoxGeometry(W - 0.001, 0.004, D - 0.001), fm);
    f.position.set(c.x, 0.002, c.z); f.userData = { type: 'room', id: r.id }; board.add(f); floors[r.id] = f; hit.push(f);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.62, D * 0.5), std(r.rug, { roughness: 1 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(c.x, 0.0042, c.z - 0.004); board.add(rug);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.0165), new THREE.MeshBasicMaterial({ map: labelTex(r.name), transparent: true, depthWrite: false }));
    lab.rotation.x = -Math.PI / 2; lab.position.set(c.x, 0.0046, c.z + (r.r === 0 ? 0.014 : D / 2 - 0.0125)); board.add(lab);
  }

  // walls: a cutaway dollhouse. Back and side walls are tall, the front is open so you can see in.
  const wallMat = std(0x241812, { roughness: 0.8 });
  const wall = (w, h, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat); m.position.set(x, 0.004 + h / 2, z); board.add(m); return m; };
  wall(3 * W + 2 * WALL, 0.05, WALL, 0, -D - WALL / 2);
  wall(WALL, 0.05, 2 * D, -1.5 * W - WALL / 2, 0);
  wall(WALL, 0.05, 2 * D, 1.5 * W + WALL / 2, 0);
  wall(1.1 * W, 0.006, WALL, -W * 0.95, D + WALL / 2); wall(1.1 * W, 0.006, WALL, W * 0.95, D + WALL / 2); // front lip, door gap in the Hall
  for (const x of [-0.5 * W, 0.5 * W]) for (const r of [0, 1]) { // vertical partitions with door gaps
    const cz = (r - 0.5) * D;
    wall(WALL, 0.024, D * 0.3, x, cz - D * 0.35); wall(WALL, 0.024, D * 0.3, x, cz + D * 0.35);
  }
  for (const c of [-1, 0, 1]) { // the horizontal partition, with a door gap in each room
    wall(W * 0.3, 0.014, WALL, c * W - W * 0.35, 0); wall(W * 0.3, 0.014, WALL, c * W + W * 0.35, 0);
  }

  // furniture, tiny and plain: enough to read each room
  const rp = (id) => roomPos[id];
  let c = rp('library'); box(board, 0.06, 0.04, 0.008, c.x - 0.005, c.z - D / 2 + 0.008, 0x4a2f1d); cyl(board, 0.011, 0.016, c.x - 0.03, c.z + 0.0, 0x5a3d26);
  c = rp('study'); box(board, 0.04, 0.014, 0.02, c.x + 0.005, c.z - 0.022, 0x5a3d26); box(board, 0.012, 0.012, 0.012, c.x + 0.005, c.z - 0.004, 0x3a2a20);
  c = rp('nursery'); box(board, 0.04, 0.01, 0.022, c.x + 0.02, c.z - 0.026, 0x8a8aa6); box(board, 0.012, 0.006, 0.01, c.x + 0.032, c.z - 0.026, 0xd8d2c4, 0.014); box(board, 0.012, 0.012, 0.012, c.x - 0.03, c.z + 0.012, 0xa86a4a);
  c = rp('kitchen'); box(board, 0.026, 0.026, 0.02, c.x - 0.034, c.z - 0.026, 0x1c1c20, 0.004, { metalness: 0.4 }); box(board, 0.036, 0.014, 0.02, c.x + 0.022, c.z - 0.018, 0x6a5538);
  c = rp('hall'); for (let i = 0; i < 4; i++) box(board, 0.04, 0.006 * (i + 1), 0.007, c.x - 0.03, c.z - 0.03 + i * 0.007, 0x4a3426);
  box(board, 0.009, 0.042, 0.009, c.x + 0.044, c.z - 0.034, 0x3a2a1c);
  c = rp('cellar'); for (const [dx, dz] of [[-0.03, -0.025], [0.0, -0.03], [0.03, -0.02]]) cyl(board, 0.011, 0.022, c.x + dx, c.z + dz, 0x4a3320);

  // relics
  for (const rl of RELICS) {
    const c0 = rp(rl.room), g = new THREE.Group(); g.position.set(c0.x + rl.dx, 0.004, c0.z + rl.dz); g.userData = { type: 'relic', id: rl.id };
    const gold = std(0xc8a44a, { metalness: 0.85, roughness: 0.3, emissive: 0x3a2800 });
    const mover = new THREE.Group(); mover.position.y = 0.016; g.add(mover);
    if (rl.id === 'key') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0017, 8, 20), gold); ring.position.y = 0.008; mover.add(ring);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.016, 8), gold); shaft.position.y = -0.002; mover.add(shaft);
      const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.0025, 0.0016), gold); teeth.position.set(0.003, -0.008, 0); mover.add(teeth);
    } else if (rl.id === 'locket') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 16, 12), gold); body.scale.set(1, 1.15, 0.45); mover.add(body);
      const chain = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.0009, 6, 24), gold); chain.position.y = 0.011; mover.add(chain);
    } else {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.02, 14), std(0xf1e3c0, { emissive: 0x2a2010 })); stick.position.y = -0.004; mover.add(stick);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.0034, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc064 })); flame.scale.y = 1.7; flame.position.y = 0.011; flame.name = 'flame'; mover.add(flame);
      const light = new THREE.PointLight(0xffa850, 0.0035, 0.25, 2); light.position.y = 0.014; light.name = 'light'; mover.add(light);
    }
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.034, 0.034), new THREE.MeshBasicMaterial({ map: radialTex('255,200,110'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.0006; g.add(halo);
    const hitbox = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); hitbox.position.y = 0.014; hitbox.userData = g.userData; g.add(hitbox); hit.push(hitbox);
    g.userData.mover = mover; relicGroups.push(g); board.add(g);
  }
})();

// ------------------------------------------------------------------ figures (cut-out art stood up like game pieces)
const loader = new THREE.TextureLoader();
const loadTex = (url) => new Promise((res, rej) => loader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, rej));
const standees = []; // { id, mesh, ring, base }
let ghost = null; // { group, plane, glow, light, mist }

async function buildFigures() {
  const whisperTex = loadTex('art/whisper.webp');
  const ringTex = canvasTex(128, 128, (g, w, h) => { g.strokeStyle = 'rgba(185,166,255,.95)'; g.lineWidth = 7; g.shadowColor = 'rgba(185,166,255,1)'; g.shadowBlur = 14; g.beginPath(); g.arc(w / 2, h / 2, w * 0.36, 0, 7); g.stroke(); });
  await Promise.all(SUSPECTS.map(async (s) => {
    const tex = await loadTex(`art/${s.id}.webp`);
    const h = 0.105, w = h * (tex.image.width / tex.image.height);
    const g = new THREE.Group();
    const c0 = roomPos[s.room]; g.position.set(c0.x + s.dx, 0.004, c0.z + s.dz);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0135, 0.003, 24), std(0x1a1410, { roughness: 0.4, metalness: 0.4 })); base.position.y = 0.0015; g.add(base);
    const geo = new THREE.PlaneGeometry(w, h); geo.translate(0, h / 2 + 0.003, 0);
    const plane = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide, color: 0xdcd7cf, toneMapped: false }));
    plane.userData = { type: 'suspect', id: s.id }; g.add(plane); hit.push(plane);
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, opacity: 0 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.0035; g.add(ring);
    board.add(g); standees.push({ id: s.id, g, plane, ring, s });
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
  ghost = { group, plane, glow, light, mist, seed, pos, from: new THREE.Vector3(), to: new THREE.Vector3(), t0: performance.now() / 1000, room: 'hall', tourIdx: 0 };
  const h0 = roomPos.hall; group.position.set(h0.x, GHOST_Y, h0.z); ghost.from.copy(group.position); ghost.to.copy(group.position);
}

// the private layer: this player's own notebook marks
const notesGroup = new THREE.Group(); board.add(notesGroup);
for (const n of NOTES) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: pillTex(n.text, n.color), transparent: true, depthTest: false }));
  const c = roomCenter(roomAt(n.room)); sp.position.set(c.x, 0.17, c.z + 0.01); sp.scale.set(0.075, 0.0188, 1); sp.renderOrder = 9; notesGroup.add(sp);
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.0009, 0.158, 0.0009), new THREE.MeshBasicMaterial({ color: new THREE.Color(n.color), transparent: true, opacity: 0.55, depthWrite: false }));
  stem.position.set(c.x, 0.004 + 0.079, c.z + 0.01); notesGroup.add(stem);
}

// ------------------------------------------------------------------ clues in a ring around you
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
  return canvasTex(256, 320, (g, w, h) => { // a torn calendar page
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 14; g.fillStyle = '#efe6cf'; g.beginPath(); g.moveTo(16, 16); g.lineTo(w - 16, 16); g.lineTo(w - 16, h - 36);
    for (let x = w - 16, i = 0; x > 16; x -= 14, i++) g.lineTo(x, h - 36 + (i % 2 ? 8 : -2));
    g.closePath(); g.fill(); g.shadowBlur = 0;
    g.fillStyle = '#a83a3a'; g.fillRect(16, 16, w - 32, 54);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.font = '700 32px Georgia, serif'; g.fillText(c.month, w / 2, 44);
    g.fillStyle = '#2a2018'; g.font = '700 128px Georgia, serif'; g.fillText(c.day, w / 2, 150);
    g.font = '600 40px Georgia, serif'; g.fillText(c.year, w / 2, 238);
  });
}
const CLUE_SIZE = { pin: [0.36, 0.36], address: [0.62, 0.155], phone: [0.62, 0.155], date: [0.3, 0.375] };
const cluesRoot = new THREE.Group(); scene.add(cluesRoot);
const clueObjs = [];
const coldSpot = radialTex('143,227,212');
for (const c of CLUES) {
  const g = new THREE.Group();
  g.position.set(Math.sin(c.a) * Math.cos(c.e) * CLUE_R, Math.sin(c.e) * CLUE_R, -Math.cos(c.a) * Math.cos(c.e) * CLUE_R);
  const [sw, sh] = CLUE_SIZE[c.kind];
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: clueTex(c), transparent: true, depthWrite: false, opacity: 0 }));
  sp.scale.set(sw, sh, 1); sp.renderOrder = 8; sp.userData = { type: 'clue', id: c.id };
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: coldSpot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.2 }));
  glow.scale.set(0.42, 0.42, 1); glow.renderOrder = 7;
  g.add(glow); g.add(sp); cluesRoot.add(g);
  clueObjs.push({ c, g, sp, glow, w: sw, h: sh, p: 0, found: false, foundT: -9 });
}
let lastFindAt = performance.now();
const clueCount = () => clueObjs.filter((o) => o.found).length;
function buzz() { if (!reduced && navigator.vibrate) navigator.vibrate([18, 50, 18]); }
function markFound(o, quiet) {
  if (o.found) return;
  o.found = true; o.p = 1; o.foundT = performance.now() / 1000; o.sp.material.opacity = 1; hit.push(o.sp);
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

// ------------------------------------------------------------------ placing the board
let placeT0 = -1;
const pulse = new THREE.Mesh(new THREE.RingGeometry(0.19, 0.196, 64), new THREE.MeshBasicMaterial({ color: 0xb9a6ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
pulse.rotation.x = -Math.PI / 2; pulse.position.y = -0.0136; board.add(pulse);
const _f = new THREE.Vector3();
function place() {
  camera.getWorldDirection(_f);
  let fx = _f.x, fz = _f.z; const flat = Math.hypot(fx, fz);
  if (flat < 0.2) { fx = -Math.sin(S.yaw); fz = -Math.cos(S.yaw); } else { fx /= flat; fz /= flat; }
  let dist = 0.85;
  if (_f.y < -0.15) dist = clamp((-TABLE_Y / -_f.y) * flat, 0.5, 1.4); // where the centre of the view meets the table
  anchor.position.set(fx * dist, TABLE_Y, fz * dist);
  anchor.rotation.y = Math.atan2(-fx, -fz); // the board's front edge faces you
  cluesRoot.rotation.y = anchor.rotation.y; // and the ring of clues is centred on the same direction
  placeT0 = performance.now();
}

// ------------------------------------------------------------------ the card under the picture
const cardT = $('#card-t'), cardP = $('#card-p');
function say(t, p) { cardT.textContent = t; cardP.textContent = p; }
const peopleIn = (room) => SUSPECTS.filter((s) => s.room === room).map((s) => s.name);
function select(hitData) {
  for (const f of Object.values(floors)) f.material.emissive.setHex(0x000000);
  S.sel = hitData || null;
  if (!hitData) return say('Your private table', 'Only your phone sees the board, the ghost and the clues. Turn around.');
  if (hitData.type === 'suspect') { const s = SUSPECTS.find((x) => x.id === hitData.id); const note = NOTES.find((n) => n.room === s.room); say(s.name, `Standing in the ${roomAt(s.room).name}. ${note ? 'Your note there: ' + note.text + '.' : 'You have no note there.'}`); }
  else if (hitData.type === 'room') {
    const r = roomAt(hitData.id); floors[r.id].material.emissive.setHex(0x3a2a18);
    const who = peopleIn(r.id), relics = RELICS.filter((x) => x.room === r.id).map((x) => x.name);
    say(r.name, [who.length ? who.join(' and ') + ' here.' : 'Nobody here.', relics.length ? relics.join(', ') + ' is in this room.' : ''].join(' ').trim());
  } else if (hitData.type === 'relic') say(RELICS.find((x) => x.id === hitData.id).name, 'A relic. One of these is what holds the ghost here.');
  else if (hitData.type === 'clue') { const o = clueObjs.find((x) => x.c.id === hitData.id); say(o.c.title, `It says ${o.c.text}.`); }
  else if (hitData.type === 'ghost') say('The Whisper', 'She is not on the TV. Only your phone shows her.');
}

// ------------------------------------------------------------------ input: drag to look, tap to pick
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let drag = null;
glCanvas.addEventListener('pointerdown', (e) => { glCanvas.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() }; });
glCanvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (S.tilt) return; // the phone itself is the controller
  const k = camera.fov * (Math.PI / 180) / stage.clientHeight;
  S.yaw += dx * k; S.pitch = clamp(S.pitch + dy * k, -1.45, 1.2); S.lastDrag = performance.now();
});
glCanvas.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy), dt = performance.now() - drag.t; drag = null;
  if (moved > 8 || dt > 500) return;
  const r = glCanvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const objs = hit.filter((o) => o.visible !== false);
  const hits = ray.intersectObjects(objs, false);
  // prefer a figure or relic over the floor under it
  const best = hits.find((h) => h.object.userData.type !== 'room') || hits[0];
  select(best ? best.object.userData : null);
});
glCanvas.addEventListener('pointercancel', () => { drag = null; });

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
const sheet = $('#sheet'), card = $('#card'), arrowEl = $('#arrow');
function openSheet(on) { sheet.hidden = !on; card.hidden = on; $('#b-clues').setAttribute('aria-pressed', String(on)); }
$('#b-clues').addEventListener('click', () => openSheet(sheet.hidden));
$('#sheet-close').addEventListener('click', () => openSheet(false));
$('#t-notes').addEventListener('click', () => { S.notes = !S.notes; $('#t-notes').setAttribute('aria-pressed', String(S.notes)); $('#t-notes').textContent = S.notes ? 'My marks: on' : 'My marks: off'; notesGroup.visible = S.notes; });
$('#t-list').addEventListener('click', () => { clueObjs.forEach((o) => markFound(o, true)); say('Every clue is shown as text', 'Open Clues to read them. You did not have to look around.'); });

// ------------------------------------------------------------------ frame loop
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _eu = new THREE.Euler(), _fwd = new THREE.Vector3(), _cp = new THREE.Vector3(), _dir = new THREE.Vector3(), _qi = new THREE.Quaternion();
let raf = 0, last = 0;
function frame(now) {
  raf = requestAnimationFrame(frame);
  const t = now / 1000, dt = Math.min(0.1, (now - last) / 1000 || 0.016); last = now;

  // camera
  if (S.tilt && S.dev) deviceQuat(camera.quaternion, S.dev);
  else {
    const idle = now - S.lastDrag > 2500 && !reduced;
    _eu.set(S.pitch, S.yaw + (idle ? Math.sin(t * 0.45) * 0.045 : 0), 0, 'YXZ'); camera.quaternion.setFromEuler(_eu);
  }
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

  // clues: a faint glow shows where one hangs; keep your view on it for about half a second to read it
  camera.getWorldDirection(_fwd); camera.getWorldPosition(_w); _qi.copy(camera.quaternion).invert();
  let near = null, nearD = 9;
  for (const o of clueObjs) {
    o.g.getWorldPosition(_cp); _dir.copy(_cp).sub(_w).normalize();
    const d = Math.acos(clamp(_fwd.dot(_dir), -1, 1));
    if (!o.found) {
      o.p = clamp(o.p + (d < 0.2 ? dt / 0.7 : -dt / 1.4), 0, 1);
      o.sp.material.opacity = o.p * o.p;
      o.glow.material.opacity = (0.16 + clamp(1 - d / 0.9, 0, 1) * 0.5 + (reduced ? 0 : Math.sin(t * 2 + o.c.a * 5) * 0.04)) * (1 - o.p * 0.6);
      if (d < nearD) { nearD = d; near = o; }
      if (o.p >= 1) markFound(o);
    } else {
      const k = reduced ? 1 : 1 + 0.3 * Math.max(0, 1 - (t - o.foundT) / 0.5);
      o.sp.scale.set(o.w * k, o.h * k, 1); o.glow.material.opacity += (0.12 - o.glow.material.opacity) * Math.min(1, dt * 4);
    }
  }
  const showArrow = near && nearD > 0.55 && now - lastFindAt > 6000 && sheet.hidden;
  arrowEl.hidden = !showArrow;
  if (showArrow) { // an arrow at the edge of the picture, pointing the way to the nearest clue you have not found
    near.g.getWorldPosition(_cp); _dir.copy(_cp).sub(_w).applyQuaternion(_qi);
    const ang = Math.atan2(_dir.y, _dir.x), rx = stage.clientWidth * 0.38, ry = stage.clientHeight * 0.33;
    arrowEl.style.transform = `translate(-50%, -50%) translate(${Math.cos(ang) * rx}px, ${-Math.sin(ang) * ry}px) rotate(${-ang}rad)`;
  }

  // relics: float, spin, flicker
  for (const g of relicGroups) {
    const m = g.userData.mover; m.position.y = 0.016 + (reduced ? 0 : Math.sin(t * 1.6 + g.position.x * 40) * 0.0016); if (!reduced) m.rotation.y = t * 0.8;
    const l = m.getObjectByName('light'); if (l) { l.intensity = 0.0035 + (reduced ? 0 : Math.sin(t * 17) * 0.0005 + Math.sin(t * 6.3) * 0.0005); const f = m.getObjectByName('flame'); f.scale.y = 1.7 + (reduced ? 0 : Math.sin(t * 17) * 0.2); m.rotation.y = 0; }
  }

  // suspects face you (around the up axis only, like a standee), the selected one glows
  camera.getWorldPosition(_w);
  for (const s of standees) {
    const local = s.g.worldToLocal(_w.clone()); s.plane.rotation.y = Math.atan2(local.x, local.z);
    const on = S.sel && S.sel.type === 'suspect' && S.sel.id === s.id;
    s.ring.material.opacity += ((on ? 0.9 : 0) - s.ring.material.opacity) * Math.min(1, dt * 10);
    s.plane.position.y += ((on ? 0.006 : 0) - s.plane.position.y) * Math.min(1, dt * 10);
  }

  // the Whisper: drifts room to room, bobs, flickers, trails mist
  if (ghost) {
    const G = ghost;
    if (t - G.t0 > 7.5) { G.t0 = t; G.tourIdx = (G.tourIdx + 1) % GHOST_TOUR.length; G.room = GHOST_TOUR[G.tourIdx]; const c = roomPos[G.room]; G.from.copy(G.group.position); G.to.set(c.x, GHOST_Y, c.z); }
    const p = clamp((t - G.t0) / 3, 0, 1), se = p * p * (3 - 2 * p);
    G.group.position.lerpVectors(G.from, G.to, se); G.group.position.y = GHOST_Y + (reduced ? 0 : Math.sin(t * 1.3) * 0.008);
    const lg = G.group.worldToLocal(_w.clone()); G.plane.rotation.y = Math.atan2(lg.x, lg.z); G.plane.rotation.z = reduced ? 0 : Math.sin(t * 0.9) * 0.025;
    const flick = !reduced && (Math.sin(t * 2.1) * Math.sin(t * 3.7) > 0.93);
    G.plane.material.opacity = flick ? 0.55 : 0.92; G.glow.material.opacity = 0.5 + (reduced ? 0 : Math.sin(t * 1.1) * 0.08);
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
buildFigures().then(() => {
  const want = q.get('sel');
  if (want) { const s = SUSPECTS.find((x) => x.id === want); select(s ? { type: 'suspect', id: s.id } : { type: want === 'ghost' ? 'ghost' : 'room', id: want }); }
}).catch((err) => say('Could not load the figures', String(err && err.message || err)));
raf = requestAnimationFrame(frame);
{ // test and screenshot helpers: ?look=pin2 turns the view to a clue, ?found=all or ?found=pin1,pin2 marks clues found, ?sheet=1 opens the list
  const look = CLUES.find((c) => c.id === q.get('look'));
  if (look) { S.yaw = anchor.rotation.y - look.a; S.pitch = look.e; S.lastDrag = performance.now(); }
  const f = q.get('found');
  if (f) clueObjs.filter((o) => f === 'all' || f.split(',').includes(o.c.id)).forEach((o) => markFound(o, true));
  if (q.get('sheet')) openSheet(true);
}
renderClues();
window.__ar = { place, select, S, camera, anchor, ghost: () => ghost, standees, floors, hit, clues: clueObjs, markFound };
