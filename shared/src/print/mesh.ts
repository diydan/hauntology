/**
 * 3D mesh representation, binary STL writer/reader, and watertight manifold validation (party-mode 8.2).
 * Vertices are welded on a 1 µm integer grid so edge pairing and volume checks are exact.
 */

export type Vec3 = readonly [number, number, number];
export type Face = readonly [number, number, number];

export type Mesh = Readonly<{
  vertices: readonly Vec3[];
  faces: readonly Face[];
}>;

export type CheckMeshOptions = Readonly<{
  /** Maximum bounding-box extent per axis in mm (default: 180 mm bed). */
  bedMm?: number;
  /** Require every edge to be shared by at most one pair of opposite half-edges (default: true). */
  strictTwoManifold?: boolean;
}>;

export type MeshReport = Readonly<{
  ok: boolean;
  errors: readonly string[];
  volumeMm3: number;
  sizeMm: Vec3;
  bounds: Readonly<{ min: Vec3; max: Vec3 }>;
  triangleCount: number;
  vertexCount: number;
  openEdges: number;
  nonManifoldEdges: number;
  degenerateFaces: number;
}>;

/** Snap a coordinate in mm to a 1 µm integer grid. */
export const snapMicron = (mm: number): number => Math.round(mm * 1000) / 1000;

/**
 * Weld vertices on a 1 µm integer grid, verify every edge is shared by matching opposite half-edges,
 * verify positive signed volume, and check fit on a 180 mm print bed.
 */
export function checkMesh(mesh: Mesh, opts: CheckMeshOptions = {}): MeshReport {
  const bedMm = opts.bedMm ?? 180;
  const strictTwoManifold = opts.strictTwoManifold ?? true;
  const errors: string[] = [];

  if (mesh.faces.length === 0) {
    return {
      ok: false,
      errors: ["Mesh has no faces"],
      volumeMm3: 0,
      sizeMm: [0, 0, 0],
      bounds: { min: [0, 0, 0], max: [0, 0, 0] },
      triangleCount: 0,
      vertexCount: 0,
      openEdges: 0,
      nonManifoldEdges: 0,
      degenerateFaces: 0,
    };
  }

  const vertMap = new Map<string, number>();
  const weldedVerts: Vec3[] = [];
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  const weldIndex = (rawIdx: number): number => {
    const v = mesh.vertices[rawIdx];
    if (!v || !Number.isFinite(v[0]) || !Number.isFinite(v[1]) || !Number.isFinite(v[2])) {
      return -1;
    }
    const kx = Math.round(v[0] * 1000);
    const ky = Math.round(v[1] * 1000);
    const kz = Math.round(v[2] * 1000);
    const key = `${kx},${ky},${kz}`;
    let idx = vertMap.get(key);
    if (idx === undefined) {
      idx = weldedVerts.length;
      vertMap.set(key, idx);
      const x = kx / 1000, y = ky / 1000, z = kz / 1000;
      weldedVerts.push([x, y, z]);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    return idx;
  };

  // Edge key `${min(u,v)}:${max(u,v)}` -> [forwardCount (u<v), backwardCount (u>v)]
  const edges = new Map<string, [number, number]>();
  const addHalfEdge = (u: number, v: number): void => {
    const a = u < v ? u : v;
    const b = u < v ? v : u;
    const key = `${a}:${b}`;
    let entry = edges.get(key);
    if (!entry) {
      entry = [0, 0];
      edges.set(key, entry);
    }
    if (u < v) entry[0] += 1;
    else entry[1] += 1;
  };

  let degenerateFaces = 0;
  let signedVolume6 = 0;

  for (const [a, b, c] of mesh.faces) {
    const i0 = weldIndex(a);
    const i1 = weldIndex(b);
    const i2 = weldIndex(c);
    if (i0 < 0 || i1 < 0 || i2 < 0) {
      errors.push("Face references invalid vertex index");
      continue;
    }
    if (i0 === i1 || i1 === i2 || i2 === i0) {
      degenerateFaces += 1;
      continue;
    }
    addHalfEdge(i0, i1);
    addHalfEdge(i1, i2);
    addHalfEdge(i2, i0);

    const v0 = weldedVerts[i0] as Vec3;
    const v1 = weldedVerts[i1] as Vec3;
    const v2 = weldedVerts[i2] as Vec3;
    signedVolume6 +=
      v0[0] * (v1[1] * v2[2] - v1[2] * v2[1]) -
      v0[1] * (v1[0] * v2[2] - v1[2] * v2[0]) +
      v0[2] * (v1[0] * v2[1] - v1[1] * v2[0]);
  }

  if (degenerateFaces > 0) {
    errors.push(`Mesh contains ${degenerateFaces} degenerate triangle(s)`);
  }

  let openEdges = 0;
  let nonManifoldEdges = 0;
  for (const [fwd, bwd] of edges.values()) {
    if (fwd !== bwd || fwd === 0) {
      openEdges += 1;
    } else if (strictTwoManifold && (fwd !== 1 || bwd !== 1)) {
      nonManifoldEdges += 1;
    }
  }

  if (openEdges > 0) {
    errors.push(`Mesh is not watertight (${openEdges} unmatched edge(s))`);
  }
  if (nonManifoldEdges > 0) {
    errors.push(`Mesh has ${nonManifoldEdges} non-manifold edge(s) shared by more than two faces`);
  }

  const volumeMm3 = signedVolume6 / 6;
  if (!(volumeMm3 > 0)) {
    errors.push(`Mesh signed volume must be positive (got ${volumeMm3.toFixed(4)} mm^3)`);
  }

  const sizeMm: Vec3 = weldedVerts.length > 0 ? [maxX - minX, maxY - minY, maxZ - minZ] : [0, 0, 0];
  if (sizeMm[0] > bedMm + 1e-3 || sizeMm[1] > bedMm + 1e-3 || sizeMm[2] > bedMm + 1e-3) {
    errors.push(
      `Mesh bounding box ${sizeMm[0].toFixed(2)} x ${sizeMm[1].toFixed(2)} x ${sizeMm[2].toFixed(2)} mm exceeds ${bedMm} mm bed`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    volumeMm3,
    sizeMm,
    bounds: {
      min: weldedVerts.length > 0 ? [minX, minY, minZ] : [0, 0, 0],
      max: weldedVerts.length > 0 ? [maxX, maxY, maxZ] : [0, 0, 0],
    },
    triangleCount: mesh.faces.length,
    vertexCount: weldedVerts.length,
    openEdges,
    nonManifoldEdges,
    degenerateFaces,
  };
}

/** Compute the outward unit normal of triangle `(v0, v1, v2)`. */
function faceNormal(v0: Vec3, v1: Vec3, v2: Vec3): Vec3 {
  const ux = v1[0] - v0[0], uy = v1[1] - v0[1], uz = v1[2] - v0[2];
  const vx = v2[0] - v0[0], vy = v2[1] - v0[1], vz = v2[2] - v0[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  return len > 0 ? [nx / len, ny / len, nz / len] : [0, 0, 1];
}

/** Emit standard binary STL (`80` byte header + `uint32` count + `50` bytes per triangle). */
export function writeStl(mesh: Mesh, headerText = "Hauntology Print Kit binary STL"): Uint8Array {
  const triCount = mesh.faces.length;
  const out = new Uint8Array(84 + triCount * 50);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);

  const enc = new TextEncoder().encode(headerText.slice(0, 79));
  out.set(enc, 0);
  view.setUint32(80, triCount, true);

  for (let i = 0; i < triCount; i++) {
    const [a, b, c] = mesh.faces[i] as Face;
    const v0 = mesh.vertices[a] ?? [0, 0, 0];
    const v1 = mesh.vertices[b] ?? [0, 0, 0];
    const v2 = mesh.vertices[c] ?? [0, 0, 0];
    const n = faceNormal(v0, v1, v2);
    const off = 84 + i * 50;
    view.setFloat32(off + 0, n[0], true);
    view.setFloat32(off + 4, n[1], true);
    view.setFloat32(off + 8, n[2], true);
    view.setFloat32(off + 12, v0[0], true);
    view.setFloat32(off + 16, v0[1], true);
    view.setFloat32(off + 20, v0[2], true);
    view.setFloat32(off + 24, v1[0], true);
    view.setFloat32(off + 28, v1[1], true);
    view.setFloat32(off + 32, v1[2], true);
    view.setFloat32(off + 36, v2[0], true);
    view.setFloat32(off + 40, v2[1], true);
    view.setFloat32(off + 44, v2[2], true);
    view.setUint16(off + 48, 0, true);
  }
  return out;
}

/** Parse a binary STL buffer into a welded `Mesh`. */
export function readStl(bytes: Uint8Array): Mesh {
  if (bytes.byteLength < 84) throw new Error("STL buffer shorter than 84-byte header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triCount = view.getUint32(80, true);
  if (bytes.byteLength < 84 + triCount * 50) {
    throw new Error(`Invalid binary STL size: expected ${84 + triCount * 50}, got ${bytes.byteLength}`);
  }
  const vertMap = new Map<string, number>();
  const vertices: Vec3[] = [];
  const faces: Face[] = [];

  const getVert = (x: number, y: number, z: number): number => {
    const kx = Math.round(x * 1000);
    const ky = Math.round(y * 1000);
    const kz = Math.round(z * 1000);
    const key = `${kx},${ky},${kz}`;
    let idx = vertMap.get(key);
    if (idx === undefined) {
      idx = vertices.length;
      vertMap.set(key, idx);
      vertices.push([kx / 1000, ky / 1000, kz / 1000]);
    }
    return idx;
  };

  for (let i = 0; i < triCount; i++) {
    const off = 84 + i * 50;
    const i0 = getVert(view.getFloat32(off + 12, true), view.getFloat32(off + 16, true), view.getFloat32(off + 20, true));
    const i1 = getVert(view.getFloat32(off + 24, true), view.getFloat32(off + 28, true), view.getFloat32(off + 32, true));
    const i2 = getVert(view.getFloat32(off + 36, true), view.getFloat32(off + 40, true), view.getFloat32(off + 44, true));
    faces.push([i0, i1, i2]);
  }
  return { vertices, faces };
}
