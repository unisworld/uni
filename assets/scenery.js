// scenery.js — céu, chão e texturas procedurais de cada reino.
// Tudo desenhado em canvas no carregamento, nada baixado da rede.
// Também distribuído no pacote exportado (assets/scenery.js).

import * as THREE from "three";
import { mulberry32 } from "./engine.js";

// Luz diurna difusa: atmosfera quente e baixa, com o topo mais frio, como na ilha original.
// As cinco paletas continuam distintas sem empurrar os biomas para um filtro de cor uniforme.
export const SKY_PALETTE = {
  oceano: { top: "#536e70", horizon: "#c6b995", sun: "#ffe5b0", fog: "#a7aa99" },
  costa: { top: "#5b7774", horizon: "#d0bd98", sun: "#ffe9bd", fog: "#adb09a" },
  campina: { top: "#65796e", horizon: "#d8c59b", sun: "#ffe7b0", fog: "#b3ad91" },
  mata: { top: "#49685f", horizon: "#c5c49c", sun: "#ffdfaa", fog: "#969e87" },
  serra: { top: "#62717a", horizon: "#d0c5b4", sun: "#ffebcf", fog: "#a7aaa7" },
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
        float d = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);

        // Smooth atmospheric lift at the horizon keeps distant land and sea in the same light.
        float horizonLift = exp(-abs(vDir.y) * 8.0);
        vec3 col = mix(uHorizon, uTop, pow(h, 0.82));
        col = mix(col, uHorizon * 1.045, horizonLift * 0.27);
        col += uSun * pow(d, 220.0) * 0.72;
        col += uSun * pow(d, 8.0) * 0.17;
        col += uSun * pow(d, 2.0) * 0.035;

        // Broad, feathered cloud shelves; deliberately static so reduced-motion stays still.
        vec2 cloudP = vec2(atan(vDir.z, vDir.x) * 2.15, vDir.y * 7.4);
        cloudP += vec2(vDir.y * 2.6, vDir.x * 1.2);
        float cloud = cloudNoise(cloudP);
        float cloudMask = smoothstep(0.53, 0.78, cloud)
          * smoothstep(0.43, 0.54, h) * (1.0 - smoothstep(0.79, 0.94, h));
        vec3 cloudColor = mix(uHorizon * 1.025, vec3(0.88, 0.85, 0.76), 0.22 + d * 0.42);
        col = mix(col, cloudColor, cloudMask * 0.26);
        col = mix(col, uHorizon * 1.035, pow(1.0 - h, 7.0) * 0.42);
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

// textura em tons neutros que MULTIPLICA a cor do vértice — grão fino e variação sutil.
// Um único canvas pequeno por mundo; os padrões usam a seed da peça e não mudam o terreno.
export function groundTexture(biome, seed) {
  const S = 256;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  const rnd = mulberry32((seed >>> 0) || 1);

  ctx.fillStyle = "#f0f0f0";
  ctx.fillRect(0, 0, S, S);

  // Variação larga e muito discreta evita a aparência de uma cor chapada sem
  // competir com a forma do relevo ou introduzir manchas fortes em celulares.
  for (let i = 0; i < 54; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const rx = 12 + rnd() * 34;
    const ry = 8 + rnd() * 22;
    const dark = rnd() < 0.55;
    ctx.fillStyle = dark ? "rgba(80,80,80,0.035)" : "rgba(255,255,255,0.11)";
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Grão abaixo de um pixel no mundo: textura orgânica, não ruído pontilhado.
  for (let i = 0; i < 2100; i++) {
    const g = 205 + Math.floor(rnd() * 50);
    ctx.fillStyle = `rgba(${g},${g},${g},${0.14 + rnd() * 0.22})`;
    const w = 0.55 + rnd() * 1.15;
    ctx.fillRect(rnd() * S, rnd() * S, w, w);
  }

  ctx.lineCap = "round";
  if (biome === "campina" || biome === "mata") {
    // Capim curto e esparso, só legível de perto; verde real vem do material do bioma.
    const count = biome === "mata" ? 600 : 720;
    for (let i = 0; i < count; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const len = 1.5 + rnd() * 3.2;
      const lean = (rnd() - 0.5) * 2.6;
      const g = 202 + Math.floor(rnd() * 43);
      ctx.strokeStyle = `rgba(${g},${g},${g},${0.35 + rnd() * 0.22})`;
      ctx.lineWidth = 0.55 + rnd() * 0.55;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + lean, y - len);
      ctx.stroke();
    }
  } else if (biome === "costa") {
    // Marcas de areia largas e quase paralelas, com uma fase fixa por faixa.
    for (let i = 0; i < 74; i++) {
      const y = rnd() * S;
      const phase = rnd() * Math.PI * 2;
      const amp = 0.8 + rnd() * 1.5;
      const shade = 208 + Math.floor(rnd() * 36);
      ctx.strokeStyle = `rgba(${shade},${shade},${shade},0.32)`;
      ctx.lineWidth = 0.7 + rnd() * 0.8;
      ctx.beginPath();
      for (let x = 0; x <= S; x += 8) {
        const yy = y + Math.sin((x / S) * Math.PI * 4 + phase) * amp;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  } else if (biome === "serra") {
    // Fissuras curtas e finas em pedra, sem grades escuras repetidas.
    for (let i = 0; i < 170; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const g = 205 + Math.floor(rnd() * 40);
      ctx.strokeStyle = `rgba(${g},${g},${g},0.38)`;
      ctx.lineWidth = 0.55 + rnd() * 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 18, y + (rnd() - 0.5) * 18);
      ctx.stroke();
    }
  } else {
    // Oceano: pouca textura no chão exposto; o mar é lido pela superfície d'água.
    for (let i = 0; i < 280; i++) {
      const g = 213 + Math.floor(rnd() * 35);
      ctx.fillStyle = `rgba(${g},${g},${g},0.28)`;
      ctx.fillRect(rnd() * S, rnd() * S, 1, 1);
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
  const S = 256;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  const rnd = mulberry32((seed >>> 0) || 7);

  // Preto é transparente para a mistura aditiva do mar; só desenhamos reflexos.
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, S, S);

  // Reflexos quebrados, de escala variada e com cópias nas bordas para o tile fechar.
  // A distribuição e as fases dependem da seed e permanecem estáticas em movimento reduzido.
  function wrappedPatch(x, y, rx, ry, angle, alpha) {
    const shiftsX = [0, ...(x - rx < 0 ? [S] : []), ...(x + rx > S ? [-S] : [])];
    const shiftsY = [0, ...(y - ry < 0 ? [S] : []), ...(y + ry > S ? [-S] : [])];
    ctx.fillStyle = `rgba(242,246,231,${alpha})`;
    for (const dx of shiftsX) for (const dy of shiftsY) {
      ctx.beginPath();
      ctx.ellipse(x + dx, y + dy, rx, ry, angle, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (let cluster = 0; cluster < 31; cluster++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const count = 2 + Math.floor(rnd() * 5);
    for (let j = 0; j < count; j++) {
      const rx = 2.2 + rnd() * 8.5;
      const ry = 0.7 + rnd() * 2.3;
      wrappedPatch(
        (x + (rnd() - 0.5) * 23 + S) % S,
        (y + (rnd() - 0.5) * 16 + S) % S,
        rx, ry, (rnd() - 0.5) * 0.55, 0.16 + rnd() * 0.25,
      );
    }
  }

  // Algumas cristas contínuas, quase horizontais, para dar escala e direção ao mar.
  for (let i = 0; i < 12; i++) {
    const y = rnd() * S;
    const phase = rnd() * Math.PI * 2;
    const amp = 1.1 + rnd() * 2.2;
    ctx.strokeStyle = `rgba(238,244,232,${0.12 + rnd() * 0.16})`;
    ctx.lineWidth = 0.7 + rnd() * 1.1;
    ctx.beginPath();
    for (let x = 0; x <= S; x += 4) {
      const yy = y + Math.sin((x / S) * Math.PI * 6 + phase) * amp;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
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