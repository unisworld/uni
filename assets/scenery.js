// scenery.js — céu, chão e texturas procedurais de cada reino.
// Tudo desenhado em canvas no carregamento, nada baixado da rede.
// Também distribuído no pacote exportado (assets/scenery.js).

import * as THREE from "three";
import { mulberry32 } from "./engine.js";

// Paletas de crepúsculo. Sóbrias, sem gradiente de banho de loja.
export const SKY_PALETTE = {
  oceano: { top: "#0a1826", horizon: "#2d5364", sun: "#f2c98a", fog: "#152c38" },
  costa: { top: "#0d1c2a", horizon: "#4a7379", sun: "#f6d39b", fog: "#254046" },
  campina: { top: "#101e2c", horizon: "#7c8a5c", sun: "#f7dba6", fog: "#39412f" },
  mata: { top: "#0b1a20", horizon: "#3f5c46", sun: "#f0d19c", fog: "#1f2f26" },
  serra: { top: "#101724", horizon: "#767d88", sun: "#f8e2c0", fog: "#333941" },
};

export function skyPalette(biome) {
  return SKY_PALETTE[biome] || SKY_PALETTE.campina;
}

const SUN_DIR = new THREE.Vector3(-0.42, 0.24, 0.87).normalize();

export function sunDirection() {
  return SUN_DIR.clone();
}

export function createSky(biome) {
  const p = skyPalette(biome);
  const geometry = new THREE.SphereGeometry(150, 24, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(p.top) },
      uHorizon: { value: new THREE.Color(p.horizon) },
      uSun: { value: new THREE.Color(p.sun) },
      uSunDir: { value: SUN_DIR.clone() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uSun;
      uniform vec3 uSunDir;
      varying vec3 vDir;

      float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x),
                   mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float cloudNoise(vec2 p) {
        float value = 0.0;
        float weight = 0.55;
        for (int i = 0; i < 3; i++) {
          value += noise2(p) * weight;
          p *= 2.03;
          weight *= 0.5;
        }
        return value / 0.9625;
      }

      void main() {
        float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(h, 0.8));
        float d = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
        col += uSun * pow(d, 220.0) * 1.2;
        col += uSun * pow(d, 7.0) * 0.11;
        col += uSun * pow(d, 2.0) * 0.025;

        // Soft, quiet cloud bands add depth without a post-processing pass.
        vec2 cloudP = vec2(atan(vDir.z, vDir.x) * 2.4, vDir.y * 8.0);
        cloudP += vec2(vDir.y * 3.0, vDir.x * 1.5);
        float cloud = cloudNoise(cloudP);
        float cloudMask = smoothstep(0.56, 0.79, cloud)
          * smoothstep(0.47, 0.55, h) * (1.0 - smoothstep(0.82, 0.94, h));
        vec3 cloudColor = mix(uHorizon * 1.12, vec3(0.82, 0.78, 0.69), 0.28 + d * 0.34);
        col = mix(col, cloudColor, cloudMask * 0.18);
        col = mix(col, uHorizon * 1.12, pow(1.0 - h, 7.0) * 0.55);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

/* ---------------- textura de solo ---------------- */

const SOIL_TINT = {
  oceano: "#2b4250",
  costa: "#c9b98e",
  campina: "#b8c08c",
  mata: "#9fae86",
  serra: "#c2c2c6",
};

// textura em tons claros que MULTIPLICA a cor do vértice — só grão e padrão
export function groundTexture(biome, seed) {
  const S = 256;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  const rnd = mulberry32((seed >>> 0) || 1);

  ctx.fillStyle = "#e4e4e4";
  ctx.fillRect(0, 0, S, S);

  // grão
  for (let i = 0; i < 3200; i++) {
    const g = 178 + Math.floor(rnd() * 78);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    const w = 1 + rnd() * 2.2;
    ctx.fillRect(rnd() * S, rnd() * S, w, w);
  }

  ctx.lineCap = "round";

  if (biome === "campina" || biome === "mata") {
    // capim: traços curtos e inclinados
    for (let i = 0; i < 900; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const len = 2 + rnd() * 5;
      const lean = (rnd() - 0.5) * 3;
      const g = 196 + Math.floor(rnd() * 52);
      ctx.strokeStyle = `rgba(${g},${g},${g},0.85)`;
      ctx.lineWidth = 0.7 + rnd() * 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + lean, y - len);
      ctx.stroke();
    }
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(255,255,255,0.5)`;
      ctx.fillRect(rnd() * S, rnd() * S, 1.6, 1.6);
    }
  } else if (biome === "costa") {
    // areia: ondulações horizontais
    for (let i = 0; i < 220; i++) {
      const y = rnd() * S;
      const g = 200 + Math.floor(rnd() * 50);
      ctx.strokeStyle = `rgba(${g},${g},${g},0.7)`;
      ctx.lineWidth = 0.8 + rnd();
      ctx.beginPath();
      for (let x = 0; x <= S; x += 8) {
        const yy = y + Math.sin((x / S) * Math.PI * 3 + rnd() * 0.2) * 2.2;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  } else if (biome === "serra") {
    // pedra: fissuras angulares
    for (let i = 0; i < 260; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const g = 172 + Math.floor(rnd() * 70);
      ctx.strokeStyle = `rgba(${g},${g},${g},0.8)`;
      ctx.lineWidth = 0.7 + rnd() * 1.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 26, y + (rnd() - 0.5) * 26);
      ctx.stroke();
    }
  } else {
    // oceano: só grão fino
    for (let i = 0; i < 500; i++) {
      const g = 200 + Math.floor(rnd() * 50);
      ctx.fillStyle = `rgba(${g},${g},${g},0.5)`;
      ctx.fillRect(rnd() * S, rnd() * S, 1.4, 1.4);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 7);
  tex.anisotropy = 2;
  return tex;
}

export function soilTint(biome) {
  return SOIL_TINT[biome] || SOIL_TINT.campina;
}

/* ---------------- água ---------------- */

export function waterTexture(seed) {
  const S = 128;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  const rnd = mulberry32((seed >>> 0) || 7);

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1.2;

  for (let i = 0; i < 46; i++) {
    const y = rnd() * S;
    ctx.beginPath();
    for (let x = 0; x <= S; x += 6) {
      const yy = y + Math.sin((x / S) * Math.PI * 4 + i) * 2.4;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  return tex;
}

/* ---------------- partículas de poeira ---------------- */

export function dustTexture() {
  const S = 32;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, "rgba(255,248,232,0.9)");
  grad.addColorStop(1, "rgba(255,248,232,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(canvas);
}

export function blobTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(0,0,0,0.6)");
  grad.addColorStop(0.55, "rgba(0,0,0,0.26)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}