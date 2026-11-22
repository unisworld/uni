// vat.js — animação por textura cozida (vertex animation texture).
//
// Todas as poses de todos os cidadãos são calculadas UMA vez, no carregamento,
// e gravadas numa textura de floats. O vertex shader lê a posição do vértice
// para o frame atual. Custo de animação na CPU por frame: zero.
// A multidão inteira é um único draw call.
//
// Também distribuído no pacote exportado (assets/vat.js). Sem dependências
// além do three.

import * as THREE from "three";

export const CLIP_NAMES = [
  "caminhar",
  "conversar",
  "ler",
  "musica",
  "celular",
  "bola",
  "pipa",
  "dormir",
  "lutar",
  "dancar",
  "volei",
  "capoeira",
  "pescar",
  "parado",
];

export const CLIP = CLIP_NAMES.reduce((acc, name, i) => {
  acc[name] = i;
  return acc;
}, {});

const FRAMES = 16;

// ciclos por segundo de cada clipe
const RATE = {
  caminhar: 1.15,
  conversar: 0.5,
  ler: 0.25,
  musica: 0.6,
  celular: 0.3,
  bola: 0.9,
  pipa: 0.35,
  dormir: 0.22,
  lutar: 1.6,
  dancar: 0.9,
  volei: 0.8,
  capoeira: 0.7,
  pescar: 0.3,
  parado: 0.4,
};

export function clipRate(name) {
  return RATE[name] || 0.45;
}

// comportamento do nó social → clipe
const BEHAVIOR_CLIP = {
  caminhar: "caminhar",
  conversar: "conversar",
  ler: "ler",
  "ouvir musica": "musica",
  "mexer no celular": "celular",
  "jogar bola": "bola",
  "soltar pipa": "pipa",
  "dormir na cadeira": "dormir",
  lutar: "lutar",
  dancar: "dancar",
  "jogar volei": "volei",
  capoeira: "capoeira",
  pescar: "pescar",
};

export function clipFor(behavior) {
  return BEHAVIOR_CLIP[behavior] || "parado";
}

/* ---------------- esqueleto ---------------- */

const BONES = [
  { name: "root", parent: null, pivot: [0, 0.55, 0] },
  { name: "torso", parent: "root", pivot: [0, 0.55, 0] },
  { name: "head", parent: "torso", pivot: [0, 0.95, 0] },
  { name: "armL", parent: "torso", pivot: [0.19, 0.92, 0] },
  { name: "armR", parent: "torso", pivot: [-0.19, 0.92, 0] },
  { name: "legL", parent: "root", pivot: [0.08, 0.55, 0] },
  { name: "legR", parent: "root", pivot: [-0.08, 0.55, 0] },
];

const PARTS = [
  { bone: "torso", center: [0, 0.78, 0], size: [0.3, 0.46, 0.2] },
  { bone: "head", center: [0, 1.12, 0], size: [0.22, 0.22, 0.21] },
  { bone: "armL", center: [0.19, 0.74, 0], size: [0.09, 0.38, 0.1] },
  { bone: "armR", center: [-0.19, 0.74, 0], size: [0.09, 0.38, 0.1] },
  { bone: "legL", center: [0.08, 0.28, 0], size: [0.11, 0.56, 0.12] },
  { bone: "legR", center: [-0.08, 0.28, 0], size: [0.11, 0.56, 0.12] },
];

/* ---------------- poses ---------------- */

function poseFor(clip, p) {
  const t = p * Math.PI * 2;
  const s = Math.sin(t);
  const pose = { root: {}, torso: {}, head: {}, armL: {}, armR: {}, legL: {}, legR: {} };

  switch (clip) {
    case "caminhar":
      pose.root.ty = Math.abs(s) * 0.04;
      pose.torso.rx = 0.06;
      pose.torso.ry = s * 0.1;
      pose.head.ry = -s * 0.1;
      pose.legL.rx = s * 0.8;
      pose.legR.rx = -s * 0.8;
      pose.armL.rx = -s * 0.55;
      pose.armL.rz = 0.1;
      pose.armR.rx = s * 0.55;
      pose.armR.rz = -0.1;
      break;

    case "conversar":
      pose.root.ty = Math.sin(t * 0.5) * 0.008;
      pose.torso.rx = 0.02;
      pose.torso.ry = s * 0.14;
      pose.head.ry = Math.sin(t * 1.7) * 0.22;
      pose.head.rx = Math.sin(t * 2.3) * 0.07;
      pose.armL.rx = -0.35 + Math.sin(t * 2) * 0.22;
      pose.armL.rz = 0.18;
      pose.armR.rx = -0.35 - Math.sin(t * 2) * 0.22;
      pose.armR.rz = -0.18;
      pose.legL.rz = 0.04;
      pose.legR.rz = -0.04;
      break;

    case "ler":
      pose.root.ty = -0.26;
      pose.torso.rx = 0.14;
      pose.head.rx = 0.3 + s * 0.02;
      pose.legL.rx = -1.35;
      pose.legR.rx = -1.35;
      pose.armL.rx = -0.85;
      pose.armL.rz = 0.16;
      pose.armR.rx = -0.85;
      pose.armR.rz = -0.16;
      break;

    case "musica":
      pose.root.ty = -0.26;
      pose.torso.rx = 0.04;
      pose.torso.ry = s * 0.08;
      pose.head.rx = 0.02 + Math.sin(t * 2) * 0.1;
      pose.head.ry = s * 0.12;
      pose.legL.rx = -1.3;
      pose.legR.rx = -1.3;
      pose.armL.rx = -0.3;
      pose.armL.rz = 0.2;
      pose.armR.rx = -0.3;
      pose.armR.rz = -0.2;
      break;

    case "celular":
      pose.root.ty = -0.26;
      pose.torso.rx = 0.1;
      pose.head.rx = 0.42;
      pose.head.ry = Math.sin(t * 0.6) * 0.04;
      pose.legL.rx = -1.3;
      pose.legR.rx = -1.3;
      pose.armL.rx = -0.95;
      pose.armL.rz = 0.1;
      pose.armR.rx = -0.95;
      pose.armR.rz = -0.1;
      break;

    case "bola":
      pose.root.ty = Math.abs(s) * 0.02;
      pose.torso.rx = 0.05;
      pose.torso.ry = s * 0.18;
      pose.head.rx = 0.1;
      pose.legR.rx = -0.65 + s * 0.85;
      pose.legL.rx = s * 0.15;
      pose.armL.rz = 0.55;
      pose.armL.rx = -0.2;
      pose.armR.rz = -0.55;
      pose.armR.rx = -0.2;
      break;

    case "pipa":
      pose.root.ty = Math.abs(s) * 0.01;
      pose.torso.rx = -0.06;
      pose.torso.ry = Math.sin(t * 0.7) * 0.06;
      pose.head.rx = -0.28;
      pose.armL.rz = 2.3 + Math.sin(t * 1.3) * 0.1;
      pose.armL.rx = -0.2;
      pose.armR.rz = -2.3 - Math.sin(t * 1.3) * 0.1;
      pose.armR.rx = -0.2;
      pose.legL.rz = 0.05;
      pose.legR.rz = -0.05;
      break;

    case "dormir":
      pose.root.ty = -0.28;
      pose.root.rx = s * 0.05;
      pose.torso.rx = -0.12;
      pose.head.rx = -0.3 + Math.sin(t * 0.5) * 0.03;
      pose.head.rz = 0.06;
      pose.legL.rx = -1.4;
      pose.legR.rx = -1.4;
      pose.armL.rx = -0.25;
      pose.armL.rz = 0.12;
      pose.armR.rx = -0.25;
      pose.armR.rz = -0.12;
      break;

    case "lutar":
      pose.root.ty = -0.03;
      pose.torso.rx = 0.06;
      pose.torso.ry = s * 0.3;
      pose.head.ry = -s * 0.2;
      pose.armL.rx = -0.55 - Math.max(0, s) * 1.35;
      pose.armL.rz = 0.25;
      pose.armR.rx = -0.55 - Math.max(0, -s) * 1.35;
      pose.armR.rz = -0.25;
      pose.legL.rx = -0.12 + s * 0.1;
      pose.legL.rz = 0.08;
      pose.legR.rx = 0.12 - s * 0.1;
      pose.legR.rz = -0.08;
      break;

    case "dancar":
      pose.root.ty = Math.abs(Math.sin(t * 2)) * 0.06;
      pose.torso.ry = s * 0.35;
      pose.torso.rz = Math.sin(t * 2) * 0.1;
      pose.head.ry = -s * 0.25;
      pose.head.rx = Math.sin(t * 2) * 0.06;
      pose.armL.rz = 1.9 + s * 0.35;
      pose.armL.rx = -0.15;
      pose.armR.rz = -1.9 - s * 0.35;
      pose.armR.rx = -0.15;
      pose.legL.rx = Math.sin(t * 2) * 0.45;
      pose.legR.rx = -Math.sin(t * 2) * 0.45;
      break;

    case "volei":
      pose.root.ty = Math.abs(s) * 0.14;
      pose.torso.rx = -0.05;
      pose.torso.ry = s * 0.08;
      pose.head.rx = -0.18;
      pose.armL.rz = 2.55;
      pose.armL.rx = -0.1;
      pose.armR.rz = -2.55;
      pose.armR.rx = -0.1;
      pose.legL.rx = -0.15;
      pose.legR.rx = 0.15;
      break;

    case "capoeira":
      pose.root.ty = -0.05;
      pose.torso.rz = s * 0.35;
      pose.torso.ry = s * 0.25;
      pose.torso.rx = 0.1;
      pose.head.rz = -s * 0.15;
      pose.armL.rz = 1.25;
      pose.armL.rx = -0.35;
      pose.armR.rz = -1.25;
      pose.armR.rx = -0.35;
      pose.legL.rx = s * 0.55;
      pose.legL.rz = 0.25;
      pose.legR.rx = -s * 0.55;
      pose.legR.rz = -0.25;
      break;

    case "pescar":
      pose.root.ty = -0.32;
      pose.torso.rx = 0.1;
      pose.torso.ry = Math.sin(t * 0.5) * 0.04;
      pose.head.rx = 0.12;
      pose.legL.rx = -1.35;
      pose.legR.rx = -1.35;
      pose.armL.rx = -1.05;
      pose.armL.rz = 0.12;
      pose.armR.rx = -1.05;
      pose.armR.rz = -0.12;
      break;

    default:
      pose.root.ty = s * 0.008;
      pose.torso.rx = s * 0.03;
      pose.head.ry = Math.sin(t * 0.7) * 0.1;
      pose.armL.rz = 0.06;
      pose.armR.rz = -0.06;
      break;
  }

  return pose;
}

function boneMatrices(pose) {
  const out = {};
  for (let i = 0; i < BONES.length; i++) {
    const bone = BONES[i];
    const r = pose[bone.name] || {};
    const ty = r.ty || 0;
    const m = new THREE.Matrix4().makeTranslation(bone.pivot[0], bone.pivot[1] + ty, bone.pivot[2]);
    const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r.rx || 0, r.ry || 0, r.rz || 0, "YXZ"));
    const back = new THREE.Matrix4().makeTranslation(-bone.pivot[0], -bone.pivot[1], -bone.pivot[2]);
    m.multiply(rot).multiply(back);
    if (bone.parent) m.premultiply(out[bone.parent]);
    out[bone.name] = m;
  }
  return out;
}

/* ---------------- cozimento ---------------- */

function buildRig() {
  const verts = [];
  const boneOf = [];
  PARTS.forEach((part) => {
    const g = new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]).toNonIndexed();
    g.translate(part.center[0], part.center[1], part.center[2]);
    const a = g.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) {
      verts.push(a[i], a[i + 1], a[i + 2]);
      boneOf.push(part.bone);
    }
    g.dispose();
  });
  return { verts, boneOf };
}

let baked = null;

function bake() {
  if (baked) return baked;
  const { verts, boneOf } = buildRig();
  const V = verts.length / 3;
  const rows = CLIP_NAMES.length * FRAMES;
  const data = new Float32Array(V * rows * 4);
  const v = new THREE.Vector3();

  for (let ci = 0; ci < CLIP_NAMES.length; ci++) {
    for (let f = 0; f < FRAMES; f++) {
      const mats = boneMatrices(poseFor(CLIP_NAMES[ci], f / FRAMES));
      const row = ci * FRAMES + f;
      for (let i = 0; i < V; i++) {
        v.set(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]).applyMatrix4(mats[boneOf[i]]);
        const o = (row * V + i) * 4;
        data[o] = v.x;
        data[o + 1] = v.y;
        data[o + 2] = v.z;
        data[o + 3] = 1;
      }
    }
  }

  const texture = new THREE.DataTexture(data, V, rows, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  baked = { verts: new Float32Array(verts), V, rows, texture };
  return baked;
}

/* ---------------- shader ---------------- */

const VERT = `
precision highp float;

attribute float aVid;
attribute vec3 aInstPos;
attribute float aInstYaw;
attribute float aInstScale;
attribute float aInstClip;
attribute float aInstPhase;
attribute float aInstRate;
attribute vec3 aInstColor;

uniform sampler2D uAnim;
uniform vec2 uAnimSize;
uniform float uFrames;
uniform float uTime;
uniform float uMotion;

varying vec3 vColor;
varying vec3 vView;
varying float vHeight;
varying float vDepth;

void main() {
  float phase = aInstPhase + uTime * aInstRate * uMotion;
  float frame = mod(floor(phase * uFrames), uFrames);
  float row = aInstClip * uFrames + frame;

  vec2 uv = vec2((aVid + 0.5) / uAnimSize.x, (row + 0.5) / uAnimSize.y);
  vec3 p = texture2D(uAnim, uv).xyz;

  float cs = cos(aInstYaw);
  float sn = sin(aInstYaw);
  vec3 rp = vec3(p.x * cs + p.z * sn, p.y, -p.x * sn + p.z * cs) * aInstScale;

  vec4 world = modelMatrix * vec4(rp + aInstPos, 1.0);
  vec4 mv = viewMatrix * world;

  vColor = aInstColor;
  vView = mv.xyz;
  vHeight = clamp(p.y, 0.0, 1.4);
  vDepth = -mv.z;

  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = `
precision highp float;

uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;

varying vec3 vColor;
varying vec3 vView;
varying float vHeight;
varying float vDepth;

void main() {
  vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
  vec3 lightDir = normalize(vec3(0.42, 0.86, 0.3));
  float lam = max(dot(n, lightDir), 0.0);
  float amb = 0.42 + 0.3 * clamp(vHeight / 1.2, 0.0, 1.0);
  vec3 col = vColor * (amb + lam * 0.72);

  float fog = smoothstep(uFogNear, uFogFar, vDepth);
  col = mix(col, uFogColor, fog);

  gl_FragColor = vec4(col, 1.0);
}
`;

/* ---------------- sistema de multidão ---------------- */

export function createCrowdSystem(count) {
  const { verts, V, rows, texture } = bake();
  const n = Math.max(1, count);

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(verts, 3));

  const vids = new Float32Array(V);
  for (let i = 0; i < V; i++) vids[i] = i;
  geometry.setAttribute("aVid", new THREE.BufferAttribute(vids, 1));

  const aPos = new Float32Array(n * 3);
  const aYaw = new Float32Array(n);
  const aScale = new Float32Array(n).fill(1);
  const aClip = new Float32Array(n);
  const aPhase = new Float32Array(n);
  const aRate = new Float32Array(n).fill(0.5);
  const aColor = new Float32Array(n * 3).fill(0.8);

  const attrPos = new THREE.InstancedBufferAttribute(aPos, 3);
  const attrYaw = new THREE.InstancedBufferAttribute(aYaw, 1);
  const attrScale = new THREE.InstancedBufferAttribute(aScale, 1);
  const attrClip = new THREE.InstancedBufferAttribute(aClip, 1);
  const attrPhase = new THREE.InstancedBufferAttribute(aPhase, 1);
  const attrRate = new THREE.InstancedBufferAttribute(aRate, 1);
  const attrColor = new THREE.InstancedBufferAttribute(aColor, 3);

  geometry.setAttribute("aInstPos", attrPos);
  geometry.setAttribute("aInstYaw", attrYaw);
  geometry.setAttribute("aInstScale", attrScale);
  geometry.setAttribute("aInstClip", attrClip);
  geometry.setAttribute("aInstPhase", attrPhase);
  geometry.setAttribute("aInstRate", attrRate);
  geometry.setAttribute("aInstColor", attrColor);
  geometry.instanceCount = n;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uAnim: { value: texture },
      uAnimSize: { value: new THREE.Vector2(V, rows) },
      uFrames: { value: FRAMES },
      uTime: { value: 0 },
      uMotion: { value: 1 },
      uFogColor: { value: new THREE.Color("#101418") },
      uFogNear: { value: 22 },
      uFogFar: { value: 56 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  const tmp = new THREE.Color();
  let dirty = false;

  return {
    mesh,
    count: n,
    set(i, a) {
      if (i < 0 || i >= n) return;
      aPos[i * 3] = a.x;
      aPos[i * 3 + 1] = a.y;
      aPos[i * 3 + 2] = a.z;
      aYaw[i] = a.yaw || 0;
      aScale[i] = a.scale || 1;
      aClip[i] = a.clip || 0;
      aPhase[i] = a.phase || 0;
      aRate[i] = a.rate || 0.5;
      tmp.set(a.color || "#d8cfbe");
      aColor[i * 3] = tmp.r;
      aColor[i * 3 + 1] = tmp.g;
      aColor[i * 3 + 2] = tmp.b;
      dirty = true;
    },
    commit() {
      if (!dirty) return;
      attrPos.needsUpdate = true;
      attrYaw.needsUpdate = true;
      attrScale.needsUpdate = true;
      attrClip.needsUpdate = true;
      attrPhase.needsUpdate = true;
      attrRate.needsUpdate = true;
      attrColor.needsUpdate = true;
      dirty = false;
    },
    setTime(t) {
      material.uniforms.uTime.value = t;
    },
    setMotion(v) {
      material.uniforms.uMotion.value = v;
    },
    setFog(color, near, far) {
      material.uniforms.uFogColor.value.set(color);
      material.uniforms.uFogNear.value = near;
      material.uniforms.uFogFar.value = far;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

export { FRAMES };