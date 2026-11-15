// Minimal glTF 2.0 binary (.glb) parser & loader built strictly on the trimmed `vendor/three.js` exports.
// Pure `parseGlb(buffer, THREE)` runs in Node tests without WebGL; `loadGlb(url, THREE)` loads a static asset in the browser.

const COMP = {
  5120: [Int8Array, 127],
  5121: [Uint8Array, 255],
  5122: [Int16Array, 32767],
  5123: [Uint16Array, 65535],
  5125: [Uint32Array, 4294967295],
  5126: [Float32Array, 1],
};
const ARITY = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

export function parseGlb(arrayBuffer, THREE) {
  const dv = new DataView(arrayBuffer);
  if (dv.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2) {
    throw new Error('Invalid glTF 2.0 binary header');
  }
  let off = 12, gltf = null, binOffset = 0, binLength = 0;
  while (off + 8 <= dv.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer, off + 8, len)));
    else if (type === 0x004e4942) { binOffset = off + 8; binLength = len; }
    off += 8 + len;
  }
  if (!gltf || !binLength) throw new Error('Incomplete glTF 2.0 chunks');

  const readAcc = (idx) => {
    const acc = gltf.accessors[idx], bv = gltf.bufferViews[acc.bufferView];
    const [Ctor, normDiv] = COMP[acc.componentType];
    const n = acc.count * ARITY[acc.type];
    const byteStart = binOffset + (bv.byteOffset || 0) + (acc.byteOffset || 0);
    // Copy onto aligned buffer in case byteStart is odd-aligned
    const raw = byteStart % Ctor.BYTES_PER_ELEMENT === 0
      ? new Ctor(arrayBuffer, byteStart, n)
      : new Ctor(arrayBuffer.slice(byteStart, byteStart + n * Ctor.BYTES_PER_ELEMENT));
    if (!acc.normalized || Ctor === Float32Array) return { array: raw, itemSize: ARITY[acc.type] };
    const f32 = new Float32Array(n);
    for (let i = 0; i < n; i++) f32[i] = Math.max(-1, raw[i] / normDiv);
    return { array: f32, itemSize: ARITY[acc.type] };
  };

  const mats = (gltf.materials || []).map((m) => {
    const pbr = m.pbrMetallicRoughness || {}, bc = pbr.baseColorFactor || [1, 1, 1, 1], em = m.emissiveFactor || [0, 0, 0];
    const blend = m.alphaMode === 'BLEND';
    const opts = {
      color: new THREE.Color(bc[0], bc[1], bc[2]),
      emissive: new THREE.Color(em[0], em[1], em[2]),
      metalness: pbr.metallicFactor ?? 0.1,
      roughness: pbr.roughnessFactor ?? 0.7,
      vertexColors: true,
      transparent: blend,
      opacity: bc[3] ?? 1,
      depthWrite: !blend,
    };
    if (m.doubleSided) opts.side = THREE.DoubleSide;
    return new THREE.MeshStandardMaterial(opts);
  });

  const prototypes = {};
  for (const m of gltf.meshes || []) {
    const group = new THREE.Group();
    group.name = m.name || '';
    for (const prim of m.primitives || []) {
      const geo = new THREE.BufferGeometry();
      const pos = readAcc(prim.attributes.POSITION);
      geo.setAttribute('position', new THREE.BufferAttribute(pos.array, 3));
      if (prim.attributes.NORMAL !== undefined) {
        const nrm = readAcc(prim.attributes.NORMAL);
        geo.setAttribute('normal', new THREE.BufferAttribute(nrm.array, 3));
      }
      if (prim.attributes.COLOR_0 !== undefined) {
        const col = readAcc(prim.attributes.COLOR_0);
        // Three.js r152+ supports 3- or 4-channel vertexColors (4-channel drives vertex alpha automatically when transparent!)
        geo.setAttribute('color', new THREE.BufferAttribute(col.array, col.itemSize));
      }
      if (prim.indices !== undefined) {
        const ind = readAcc(prim.indices);
        geo.setIndex(new THREE.BufferAttribute(ind.array, 1));
      }
      const mat = mats[prim.material ?? 0] || new THREE.MeshStandardMaterial({ vertexColors: true });
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
    }
    prototypes[group.name] = group;
  }

  return {
    gltf,
    materials: mats,
    names: Object.keys(prototypes),
    has: (name) => !!prototypes[name],
    instantiate(name, cloneMaterials = false) {
      const src = prototypes[name];
      if (!src) return null;
      const g = src.clone(true);
      if (cloneMaterials) {
        g.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
      }
      return g;
    },
  };
}

export function loadGlb(url, THREE) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
        try { resolve(parseGlb(xhr.response, THREE)); } catch (err) { reject(err); }
      } else reject(new Error(`Could not load ${url} (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error(`Network error loading ${url}`));
    xhr.send();
  });
}
