// Retarget Mixamo FBX clips onto the Reallusion-style "CC_Base" skeleton of the Free Male Character sample.
//   node retarget_cc.mjs <body.fbx> <dir-with-mixamo-fbx> <out.glb>
// The sample rests in an A-pose and Mixamo rests in a T-pose, so the arms are first posed into a T-pose in the
// target's rest, and each clip is then applied as a world-space delta from rest (as retarget_mixamo.mjs does).
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {}, set src(v) {} }) };   // FBXLoader asks for an <img> for textures we do not need
const THREE = await import('three');
const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
import { Document, NodeIO } from '@gltf-transform/core';
import { resample, prune } from '@gltf-transform/functions';
import fs from 'node:fs'; import path from 'node:path';
const [, , bodyFbx, fbxDir, outGlb] = process.argv;
if (!outGlb) { console.error('usage: node retarget_cc.mjs <body.fbx> <fbx-dir> <out.glb>'); process.exit(1); }
const NAMES = { 'Guitar Playing': 'Guitar_Playing', 'Guitar Playing (1)': 'Guitar_Playing_2', 'Piano Playing (seated)': 'Piano_Seated', 'Playing Drums (seated)': 'Drums_Seated', Rapping: 'Rapping', Singing: 'Singing' };
const MAP = { Hips: 'CC_Base_Hip', Spine: 'CC_Base_Waist', Spine1: 'CC_Base_Spine01', Spine2: 'CC_Base_Spine02', Neck: 'CC_Base_NeckTwist01', Head: 'CC_Base_Head' };
for (const [S, s] of [['Left', 'L'], ['Right', 'R']]) {
  Object.assign(MAP, { [S + 'Shoulder']: 'CC_BaseClavicle' + s, [S + 'Arm']: 'CC_BaseUpperarm' + s, [S + 'ForeArm']: 'CC_BaseForearm' + s, [S + 'Hand']: 'CC_BaseHand' + s,
    [S + 'UpLeg']: 'CC_BaseThigh' + s, [S + 'Leg']: 'CC_BaseCalf' + s, [S + 'Foot']: 'CC_BaseFoot' + s, [S + 'ToeBase']: 'CC_BaseToeBase' + s });
  for (const [F, f] of [['Thumb', 'Thumb'], ['Index', 'Index'], ['Middle', 'Mid'], ['Ring', 'Ring'], ['Pinky', 'Pinky']]) for (const n of [1, 2, 3]) MAP[`${S}Hand${F}${n}`] = `CC_Base${f}${n}${s}`;
}
const load = f => { const b = fs.readFileSync(f); return new FBXLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), ''); };
const body = load(bodyFbx);
const T = {}; body.traverse(o => { if (o.isBone && !T[o.name]) T[o.name] = o; });
let troot = T.CC_Base_Hip; while (troot.parent) troot = troot.parent; troot.updateMatrixWorld(true);
// rest, then pose the arms into a T-pose (rotate each arm chain as one piece so the elbow bend is kept)
const tRestW = {}; for (const n of Object.keys(T)) tRestW[n] = T[n].getWorldQuaternion(new THREE.Quaternion());
for (const s of ['L', 'R']) {
  const up = T['CC_BaseUpperarm' + s], fo = T['CC_BaseForearm' + s], a = up.getWorldPosition(new THREE.Vector3()), b = fo.getWorldPosition(new THREE.Vector3());
  const cur = b.sub(a).normalize(), want = new THREE.Vector3(s === 'L' ? 1 : -1, 0, 0); // Mixamo's left arm points to +x
  const fix = new THREE.Quaternion().setFromUnitVectors(cur, want);
  console.log(s, 'arm rest direction', cur.toArray().map(v => v.toFixed(2)).join(' '), '-> T');
  const chain = []; (function walk(o) { chain.push(o.name); o.children.forEach(walk); })(up);
  for (const n of chain) if (tRestW[n]) tRestW[n] = fix.clone().multiply(tRestW[n]);
}
const tRestHips = T.CC_Base_Hip.getWorldPosition(new THREE.Vector3());
const mapped = new Set(Object.values(MAP));
const tOrder = [...mapped].sort((a, b) => depth(T[a]) - depth(T[b])); function depth(o) { let d = 0; while (o.parent) { d++; o = o.parent; } return d; }
const out = new Document(); const buffer = out.createBuffer(); const scene = out.createScene('clips');
const onodes = {}; for (const n of mapped) { onodes[n] = out.createNode(n); scene.addChild(onodes[n]); }
const FPS = 30; const files = fs.readdirSync(fbxDir).filter(f => f.toLowerCase().endsWith('.fbx')).sort();
for (const f of files) {
  const base = f.replace(/\.fbx$/i, ''), name = NAMES[base] || base.replace(/[^A-Za-z0-9]+/g, '_'); const fbx = load(path.join(fbxDir, f)); const clip = fbx.animations[0];
  const S = {}; fbx.traverse(o => { if (o.isBone) S[o.name.replace(/^mixamorig:?/, '')] = o; }); fbx.updateMatrixWorld(true);
  const sRestW = {}; for (const k of Object.keys(MAP)) sRestW[k] = S[k].getWorldQuaternion(new THREE.Quaternion());
  const sRestHips = S.Hips.getWorldPosition(new THREE.Vector3()), k = tRestHips.y / sRestHips.y;
  const mixer = new THREE.AnimationMixer(fbx); mixer.clipAction(clip).play();
  const N = Math.max(2, Math.round(clip.duration * FPS)), times = new Float32Array(N), rot = {}; for (const n of tOrder) rot[n] = new Float32Array(N * 4); const hipsPos = new Float32Array(N * 3);
  const inv = Object.fromEntries(Object.entries(MAP).map(([a, b]) => [b, a])), prev = {}, qa = new THREE.Quaternion(), qd = new THREE.Quaternion();
  for (let i = 0; i < N; i++) {
    times[i] = i / FPS; mixer.setTime(times[i]); fbx.updateMatrixWorld(true);
    const tw = {};
    const worldOf = bone => {                                   // world rotation of a target bone in this frame
      if (tw[bone.name]) return tw[bone.name];
      if (!bone.parent || !bone.parent.isObject3D) return new THREE.Quaternion();
      const pw = worldOf(bone.parent); return pw.clone().multiply(bone.quaternion);   // an unmapped bone keeps its rest rotation
    };
    for (const n of tOrder) {
      const bone = T[n]; S[inv[n]].getWorldQuaternion(qa);
      qd.copy(qa).multiply(sRestW[inv[n]].clone().invert());
      const world = qd.multiply(tRestW[n]).clone(); tw[n] = world;
      const parentW = bone.parent ? worldOf(bone.parent) : new THREE.Quaternion();
      const local = parentW.clone().invert().multiply(world);
      const q = prev[n]; if (q && local.dot(q) < 0) { local.x *= -1; local.y *= -1; local.z *= -1; local.w *= -1; } prev[n] = local; local.toArray(rot[n], i * 4);
    }
    const hw = S.Hips.getWorldPosition(new THREE.Vector3()).sub(sRestHips).multiplyScalar(k).add(tRestHips);
    T.CC_Base_Hip.parent.updateMatrixWorld(true); T.CC_Base_Hip.parent.worldToLocal(hw.clone()).toArray(hipsPos, i * 3);
  }
  // keep the hips' vertical bob, centre the horizontal path on the mark
  const restLocal = T.CC_Base_Hip.position.toArray();
  const absMax = restLocal.map(Math.abs), up = absMax.indexOf(Math.max(...absMax));
  for (let h = 0; h < 3; h++) { if (h === up) continue; let mean = 0; for (let i = 0; i < N; i++) mean += hipsPos[i * 3 + h]; mean /= N; for (let i = 0; i < N; i++) hipsPos[i * 3 + h] += restLocal[h] - mean; }
  const anim = out.createAnimation(name); const tacc = out.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer);
  const add = (node, p, type, arr) => { const smp = out.createAnimationSampler().setInterpolation('LINEAR').setInput(tacc).setOutput(out.createAccessor().setType(type).setArray(arr).setBuffer(buffer)); anim.addSampler(smp).addChannel(out.createAnimationChannel().setTargetNode(node).setTargetPath(p).setSampler(smp)); };
  for (const n of tOrder) add(onodes[n], 'rotation', 'VEC4', rot[n]); add(onodes.CC_Base_Hip, 'translation', 'VEC3', hipsPos);
  console.log(name.padEnd(18), 'frames', N, 'dur', clip.duration.toFixed(2), 'k', k.toFixed(4), 'hip rest', tRestHips.toArray().map(v => v.toFixed(1)).join(','));
}
await out.transform(resample({ tolerance: 1e-4 }), prune());
await new NodeIO().write(outGlb, out); console.log(outGlb, (fs.statSync(outGlb).size / 1024).toFixed(0), 'KB');
