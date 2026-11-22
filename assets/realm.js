// realm.js — a ilha visitável. Three.js puro, sem dependências de framework.
// O mesmo arquivo roda no app e no pacote exportado.
//
// Multidão: todos os cidadãos são um único draw call, animados por textura
// cozida (VAT, ver vat.js). Nada de skinning na CPU por frame.

import * as THREE from "three";
import { terrainHeight, BIOME_HEX, mixHex, mulberry32, xmur3 } from "./engine.js";
import { createCrowdSystem, clipFor, clipRate, CLIP } from "./vat.js";
import { createSky, groundTexture, waterTexture, dustTexture, blobTexture, skyPalette } from "./scenery.js";

const MAX_CROWD = 140;

const SKIN = ["#d9b48c", "#c79a6b", "#a9784f", "#e2c3a0", "#8f5f3d", "#b98a63"];
const CLOTH = ["#8a3f3a", "#3f5b7a", "#6b7a3f", "#7a5c3f", "#4a4a5a", "#9c7b4a", "#3f6b5c", "#6a4a6a", "#a8a094"];

const PROP_SIZE = {
  banco: [1.7, 0.35, 0.5],
  radio: [0.5, 0.65, 0.4],
  campo: [3.4, 0.12, 2.2],
  cadeira: [0.62, 0.42, 0.62],
  muro: [3, 1.1, 0.4],
  palco: [3.2, 0.5, 3.2],
  rede: [0.22, 1.3, 2.6],
  tatame: [2.2, 0.08, 2.2],
  vara: [0.1, 1.5, 0.1],
};

const PROP_COLOR = {
  banco: "#8d7b5c",
  radio: "#5a4a3a",
  campo: "#4f6b3a",
  cadeira: "#7a6444",
  muro: "#6d6a63",
  palco: "#7a6444",
  rede: "#c8c2b4",
  tatame: "#8a5a3a",
  vara: "#7a6444",
};

const SEATED = ["ler", "ouvir musica", "mexer no celular", "dormir na cadeira", "pescar"];

const TREE_COUNT = { oceano: 0, costa: 4, campina: 6, mata: 15, serra: 3 };
const TUFT_COUNT = { oceano: 0, costa: 30, campina: 150, mata: 110, serra: 12 };
const STONE_COUNT = { oceano: 6, costa: 55, campina: 24, mata: 34, serra: 90 };

export function createRealm(container, opts = {}) {
  const piece = opts.piece;
  const reduced = !!opts.reducedMotion;
  const lowPower = window.matchMedia?.("(hover: none)").matches && (navigator.hardwareConcurrency || 4) <= 4;
  const onNear = opts.onNear || (() => {});
  const onNearClue = opts.onNearClue || (() => {});
  const onClue = opts.onClue || (() => {});
  const onStatus = opts.onStatus || (() => {});

  const palette = skyPalette(piece.biome);
  const seedNum = (() => {
    let h = 0;
    const s = piece.seed || "uniworld";
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h >>> 0;
  })();
  const rnd = mulberry32(xmur3(`${piece.seed}:${piece.cx}:${piece.cy}`)());

  const h = (x, z) => terrainHeight(piece.seed, piece.cx, piece.cy, x, z);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.fog);
  scene.fog = new THREE.Fog(palette.fog, 24, 58);

  const world = new THREE.Group();
  scene.add(world);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 260);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: window.devicePixelRatio < 2,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch (err) {
    onStatus("sem-webgl");
    return null;
  }

  const pixelRatioCap = lowPower ? 1.5 : 2;
  const basePixelRatio = Math.min(window.devicePixelRatio || 1, pixelRatioCap);
  let resolutionScale = 1;
  renderer.setPixelRatio(basePixelRatio);
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none;";
  container.appendChild(renderer.domElement);

  // Adaptive resolution changes only the backing buffer; CSS size, camera framing,
  // movement, hit targets and world coordinates stay untouched.
  function setResolutionScale(next) {
    const target = Math.max(0.72, Math.min(1, next));
    if (Math.abs(target - resolutionScale) < 0.001) return;
    resolutionScale = target;
    renderer.setPixelRatio(basePixelRatio * resolutionScale);
    renderer.setSize(container.clientWidth || 1, container.clientHeight || 1, false);
  }

  /* ---------- céu e luz ---------- */

  const sky = createSky(piece.biome);
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xdde6ea, 0x18200f, 1.05));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.25);
  sun.position.set(-9, 15, 7);
  scene.add(sun);

  // luz de preenchimento do lado oposto: separa a silhueta do chão sem custar sombra
  const fill = new THREE.DirectionalLight(0x9fc0d8, 0.38);
  fill.position.set(8, 6, -9);
  scene.add(fill);

  /* ---------- terreno ---------- */

  const SEG = reduced || lowPower ? 64 : 96;
  const terrainGeo = new THREE.PlaneGeometry(24, 24, SEG, SEG);
  terrainGeo.rotateX(-Math.PI / 2);
  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const baseColor = new THREE.Color(BIOME_HEX[piece.biome]);
  const rockColor = new THREE.Color("#4a4b50");
  const sandColor = new THREE.Color("#6b6144");
  const tmpColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = h(x, z);
    posAttr.setY(i, y);

    tmpColor.copy(baseColor);
    if (y < 0.35) tmpColor.lerp(sandColor, Math.min(1, (0.35 - y) * 1.6));
    if (y > 2.1) tmpColor.lerp(rockColor, Math.min(1, (y - 2.1) * 0.7));
    const shade = 0.82 + Math.min(0.35, Math.max(0, y) * 0.12);
    colors[i * 3] = tmpColor.r * shade;
    colors[i * 3 + 1] = tmpColor.g * shade;
    colors[i * 3 + 2] = tmpColor.b * shade;
  }
  terrainGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const soilTex = groundTexture(piece.biome, seedNum);
  const terrain = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshLambertMaterial({ vertexColors: true, map: soilTex }),
  );
  world.add(terrain);

  /* ---------- água ---------- */

  const WATER_COLOR = {
    oceano: 0x5d8589,
    costa: 0x78a4a0,
    campina: 0x658e8b,
    mata: 0x4c7672,
    serra: 0x71878d,
  };
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(80, 48),
    new THREE.MeshPhongMaterial({
      color: WATER_COLOR[piece.biome] || WATER_COLOR.campina,
      specular: 0xd4e1d8,
      shininess: 58,
      transparent: true,
      opacity: 0.94,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.02;
  world.add(water);

  const rippleTex = waterTexture(seedNum);
  const ripples = new THREE.Mesh(
    new THREE.CircleGeometry(80, 48),
    new THREE.MeshBasicMaterial({
      map: rippleTex,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  ripples.rotation.x = -Math.PI / 2;
  ripples.position.y = 0.01;
  world.add(ripples);

  /* ---------- estruturas dos nós ---------- */

  const propNodes = piece.nodes.filter((n) => PROP_SIZE[n.prop]);
  const propMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    Math.max(1, propNodes.length),
  );
  propMesh.count = propNodes.length;
  const dummy = new THREE.Object3D();
  const propTint = new THREE.Color();
  propNodes.forEach((n, i) => {
    const [sx, sy, sz] = PROP_SIZE[n.prop];
    dummy.position.set(n.x, h(n.x, n.z) + sy / 2, n.z);
    dummy.rotation.set(0, n.rot, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    propMesh.setMatrixAt(i, dummy.matrix);
    propMesh.setColorAt(i, propTint.set(PROP_COLOR[n.prop] || "#8d7b5c"));
  });
  propMesh.instanceMatrix.needsUpdate = true;
  if (propMesh.instanceColor) propMesh.instanceColor.needsUpdate = true;
  world.add(propMesh);

  /* ---------- árvores, capim, pedras ---------- */

  const freeSpot = (minR, maxR) => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const a = rnd() * Math.PI * 2;
      const r = minR + rnd() * (maxR - minR);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const tooClose = piece.nodes.some((n) => Math.hypot(n.x - x, n.z - z) < 1.4);
      if (!tooClose) return { x, z, r, a };
    }
    const a = rnd() * Math.PI * 2;
    return { x: Math.cos(a) * maxR, z: Math.sin(a) * maxR, a };
  };

  const trees = Math.ceil((TREE_COUNT[piece.biome] ?? 4) * (lowPower ? 0.8 : 1));
  if (trees > 0) {
    const trunk = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.07, 0.11, 1.1, 5),
      new THREE.MeshLambertMaterial({ color: 0x5b4a34 }),
      trees,
    );
    const canopy = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.78, 0),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
      trees,
    );
    const canopyTint = new THREE.Color();
    for (let i = 0; i < trees; i++) {
      const spot = freeSpot(3.2, 9.6);
      const y = h(spot.x, spot.z);
      // Small woodland trees read too much like shrubs beside a ~1.6-unit citizen.
      // Keep their bases and spacing, but give the canopy a more legible 2–3 unit height.
      const scale = 1.05 + rnd() * 0.4;
      dummy.position.set(spot.x, y + 0.55 * scale, spot.z);
      dummy.rotation.set(0, rnd() * Math.PI, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      trunk.setMatrixAt(i, dummy.matrix);

      dummy.position.set(spot.x, y + 1.2 * scale, spot.z);
      dummy.rotation.set(rnd(), rnd() * Math.PI, rnd() * 0.4);
      dummy.scale.set(scale * (0.9 + rnd() * 0.3), scale * (0.8 + rnd() * 0.4), scale);
      dummy.updateMatrix();
      canopy.setMatrixAt(i, dummy.matrix);
      canopyTint.set(BIOME_HEX[piece.biome]).offsetHSL(0, -0.06 + rnd() * 0.08, 0.06 + rnd() * 0.1);
      canopy.setColorAt(i, canopyTint);
    }
    trunk.instanceMatrix.needsUpdate = true;
    canopy.instanceMatrix.needsUpdate = true;
    if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
    world.add(trunk, canopy);
  }

  const tufts = Math.floor((TUFT_COUNT[piece.biome] ?? 40) * (lowPower ? 0.72 : 1));
  if (tufts > 0) {
    const grass = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.055, 0.34, 4),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
      tufts,
    );
    const tint = new THREE.Color();
    for (let i = 0; i < tufts; i++) {
      const spot = freeSpot(2.2, 10.4);
      dummy.position.set(spot.x, h(spot.x, spot.z) + 0.15, spot.z);
      dummy.rotation.set(0, rnd() * Math.PI, (rnd() - 0.5) * 0.3);
      const s = 0.7 + rnd() * 0.9;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      grass.setMatrixAt(i, dummy.matrix);
      tint.set(BIOME_HEX[piece.biome]).offsetHSL(0, 0.02, 0.1 + rnd() * 0.12);
      grass.setColorAt(i, tint);
    }
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    world.add(grass);
  }

  const stones = Math.floor((STONE_COUNT[piece.biome] ?? 20) * (lowPower ? 0.8 : 1));
  if (stones > 0) {
    const rock = new THREE.InstancedMesh(
      new THREE.TetrahedronGeometry(0.17, 0),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
      stones,
    );
    const tint = new THREE.Color();
    for (let i = 0; i < stones; i++) {
      const spot = freeSpot(1.8, 10.8);
      const s = 0.5 + rnd() * 1.3;
      dummy.position.set(spot.x, h(spot.x, spot.z) + 0.08 * s, spot.z);
      dummy.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
      dummy.scale.set(s, s * 0.7, s);
      dummy.updateMatrix();
      rock.setMatrixAt(i, dummy.matrix);
      tint.set("#6b6b70").offsetHSL(0, 0, (rnd() - 0.5) * 0.16);
      rock.setColorAt(i, tint);
    }
    rock.instanceMatrix.needsUpdate = true;
    if (rock.instanceColor) rock.instanceColor.needsUpdate = true;
    world.add(rock);
  }

  /* ---------- flora baixa ---------- */

  const flowerBase = { oceano: 0, costa: 16, campina: 46, mata: 34, serra: 12 }[piece.biome] ?? 20;
  const flowerCount = Math.floor(flowerBase * (lowPower ? 0.65 : reduced ? 0.78 : 1));
  if (flowerCount > 0) {
    const stem = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.014, 0.022, 0.25, 4),
      new THREE.MeshLambertMaterial({ color: 0x71804b }),
      flowerCount,
    );
    const bloom = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.075, 0),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
      flowerCount,
    );
    const flowerColors = {
      costa: ["#f1dfb2", "#f5e8d0", "#d6c993"],
      campina: ["#f3d58a", "#eee1c3", "#e4b8a8", "#d5dced"],
      mata: ["#e9d7ae", "#d7d6be", "#d9b5c5", "#a9c1ae"],
      serra: ["#e7dfcb", "#d7b8a6", "#c3d0d2"],
    }[piece.biome] || ["#ead9b4"];
    const tint = new THREE.Color();
    const groups = Math.max(2, Math.min(6, Math.ceil(flowerCount / 9)));
    const centers = Array.from({ length: groups }, () => freeSpot(3.4, 9.2));
    for (let i = 0; i < flowerCount; i++) {
      const center = centers[i % groups];
      let x = center.x + (rnd() - 0.5) * 2.4;
      let z = center.z + (rnd() - 0.5) * 2.4;
      if (piece.nodes.some((n) => Math.hypot(n.x - x, n.z - z) < 1.1)) {
        x = center.x;
        z = center.z;
      }
      const y = h(x, z);
      const scale = 0.72 + rnd() * 0.7;
      dummy.position.set(x, y + 0.125 * scale, z);
      dummy.rotation.set(0, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.18);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      stem.setMatrixAt(i, dummy.matrix);
      dummy.position.y = y + 0.27 * scale;
      dummy.rotation.set(rnd() * 0.3, rnd() * Math.PI * 2, rnd() * 0.3);
      dummy.scale.set(scale, scale * (0.82 + rnd() * 0.36), scale);
      dummy.updateMatrix();
      bloom.setMatrixAt(i, dummy.matrix);
      tint.set(flowerColors[Math.floor(rnd() * flowerColors.length)]);
      bloom.setColorAt(i, tint);
    }
    stem.instanceMatrix.needsUpdate = true;
    bloom.instanceMatrix.needsUpdate = true;
    if (bloom.instanceColor) bloom.instanceColor.needsUpdate = true;
    world.add(stem, bloom);
  }

  /* ---------- poeira ---------- */

  const dustCount = reduced ? 40 : lowPower ? 70 : 140;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustCount * 3);
  const dustColors = new Float32Array(dustCount * 3);
  const moteBase = new THREE.Color(palette.sun);
  const moteLight = new THREE.Color("#fff7e3");
  for (let i = 0; i < dustCount; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * 10;
    dustPos[i * 3] = Math.cos(a) * r;
    dustPos[i * 3 + 1] = 0.3 + rnd() * 3.2;
    dustPos[i * 3 + 2] = Math.sin(a) * r;
    const mote = moteBase.clone().lerp(moteLight, rnd() * 0.45);
    dustColors[i * 3] = mote.r;
    dustColors[i * 3 + 1] = mote.g;
    dustColors[i * 3 + 2] = mote.b;
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute("color", new THREE.BufferAttribute(dustColors, 3));
  const dustTex = dustTexture();
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      map: dustTex,
      size: lowPower ? 0.1 : 0.13,
      transparent: true,
      opacity: 0.42,
      vertexColors: true,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  world.add(dust);

  /* ---------- multidão (VAT) ---------- */

  const crowdCount = Math.min(MAX_CROWD, piece.citizens.length);
  const crowd = createCrowdSystem(crowdCount + 1);
  crowd.setFog(palette.fog, 24, 58);
  world.add(crowd.mesh);

  const shadowTex = blobTexture();
  const shadowGeo = new THREE.CircleGeometry(0.42, 12);
  shadowGeo.rotateX(-Math.PI / 2);
  const crowdShadows = new THREE.InstancedMesh(
    shadowGeo,
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    Math.max(1, crowdCount + 1),
  );
  crowdShadows.count = crowdCount + 1;
  crowdShadows.frustumCulled = false;
  world.add(crowdShadows);

  const SCALE = [0.88, 1, 1.06, 0.94];

  const actors = [];
  for (let i = 0; i < crowdCount; i++) {
    const citizen = piece.citizens[i];
    // os primeiros cidadãos cobrem todos os nós: garante que toda atividade do
    // reino exista de fato, e não só por sorte do sorteio
    const nodeIndex = i < piece.nodes.length ? i : citizen.node % piece.nodes.length;
    const node = piece.nodes[nodeIndex] || piece.nodes[0];
    const activity = node.behavior || "parado";
    const seated = SEATED.indexOf(activity) >= 0;
    const walker = activity === "caminhar";
    const a = citizen.phase * Math.PI * 2;
    const radius = seated ? 0.42 : 0.8 + citizen.phase * 0.9;
    const x = node.x + Math.cos(a) * radius;
    const z = node.z + Math.sin(a) * radius;

    actors.push({
      x,
      z,
      tx: node.x,
      tz: node.z,
      node: nodeIndex,
      activity,
      clipName: clipFor(activity),
      clip: CLIP[clipFor(activity)] ?? CLIP.parado,
      walker,
      mode: walker ? "walk" : "act",
      timer: 4 + citizen.phase * 30,
      speed: citizen.speed,
      phase: citizen.phase,
      scale: SCALE[citizen.silhouette] || 1,
      yaw: Math.atan2(node.x - x, node.z - z),
      color: i % 3 === 0 ? SKIN[i % SKIN.length] : CLOTH[(i * 3 + citizen.silhouette) % CLOTH.length],
    });
  }

  const AVATAR = crowdCount;
  const avatar = { x: 0, z: 0, yaw: 0.6, moving: false };

  /* ---------- pistas ---------- */

  const clueGeo = new THREE.OctahedronGeometry(0.28, 0);
  const clueMat = new THREE.MeshLambertMaterial({ color: 0xc8a45c, emissive: 0x3a2a0c });
  const ringGeo = new THREE.TorusGeometry(0.46, 0.018, 6, 24);
  const clueMeshes = piece.cluePoints.map((p, i) => {
    const group = new THREE.Group();
    const core = new THREE.Mesh(clueGeo, clueMat);
    const ring = new THREE.Mesh(ringGeo, clueMat);
    ring.rotation.x = Math.PI / 2;
    group.add(core, ring);
    group.position.set(p.x, h(p.x, p.z) + 0.9, p.z);
    group.userData.idx = i;
    world.add(group);
    return group;
  });

  /* ---------- clima ---------- */

  const climate = piece.climate || "claro";
  if (climate === "névoa") {
    scene.fog = new THREE.Fog(palette.fog, 11, 36);
    crowd.setFog(palette.fog, 11, 36);
    dust.material.opacity = 0.7;
  } else if (climate === "vento") {
    dust.material.opacity = 0.62;
  }

  let weather = null;
  if (climate === "chuva" || climate === "neve") {
    const flakes = reduced ? 140 : lowPower ? 280 : 520;
    const geo = new THREE.BufferGeometry();
    const points = new Float32Array(flakes * 3);
    const fall = new Float32Array(flakes);
    for (let i = 0; i < flakes; i++) {
      points[i * 3] = (rnd() - 0.5) * 26;
      points[i * 3 + 1] = rnd() * 14;
      points[i * 3 + 2] = (rnd() - 0.5) * 26;
      fall[i] = 3 + rnd() * 4;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(points, 3));
    weather = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: climate === "neve" ? 0.11 : 0.055,
        color: climate === "neve" ? 0xffffff : 0xa9c0cf,
        transparent: true,
        opacity: climate === "neve" ? 0.85 : 0.5,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    weather.userData.fall = fall;
    world.add(weather);
  }

  /* ---------- placas ---------- */

  const signList = Array.isArray(piece.signs) ? piece.signs.slice(0, 5) : [];
  signList.forEach((sign) => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx2d = canvas.getContext("2d");
    if (ctx2d) {
      ctx2d.fillStyle = "#12161c";
      ctx2d.fillRect(0, 0, 512, 256);
      ctx2d.strokeStyle = "#c8a45c";
      ctx2d.lineWidth = 7;
      ctx2d.strokeRect(12, 12, 488, 232);
      ctx2d.fillStyle = "#efe7d6";
      ctx2d.font = "500 40px Georgia, serif";
      ctx2d.textAlign = "center";
      ctx2d.textBaseline = "middle";
      const words = String(sign.text || "").split(/\s+/).filter(Boolean);
      const lines = [];
      let line = "";
      words.forEach((word) => {
        const test = line ? `${line} ${word}` : word;
        if (ctx2d.measureText(test).width > 430 && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      });
      if (line) lines.push(line);
      const shown = lines.slice(0, 4);
      const top = 128 - ((shown.length - 1) * 52) / 2;
      shown.forEach((text, i) => ctx2d.fillText(text, 256, top + i * 52));
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const group = new THREE.Group();
    const postMat = new THREE.MeshLambertMaterial({ color: 0x6b5334 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.1, 5), postMat);
    const postB = post.clone();
    post.position.set(-0.62, 0.55, 0);
    postB.position.set(0.62, 0.55, 0);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.85),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }),
    );
    board.position.y = 1.35;
    const sx = Number(sign.x) || 0;
    const sz = Number(sign.z) || 0;
    group.position.set(sx, h(sx, sz), sz);
    group.rotation.y = Math.atan2(-sx, -sz);
    group.add(post, postB, board);
    world.add(group);
  });

  /* ---------- câmera ---------- */

  let yaw = 0.6;
  let pitch = 0.34;
  let dist = 11;
  const move = { x: 0, z: 0 };

  let cameraMode = false;
  let orientYaw = 0;
  let orientPitch = -0.1;
  let videoEl = null;
  let stream = null;
  let arScale = 0.16;
  let arYaw = 0;
  const arAnchor = new THREE.Vector3(0, -1, -3.2);

  const onOrient = (e) => {
    if (typeof e.alpha !== "number") return;
    orientYaw = (-e.alpha * Math.PI) / 180;
    if (typeof e.beta === "number") orientPitch = Math.max(-0.9, Math.min(0.5, (e.beta - 75) * 0.012));
  };

  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(1.9, 2.0, 48),
    new THREE.MeshBasicMaterial({ color: 0xc8a45c, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  reticle.rotation.x = -Math.PI / 2;
  reticle.position.set(0, -1.02, -3.2);
  reticle.visible = false;
  scene.add(reticle);

  const arGround = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 5.2),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.75, depthWrite: false }),
  );
  arGround.rotation.x = -Math.PI / 2;
  arGround.position.set(0, -1.01, -3.2);
  arGround.visible = false;
  scene.add(arGround);

  function applyAr() {
    world.position.copy(arAnchor);
    world.rotation.y = arYaw;
    world.scale.setScalar(arScale);
    reticle.position.set(arAnchor.x, arAnchor.y - 0.01, arAnchor.z);
    arGround.position.set(arAnchor.x, arAnchor.y - 0.005, arAnchor.z);
    arGround.scale.setScalar(arScale * 4.6);
  }

  function anchorAhead() {
    const forwardX = -Math.sin(orientYaw);
    const forwardZ = -Math.cos(orientYaw);
    arAnchor.set(forwardX * 3.2, -1.02, forwardZ * 3.2);
    applyAr();
  }

  async function enableCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return "unsupported";
    try {
      if (typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission) {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== "granted") return "denied";
      }
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      videoEl = document.createElement("video");
      videoEl.setAttribute("playsinline", "true");
      videoEl.muted = true;
      videoEl.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;background:#000;";
      videoEl.srcObject = stream;
      container.style.position = "relative";
      container.insertBefore(videoEl, renderer.domElement);
      renderer.domElement.style.position = "relative";
      renderer.domElement.style.zIndex = "1";
      await videoEl.play();
      window.addEventListener("deviceorientation", onOrient);

      cameraMode = true;
      sky.visible = false;
      scene.background = null;
      renderer.setClearAlpha(0);
      scene.fog = new THREE.Fog(palette.fog, 6, 22);
      crowd.setFog(palette.fog, 6, 22);
      arScale = 0.16;
      arYaw = 0;
      anchorAhead();
      reticle.visible = true;
      arGround.visible = true;
      onStatus("camera");
      return "camera";
    } catch (err) {
      disableCamera();
      onStatus("orbit");
      return "denied";
    }
  }

  function disableCamera() {
    window.removeEventListener("deviceorientation", onOrient);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (videoEl) {
      videoEl.remove();
      videoEl = null;
    }
    cameraMode = false;
    sky.visible = true;
    scene.background = new THREE.Color(palette.fog);
    renderer.setClearAlpha(1);
    scene.fog = new THREE.Fog(palette.fog, 24, 58);
    crowd.setFog(palette.fog, 24, 58);
    world.position.set(0, 0, 0);
    world.rotation.y = 0;
    world.scale.setScalar(1);
    reticle.visible = false;
    arGround.visible = false;
    onStatus("orbit");
  }

  /* ---------- entrada ---------- */

  const pointers = new Map();
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let dragged = 0;
  let pinchStart = 0;
  let pinchScale = 0;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const onDown = (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragging = true;
    dragged = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      pinchStart = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchScale = arScale;
    }
    renderer.domElement.setPointerCapture && renderer.domElement.setPointerCapture(e.pointerId);
  };

  const onMove = (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2 && cameraMode && pinchStart > 0) {
      const pts = Array.from(pointers.values());
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      arScale = Math.max(0.07, Math.min(0.5, (pinchScale * d) / pinchStart));
      applyAr();
      return;
    }

    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    dragged += Math.abs(dx) + Math.abs(dy);

    if (cameraMode) {
      arYaw -= dx * 0.006;
      applyAr();
      return;
    }
    yaw -= dx * 0.006;
    pitch = Math.max(0.06, Math.min(1.15, pitch + dy * 0.004));
  };

  const onUp = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = 0;
    if (!dragging) return;
    dragging = false;
    if (dragged > 8) return;

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(clueMeshes, true)[0];
    if (hit) {
      let obj = hit.object;
      while (obj && obj.userData.idx === undefined) obj = obj.parent;
      const idx = obj ? obj.userData.idx : -1;
      const p = piece.cluePoints[idx];
      if (p && Math.hypot(avatar.x - p.x, avatar.z - p.z) < 2.6) onClue(idx, p.x, p.z);
      else if (p) onNearClue({ idx, far: true });
      return;
    }

    if (cameraMode) anchorAhead();
  };

  const onWheel = (e) => {
    if (cameraMode) return;
    dist = Math.max(6, Math.min(18, dist + e.deltaY * 0.01));
  };

  const el = renderer.domElement;
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
  el.addEventListener("wheel", onWheel, { passive: true });

  /* ---------- loop ---------- */

  const clock = new THREE.Clock();
  let raf = 0;
  let accSteer = 0;
  let accTalk = 0;
  let paused = false;
  let lastNearIdx = -1;
  let frameCount = 0;
  const FRAME_WINDOW = 90;
  const frameTimes = new Float32Array(FRAME_WINDOW);
  let frameSamples = 0;
  let frameTimeIndex = 0;
  let frameTimeTotal = 0;
  let perfCheckSamples = 0;
  let lastFrameAt = 0;

  function steer(dt) {
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      if (!a.walker) continue;
      a.timer -= dt;
      if (a.mode === "act") {
        if (a.timer <= 0) {
          const next = (a.node + 1 + (i % 3)) % piece.nodes.length;
          a.node = next;
          a.tx = piece.nodes[next].x + Math.sin(i * 2.3) * 0.9;
          a.tz = piece.nodes[next].z + Math.cos(i * 1.7) * 0.9;
          a.mode = "walk";
          a.timer = 18;
        }
        continue;
      }
      const dx = a.tx - a.x;
      const dz = a.tz - a.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.35) {
        a.mode = "act";
        a.timer = 8 + ((i * 37) % 30);
        continue;
      }
      const sp = a.speed * 0.85;
      a.x += (dx / d) * sp * dt;
      a.z += (dz / d) * sp * dt;
      a.yaw = Math.atan2(dx, dz);
    }
  }

  function composeCrowd(t) {
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      const gy = h(a.x, a.z);
      crowd.set(i, {
        x: a.x,
        y: gy,
        z: a.z,
        yaw: a.yaw,
        scale: a.scale,
        clip: a.walker ? CLIP.caminhar : a.clip,
        phase: a.phase,
        rate: a.walker ? clipRate("caminhar") * (0.8 + a.speed * 0.3) : clipRate(a.clipName),
        color: a.color,
      });
      dummy.position.set(a.x, gy + 0.02, a.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(a.scale, a.scale, a.scale);
      dummy.updateMatrix();
      crowdShadows.setMatrixAt(i, dummy.matrix);
    }

    const ay = h(avatar.x, avatar.z);
    crowd.set(AVATAR, {
      x: avatar.x,
      y: ay,
      z: avatar.z,
      yaw: avatar.yaw,
      scale: 1.04,
      clip: avatar.moving ? CLIP.caminhar : CLIP.parado,
      phase: 0,
      rate: avatar.moving ? 1.35 : 0.4,
      color: "#e6e2da",
    });
    dummy.position.set(avatar.x, ay + 0.02, avatar.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1.1, 1.1, 1.1);
    dummy.updateMatrix();
    crowdShadows.setMatrixAt(AVATAR, dummy.matrix);

    crowd.commit();
    crowdShadows.instanceMatrix.needsUpdate = true;
    crowd.setTime(reduced ? 0 : t);
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    if (paused) return;

    const frameAt = performance.now();
    if (lastFrameAt) {
      const elapsed = Math.min(100, frameAt - lastFrameAt);
      if (frameSamples === FRAME_WINDOW) frameTimeTotal -= frameTimes[frameTimeIndex];
      else frameSamples++;
      frameTimes[frameTimeIndex] = elapsed;
      frameTimeTotal += elapsed;
      frameTimeIndex = (frameTimeIndex + 1) % FRAME_WINDOW;

      if (frameSamples === FRAME_WINDOW && ++perfCheckSamples >= FRAME_WINDOW) {
        const meanFrameMs = frameTimeTotal / FRAME_WINDOW;
        perfCheckSamples = 0;
        // Hysteresis avoids flicker: reduce pixel cost only after sustained slow frames,
        // and restore detail more gently once there is consistent headroom.
        if (meanFrameMs > 30) setResolutionScale(resolutionScale - 0.12);
        else if (meanFrameMs > 22) setResolutionScale(resolutionScale - 0.08);
        else if (meanFrameMs < 16.8) setResolutionScale(resolutionScale + 0.04);
      }
    }
    lastFrameAt = frameAt;

    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;

    accSteer += dt;
    if (accSteer > 0.1) {
      steer(accSteer);
      accSteer = 0;
    }

    const viewYaw = cameraMode ? orientYaw : yaw;
    const fwdX = -Math.sin(viewYaw);
    const fwdZ = -Math.cos(viewYaw);
    const rightX = Math.cos(viewYaw);
    const rightZ = -Math.sin(viewYaw);
    let vx = fwdX * move.z + rightX * move.x;
    let vz = fwdZ * move.z + rightZ * move.x;
    const mag = Math.hypot(vx, vz);
    avatar.moving = mag > 0.05;
    if (avatar.moving) {
      vx /= mag;
      vz /= mag;
      const sp = 2.6 * Math.min(1, mag);
      avatar.x += vx * sp * dt;
      avatar.z += vz * sp * dt;
      avatar.yaw = Math.atan2(vx, vz);
    }
    const rad = Math.hypot(avatar.x, avatar.z);
    if (rad > 10) {
      avatar.x = (avatar.x / rad) * 10;
      avatar.z = (avatar.z / rad) * 10;
    }
    const ay = h(avatar.x, avatar.z);

    composeCrowd(t);

    for (let i = 0; i < clueMeshes.length; i++) {
      const m = clueMeshes[i];
      if (!reduced) {
        m.rotation.y = t * 0.8 + i;
        m.position.y = h(m.position.x, m.position.z) + 0.95 + Math.sin(t * 1.6 + i) * 0.12;
      }
    }

    water.position.y = -0.02 + (reduced ? 0 : Math.sin(t * 0.6) * 0.015);

    if (weather && !reduced) {
      const attr = weather.geometry.attributes.position;
      const fall = weather.userData.fall;
      for (let i = 0; i < attr.count; i++) {
        let y = attr.getY(i) - fall[i] * dt * (climate === "neve" ? 0.5 : 2.4);
        if (y < -0.4) {
          y = 13;
          attr.setX(i, (rnd() - 0.5) * 26);
          attr.setZ(i, (rnd() - 0.5) * 26);
        }
        attr.setY(i, y);
      }
      attr.needsUpdate = true;
    }

    if (!reduced) {
      rippleTex.offset.x = t * 0.012;
      rippleTex.offset.y = t * 0.008;
      dust.rotation.y = t * 0.015;
      dust.position.y = Math.sin(t * 0.4) * 0.06;
    }

    if (cameraMode) {
      camera.position.set(0, 0, 0);
      camera.rotation.set(orientPitch, orientYaw, 0, "YXZ");
      reticle.material.opacity = reduced ? 0.42 : 0.35 + Math.sin(t * 2) * 0.12;
    } else {
      const cosP = Math.cos(pitch);
      camera.position.set(
        avatar.x + Math.sin(yaw) * cosP * dist,
        ay + 1.1 + Math.sin(pitch) * dist,
        avatar.z + Math.cos(yaw) * cosP * dist,
      );
      camera.lookAt(avatar.x, ay + 1.05, avatar.z);
    }

    accTalk += dt;
    if (accTalk > 0.4) {
      accTalk = 0;
      let bestIdx = -1;
      let bestD = 3.5;
      for (let i = 0; i < actors.length; i++) {
        const d = Math.hypot(actors[i].x - avatar.x, actors[i].z - avatar.z);
        if (d < bestD) {
          bestD = d;
          bestIdx = i;
        }
      }
      if (bestIdx !== lastNearIdx) {
        lastNearIdx = bestIdx;
        onNear(bestIdx >= 0 ? { idx: bestIdx, activity: actors[bestIdx].activity } : null);
      }
      let nearClue = null;
      for (let i = 0; i < piece.cluePoints.length; i++) {
        const p = piece.cluePoints[i];
        if (Math.hypot(avatar.x - p.x, avatar.z - p.z) < 2.6) nearClue = i;
      }
      onNearClue(nearClue === null ? null : { idx: nearClue, far: false });
    }

    renderer.render(scene, camera);
    frameCount++;
    if (frameCount >= 120 && frameCount % 120 === 0) {
      opts.onMetrics &&
        opts.onMetrics({
          ms: Math.round((frameTimeTotal / Math.max(1, frameSamples)) * 100) / 100,
          pixelRatio: Math.round(basePixelRatio * resolutionScale * 100) / 100,
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          crowd: crowdCount,
        });
    }
  }

  const resize = () => {
    const w = container.clientWidth || 1;
    const hh = container.clientHeight || 1;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const onVisibility = () => {
    paused = document.hidden;
    lastFrameAt = 0;
    if (paused) {
      frameSamples = 0;
      frameTimeIndex = 0;
      frameTimeTotal = 0;
      perfCheckSamples = 0;
    } else {
      clock.getDelta();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  tick();

  return {
    setMove(x, z) {
      move.x = x;
      move.z = z;
    },
    getAvatar() {
      return { x: avatar.x, z: avatar.z };
    },
    recenter() {
      avatar.x = 0;
      avatar.z = 0;
      yaw = 0.6;
      pitch = 0.34;
      dist = 11;
      orientYaw = 0;
      orientPitch = -0.1;
      if (cameraMode) {
        arScale = 0.16;
        arYaw = 0;
        anchorAhead();
      }
    },
    anchor: anchorAhead,
    setArScale(v) {
      arScale = Math.max(0.07, Math.min(0.5, v));
      if (cameraMode) applyAr();
    },
    enableCamera,
    disableCamera,
    isCameraOn: () => cameraMode,
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      disableCamera();
      crowd.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
      soilTex.dispose();
      rippleTex.dispose();
      dustTex.dispose();
      shadowTex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

export { mixHex };