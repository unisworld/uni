// world.js — o mundo em 3D. Sem pós-processamento, sem arquivos externos.
import * as THREE from 'three';

const LOW = matchMedia('(hover:none)').matches && (navigator.hardwareConcurrency || 4) <= 4;
const REDUCE = matchMedia('(prefers-reduced-motion:reduce)').matches;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const WATER_Y = -6.2;
const RADIUS = 96;

let seedNum = 1;
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seedNum * 0.017) * 43758.5453123;
  return s - Math.floor(s);
}
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x, y, o) {
  let s = 0, amp = .5, f = 1, n = 0;
  for (let i = 0; i < (o || 4); i++) { s += amp * noise(x * f, y * f); n += amp; f *= 2.03; amp *= .5; }
  return s / n;
}
function baseHeight(x, z) {
  const h = (fbm(x * .006, z * .006, 4) - .5) * 26 + (fbm(x * .03, z * .03, 3) - .5) * 3.2;
  const d = Math.hypot(x, z) / RADIUS;
  return h - d * d * 5.5;
}
function heightAt(x, z) {
  let h = baseHeight(x, z);
  const b = Math.hypot(x, z) / 34;
  h -= (1 - sstep(.25, 1.1, b)) * 15;
  return h;
}

export function initWorld(canvas, hooks) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, LOW ? 1.5 : 1.9));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !LOW;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const fog = new THREE.Color(0xc4cbb3);
  scene.fog = new THREE.FogExp2(fog, .0125);
  scene.background = fog.clone();

  const camera = new THREE.PerspectiveCamera(57, innerWidth / innerHeight, .08, 700);

  const uTime = { value: 0 };
  const sunDir = new THREE.Vector3(-.5, .38, -.76).normalize();

  /* céu */
  const skyU = {
    top: { value: new THREE.Color(0x061a30) },
    mid: { value: new THREE.Color(0x5f93a2) },
    bot: { value: new THREE.Color(0xffcb8e) },
    t: uTime
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 v; void main(){ v=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: [
      'varying vec3 v; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform float t;',
      'float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }',
      'float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);',
      ' return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y); }',
      'float fb(vec2 p){ float s=0.,a=.5; for(int i=0;i<4;i++){ s+=a*n(p); p*=2.05; a*=.5; } return s; }',
      'void main(){',
      ' float y = clamp(v.y*.5+.5,0.,1.);',
      ' vec3 c = mix(bot, mid, smoothstep(.46,.62,y));',
      ' c = mix(c, top, smoothstep(.58,.99,y));',
      ' vec2 cp = vec2(atan(v.z,v.x)*2.4, v.y*4.2);',
      ' float cv = fb(cp*vec2(1.3,2.8)+vec2(t*.003,0.))*.6 + fb(cp*vec2(3.4,7.)+vec2(t*.006,9.))*.4;',
      ' cv = smoothstep(.46,.8,cv)*smoothstep(.01,.2,v.y);',
      ' c = mix(c, mix(vec3(.6,.65,.7), vec3(1.,.97,.92), smoothstep(.3,.95,cv)), cv*.9);',
      ' gl_FragColor = vec4(c,1.);',
      ' #include <tonemapping_fragment>',
      ' #include <colorspace_fragment>',
      '}'
    ].join('\n')
  }));
  sky.frustumCulled = false;
  scene.add(sky);

  /* luzes */
  const hemi = new THREE.HemisphereLight(0xd6e9ef, 0x44543a, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdfb2, 2.4);
  sun.castShadow = !LOW;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -32; sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 32; sun.shadow.camera.bottom = -32;
  sun.shadow.camera.far = 160;
  sun.shadow.bias = -.0008;
  scene.add(sun, sun.target);
  scene.add(new THREE.DirectionalLight(0x8fb6c9, .45).translateX(-40).translateY(30));

  /* terreno */
  const SEG = LOW ? 110 : 160;
  const geo = new THREE.PlaneGeometry(RADIUS * 2.4, RADIUS * 2.4, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  const nrm = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const cA = new THREE.Color(0x2c4d1a), cB = new THREE.Color(0x7ba249);
  const cSand = new THREE.Color(0xc7ae7f), cSilt = new THREE.Color(0x33403a);
  const cDeep = new THREE.Color(0x14232a), cRock = new THREE.Color(0x87816f);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    tmp.copy(cA).lerp(cB, fbm(x * .03, z * .03, 2));
    if (y < WATER_Y + 2) tmp.lerp(cSand, sstep(WATER_Y + 2, WATER_Y - 1, y));
    if (y < WATER_Y - 2) tmp.lerp(cSilt, sstep(WATER_Y - 2, WATER_Y - 8, y));
    if (y < WATER_Y - 10) tmp.lerp(cDeep, sstep(WATER_Y - 10, WATER_Y - 20, y));
    tmp.lerp(cRock, sstep(.28, .6, 1 - nrm.getY(i)));
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .97 }));
  ground.receiveShadow = true;
  scene.add(ground);

  /* água */
  const waterU = { t: uTime, deep: { value: new THREE.Color(0x07222c) }, shal: { value: new THREE.Color(0x84c3b6) }, fog: { value: fog }, under: { value: 0 } };
  const waterGeo = new THREE.PlaneGeometry(RADIUS * 6, RADIUS * 6);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, uniforms: waterU,
    vertexShader: 'varying vec3 w; void main(){ vec4 p=modelMatrix*vec4(position,1.); w=p.xyz; gl_Position=projectionMatrix*viewMatrix*p; }',
    fragmentShader: [
      'varying vec3 w; uniform float t; uniform vec3 deep; uniform vec3 shal; uniform vec3 fog; uniform float under;',
      'float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }',
      'float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);',
      ' return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y); }',
      'void main(){',
      ' vec2 p = w.xz;',
      ' float a = sin(p.x*.09+t*.5)*.5+sin(p.y*.12-t*.4)*.5;',
      ' vec3 c = mix(deep, shal, clamp(.32+a*.3,0.,1.));',
      ' vec3 V = normalize(cameraPosition - w);',
      ' c = mix(c, vec3(.62,.78,.82), pow(1.-clamp(abs(V.y),0.,1.),3.)*.5);',
      ' float g = pow(clamp(n(p*.9+t*.1)*n(p*.4-t*.07)*2.6,0.,1.),9.);',
      ' c += vec3(1.,.96,.86)*g*.5;',
      ' float d = length(w-cameraPosition);',
      ' c = mix(c, fog, smoothstep(90.,420.,d));',
      ' gl_FragColor = vec4(c, mix(.74,.94,under));',
      ' #include <tonemapping_fragment>',
      ' #include <colorspace_fragment>',
      '}'
    ].join('\n')
  }));
  water.position.y = WATER_Y;
  scene.add(water);

  /* colisão */
  const grid = new Map();
  const addCol = (x, z, r) => {
    const k = (x / 8 | 0) + '|' + (z / 8 | 0);
    (grid.get(k) || grid.set(k, []).get(k)).push({ x, z, r });
  };
  function solve(x, z, pr) {
    const ix = x / 8 | 0, iz = z / 8 | 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const arr = grid.get((ix + a) + '|' + (iz + b));
      if (!arr) continue;
      for (const c of arr) {
        const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), m = c.r + pr;
        if (d < m && d > 1e-4) { x += (dx / d) * (m - d); z += (dz / d) * (m - d); }
      }
    }
    return [x, z];
  }

  /* árvores e pedras */
  const dummy = new THREE.Object3D();
  const TREES = LOW ? 120 : 190;
  const trunkG = new THREE.CylinderGeometry(.14, .32, 3.6, 5);
  trunkG.translate(0, 1.8, 0);
  const trunkM = new THREE.MeshStandardMaterial({ color: 0x554132, roughness: .95 });
  const trunkI = new THREE.InstancedMesh(trunkG, trunkM, TREES);
  trunkI.castShadow = true;
  const leafG = new THREE.IcosahedronGeometry(1.5, 1);
  const leafM = new THREE.MeshStandardMaterial({ roughness: .85, flatShading: true });
  const leafI = new THREE.InstancedMesh(leafG, leafM, TREES);
  leafI.castShadow = true;
  leafM.onBeforeCompile = (s) => {
    s.uniforms.uTime = uTime;
    s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n float sw=sin(uTime*.9+instanceMatrix[3][0]*.3);\n transformed.x+=sw*.16;\n transformed.z+=sw*.1;');
  };
  const cTmp = new THREE.Color();
  let ti = 0, tg = 0;
  while (ti < TREES && tg < TREES * 30) {
    tg++;
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * RADIUS * .92;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x, z) < 13) continue;
    const y = heightAt(x, z);
    if (y < WATER_Y + 1) continue;
    const s = rnd(.8, 1.9);
    dummy.position.set(x, y - .1, z);
    dummy.rotation.set(0, Math.random() * 6.283, 0);
    dummy.scale.set(s, s * rnd(.9, 1.3), s);
    dummy.updateMatrix();
    trunkI.setMatrixAt(ti, dummy.matrix);
    dummy.position.y = y + 2.9 * s;
    const ls = s * rnd(.85, 1.2);
    dummy.scale.set(ls, ls, ls);
    dummy.updateMatrix();
    leafI.setMatrixAt(ti, dummy.matrix);
    cTmp.setHSL(rnd(.22, .33), rnd(.35, .55), rnd(.24, .42));
    leafI.setColorAt(ti, cTmp);
    addCol(x, z, .5 * s);
    ti++;
  }
  trunkI.count = leafI.count = ti;
  if (leafI.instanceColor) leafI.instanceColor.needsUpdate = true;
  scene.add(trunkI, leafI);

  const STONES = 70;
  const stG = new THREE.DodecahedronGeometry(1, 0);
  const stM = new THREE.MeshStandardMaterial({ color: 0x87816f, roughness: .93, flatShading: true });
  const stI = new THREE.InstancedMesh(stG, stM, STONES);
  stI.castShadow = true;
  let si = 0, sg2 = 0;
  while (si < STONES && sg2 < STONES * 25) {
    sg2++;
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * RADIUS * .9;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = heightAt(x, z);
    if (y < WATER_Y + .3) continue;
    const s = rnd(.4, 2.2);
    dummy.position.set(x, y + s * .25, z);
    dummy.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3));
    dummy.scale.set(s, s * rnd(.5, 1), s);
    dummy.updateMatrix();
    stI.setMatrixAt(si, dummy.matrix);
    if (s > 1) addCol(x, z, s * .7);
    si++;
  }
  stI.count = si;
  scene.add(stI);

  /* grama */
  const GRASS = LOW ? 5000 : 12000;
  const bladeG = new THREE.ConeGeometry(.07, .7, 3);
  bladeG.translate(0, .35, 0);
  const bladeM = new THREE.MeshStandardMaterial({ roughness: .9, flatShading: true });
  bladeM.onBeforeCompile = (s) => {
    s.uniforms.uTime = uTime;
    s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vec2 ip=vec2(instanceMatrix[3][0],instanceMatrix[3][2]);\n' +
      ' transformed*=1.-smoothstep(48.,110.,distance(ip,cameraPosition.xz));\n' +
      ' float sw=sin(uTime*1.2+ip.x*.4+ip.y*.3);\n transformed.x+=sw*.12*position.y;');
  };
  const grassI = new THREE.InstancedMesh(bladeG, bladeM, GRASS);
  let gi = 0, gg = 0;
  while (gi < GRASS && gg < GRASS * 8) {
    gg++;
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * RADIUS * .8;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = heightAt(x, z);
    if (y < WATER_Y + .5) continue;
    dummy.position.set(x, y - .04, z);
    dummy.rotation.set(rnd(-.1, .1), Math.random() * 6.283, rnd(-.1, .1));
    const s = rnd(.6, 1.4);
    dummy.scale.set(s, s * rnd(.7, 1.3), s);
    dummy.updateMatrix();
    grassI.setMatrixAt(gi, dummy.matrix);
    cTmp.setHSL(rnd(.2, .3), rnd(.35, .55), rnd(.26, .46));
    grassI.setColorAt(gi, cTmp);
    gi++;
  }
  grassI.count = gi;
  if (grassI.instanceColor) grassI.instanceColor.needsUpdate = true;
  scene.add(grassI);

  /* partículas */
  function dot(warm) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const x = cv.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, warm ? 'rgba(255,240,200,1)' : 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const warmDot = dot(true);
  const coldDot = dot(false);

  const FF = LOW ? 220 : 420;
  const ffBase = new Float32Array(FF * 3), ffPos = new Float32Array(FF * 3);
  for (let i = 0; i < FF; i++) {
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * RADIUS * .8;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    ffBase[i * 3] = x; ffBase[i * 3 + 2] = z;
    ffBase[i * 3 + 1] = Math.max(heightAt(x, z), WATER_Y + .5) + rnd(.5, 4);
    ffPos.set([x, ffBase[i * 3 + 1], z], i * 3);
  }
  const ffG = new THREE.BufferGeometry();
  ffG.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  const flies = new THREE.Points(ffG, new THREE.PointsMaterial({
    size: .38, map: warmDot, color: 0xffe6b0, transparent: true, opacity: .85,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
  }));
  scene.add(flies);

  /* portal */
  const portal = new THREE.Group();
  const pg = new THREE.BoxGeometry(1.3, 6.8, 1.3);
  const pMat = new THREE.MeshStandardMaterial({ color: 0x6d6a61, roughness: .85, emissive: 0x2a2318, emissiveIntensity: .4 });
  const pl = new THREE.Mesh(pg, pMat); pl.position.set(-2.2, 3.4, 0);
  const pr = new THREE.Mesh(pg, pMat); pr.position.set(2.2, 3.4, 0);
  const lint = new THREE.Mesh(new THREE.BoxGeometry(6, 1.3, 1.4), pMat); lint.position.set(0, 7.1, 0);
  [pl, pr, lint].forEach((m) => { m.castShadow = true; portal.add(m); });
  const portalPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { t: uTime },
    vertexShader: 'varying vec2 u; void main(){ u=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: [
      'varying vec2 u; uniform float t;',
      'float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }',
      'void main(){',
      ' vec2 p=u-.5; float r=length(p*vec2(1.,1.5)); float a=atan(p.y,p.x);',
      ' float s=sin(a*3.+t*.6)*.5+.5;',
      ' float ring=sin(r*26.-t*2.2+s*3.)*.5+.5;',
      ' vec3 c=mix(vec3(.72,.11,.06), vec3(1.,.8,.46), ring*.8+.2);',
      ' gl_FragColor=vec4(c*(.45+ring*.7), smoothstep(.62,.24,r)*(.16+.4*ring)*.85);',
      '}'
    ].join('\n')
  }));
  portalPlane.position.y = 3.2;
  portal.add(portalPlane);
  const pLight = new THREE.PointLight(0xffd9a0, 3.4, 26, 2);
  pLight.position.y = 3.2;
  portal.add(pLight);
  portal.position.set(0, 0, -30);
  portal.visible = false;
  scene.add(portal);

  /* marcadores de pista */
  const markers = [];
  const mkGeo = new THREE.RingGeometry(.55, .78, 26);
  mkGeo.rotateX(-Math.PI / 2);
  function makeMarker(x, z, idx) {
    const m = new THREE.Mesh(mkGeo, new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: .85, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    m.position.set(x, heightAt(x, z) + .07, z);
    m.visible = false;
    scene.add(m);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 3.4, 6), new THREE.MeshStandardMaterial({
      color: 0xffe6b8, emissive: 0xffc98a, emissiveIntensity: 1.4, transparent: true, opacity: .5
    }));
    col.position.set(x, heightAt(x, z) + 1.7, z);
    col.visible = false;
    scene.add(col);
    markers[idx] = { ring: m, col, x, z, taken: false, near: false };
  }

  /* herói */
  const heroM = new THREE.MeshStandardMaterial({ color: 0xfff7e9, roughness: .55, emissive: 0x39434d, emissiveIntensity: .26 });
  const hero = new THREE.Group();
  hero.rotation.order = 'YXZ';
  scene.add(hero);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.19, .42, 6, 12), heroM);
  torso.position.y = .92; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.24, 18, 14), heroM);
  head.position.y = 1.42; head.castShadow = true;
  hero.add(torso, head);
  const limb = (r, l) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 8), heroM);
    m.position.y = -(l / 2 + r * .6);
    m.castShadow = true;
    g.add(m);
    return g;
  };
  const aL = limb(.05, .32); aL.position.set(.24, 1.12, 0);
  const aR = limb(.05, .32); aR.position.set(-.24, 1.12, 0);
  const lL = limb(.06, .32); lL.position.set(.09, .62, 0);
  const lR = limb(.06, .32); lR.position.set(-.09, .62, 0);
  hero.add(aL, aR, lL, lR);
  const hLight = new THREE.PointLight(0xfff0d6, 1.4, 8, 2);
  hLight.position.y = 1.2;
  hero.add(hLight);
  hero.position.set(0, 0, 8);

  /* estado */
  const keys = new Set();
  const joy = { x: 0, y: 0 };
  let yaw = 0, pitch = .26, drag = null, dx = 0, dy = 0, jid = null, jx = 0, jy = 0;
  let walk = 0, heroYaw = Math.PI, paused = false, visible = true;
  const vel = new THREE.Vector3();
  let onNear = hooks && hooks.onNear || (() => {});
  let onFar = hooks && hooks.onFar || (() => {});

  function bind() {
    addEventListener('pointerdown', (e) => {
      if (e.target !== canvas) return;
      if (e.pointerType !== 'mouse' && e.clientX < innerWidth * .5 && e.clientY > innerHeight * .5) {
        jid = e.pointerId;
        jx = e.clientX; jy = e.clientY;
        return;
      }
      drag = e.pointerId; dx = e.clientX; dy = e.clientY;
    }, { passive: true });
    addEventListener('pointermove', (e) => {
      if (e.pointerId === jid) {
        const ax = clamp((e.clientX - jx) / 46, -1, 1), ay = clamp((e.clientY - jy) / 46, -1, 1);
        joy.x = ax; joy.y = ay;
        if (hooks && hooks.onJoy) hooks.onJoy(ax, ay);
      } else if (e.pointerId === drag) {
        yaw -= (e.clientX - dx) * .0055;
        pitch = clamp(pitch - (e.clientY - dy) * .004, -.2, 1.1);
        dx = e.clientX; dy = e.clientY;
      }
    }, { passive: true });
    const up = (e) => {
      if (e.pointerId === jid) { jid = null; joy.x = joy.y = 0; if (hooks && hooks.onJoy) hooks.onJoy(0, 0); }
      if (e.pointerId === drag) drag = null;
    };
    addEventListener('pointerup', up, { passive: true });
    addEventListener('pointercancel', up, { passive: true });
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      keys.add(e.code);
    });
    addEventListener('keyup', (e) => keys.delete(e.code));
    addEventListener('wheel', (e) => { pitch = clamp(pitch + Math.sign(e.deltaY) * .02, -.2, 1.1); }, { passive: true });
    addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
    document.addEventListener('visibilitychange', () => { paused = document.hidden; });
  }
  bind();

  /* ajuste de qualidade */
  let qAcc = 0, qN = 0, qRatio = renderer.getPixelRatio();
  function adapt(dt) {
    if (qAcc < 2) { qAcc += dt; return; }
    qN++;
    if (qN < 40) return;
    qAcc = 0; qN = 0;
    if (dt > .026 && qRatio > 1) {
      qRatio = Math.max(1, qRatio * .82);
      renderer.setPixelRatio(qRatio);
      renderer.setSize(innerWidth, innerHeight);
    }
  }

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), .05);
    if (paused || !visible) return;
    uTime.value += dt;
    adapt(dt);

    let f = 0, s = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
    f += -joy.y; s += joy.x;
    const m = Math.hypot(f, s);
    if (m > 1) { f /= m; s /= m; }

    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    vel.x = lerp(vel.x, (fx * f + rx * s) * 5.2, 1 - Math.pow(.001, dt));
    vel.z = lerp(vel.z, (fz * f + rz * s) * 5.2, 1 - Math.pow(.001, dt));

    let nx = hero.position.x + vel.x * dt, nz = hero.position.z + vel.z * dt;
    [nx, nz] = solve(nx, nz, .42);
    nx = clamp(nx, -RADIUS, RADIUS); nz = clamp(nz, -RADIUS, RADIUS);
    hero.position.x = nx; hero.position.z = nz;

    const gy = heightAt(nx, nz);
    const depth = WATER_Y - gy;
    const tY = depth > .9 ? WATER_Y - .3 - clamp((depth - .9) / 8, 0, 1) * (depth - 1) : gy;
    hero.position.y = lerp(hero.position.y, Math.max(tY, gy + .28), Math.min(1, dt * (depth > .9 ? 4 : 12)));

    const sp = Math.hypot(vel.x, vel.z);
    if (sp > .25) heroYaw = Math.atan2(vel.x, vel.z);
    let d = heroYaw - hero.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    hero.rotation.y += d * Math.min(1, dt * 9);
    hero.rotation.x = lerp(hero.rotation.x, depth > 1 ? .8 : 0, Math.min(1, dt * 4));

    walk += dt * (1.8 + sp * 1.6);
    const sw = sp > .4 ? Math.sin(walk) * Math.min(.85, sp / 6) : 0;
    aL.rotation.x = lerp(aL.rotation.x, sw, Math.min(1, dt * 12));
    aR.rotation.x = lerp(aR.rotation.x, -sw, Math.min(1, dt * 12));
    lL.rotation.x = lerp(lL.rotation.x, -sw, Math.min(1, dt * 14));
    lR.rotation.x = lerp(lR.rotation.x, sw, Math.min(1, dt * 14));
    const bob = sp > .4 ? Math.abs(Math.sin(walk)) * .04 : Math.sin(uTime.value * 1.3) * .02;
    torso.position.y = .92 + bob; head.position.y = 1.42 + bob;

    const cp = Math.cos(pitch);
    camera.position.x = lerp(camera.position.x, hero.position.x + Math.sin(yaw) * cp * 7.6, 1 - Math.pow(.001, dt));
    camera.position.z = lerp(camera.position.z, hero.position.z + Math.cos(yaw) * cp * 7.6, 1 - Math.pow(.001, dt));
    camera.position.y = lerp(camera.position.y, hero.position.y + 1.8 + Math.sin(pitch) * 7.6, 1 - Math.pow(.001, dt));
    camera.lookAt(hero.position.x, hero.position.y + 1.1, hero.position.z);

    const under = clamp((WATER_Y - camera.position.y) / 3, 0, 1);
    waterU.under.value = under;
    scene.fog.density = .0125 + under * .03;
    hemi.intensity = 1.05 - under * .5;

    for (let i = 0; i < FF; i++) {
      const p = ffG.attributes.position.array;
      p[i * 3] = ffBase[i * 3] + Math.sin(uTime.value * .45 + i) * 1.6;
      p[i * 3 + 1] = ffBase[i * 3 + 1] + Math.sin(uTime.value * .8 + i * .4) * .7;
      p[i * 3 + 2] = ffBase[i * 3 + 2] + Math.cos(uTime.value * .38 + i) * 1.6;
    }
    ffG.attributes.position.needsUpdate = true;

    for (let i = 0; i < markers.length; i++) {
      const mk = markers[i];
      if (!mk || mk.taken) continue;
      mk.ring.rotation.y += dt;
      const dd = Math.hypot(hero.position.x - mk.x, hero.position.z - mk.z);
      const near = dd < 5.5;
      if (near !== mk.near) {
        mk.near = near;
        near ? onNear(i) : onFar(i);
      }
      mk.ring.material.opacity = near ? 1 : .7;
    }

    if (portal.visible) {
      const pd = Math.hypot(hero.position.x - portal.position.x, hero.position.z - portal.position.z);
      if (pd < 3 && hooks && hooks.onPortal) { hooks.onPortal(); }
      pLight.intensity = 3 + Math.sin(uTime.value * 2) * .8;
    }

    sun.target.position.copy(hero.position);
    sun.position.copy(hero.position).addScaledVector(sunDir, 120);
    sky.position.copy(camera.position);

    renderer.render(scene, camera);
  }

  const clock = new THREE.Clock();
  camera.position.set(0, 3, 16);
  camera.lookAt(0, 1, 8);
  requestAnimationFrame(frame);

  /* API pública */
  return {
    setRealm(o) {
      o = o || {};
      seedNum = (o.seed || 1) % 100000 + 1;
      const bi = o.biome || 0;
      const hue = (bi * .11 + .28) % 1;
      skyU.top.value.setHSL((hue + .45) % 1, .5, .1);
      skyU.mid.value.setHSL(hue, .3, .45);
      skyU.bot.value.setHSL((hue + .06) % 1, .55, .68);
      const f = new THREE.Color().setHSL(hue, .16, .74);
      fog.copy(f);
      scene.fog.color.copy(f);
      scene.background.copy(f);
      waterU.fog.value.copy(f);
      cA.setHSL((hue + .05) % 1, .5, .22);
      cB.setHSL((hue + .02) % 1, .4, .48);

      markers.forEach((mk) => { if (mk) { mk.ring.visible = false; mk.col.visible = false; } });
      (o.cluePoints || []).forEach((p, i) => {
        if (markers[i]) { markers[i].ring.position.set(p.x, heightAt(p.x, p.z) + .07, p.z); markers[i].col.position.set(p.x, heightAt(p.x, p.z) + 1.7, p.z); }
        else makeMarker(p.x, p.z, i);
        markers[i].ring.visible = true; markers[i].col.visible = true; markers[i].taken = false;
      });
      portal.visible = !!o.portal;
      if (portal.visible) portal.position.set(0, heightAt(0, -30), -30);
    },
    place(x, z) {
      hero.position.set(x, heightAt(x, z), z);
      camera.position.set(x, heightAt(x, z) + 3, z + 12);
    },
    markTaken(i) {
      const mk = markers[i];
      if (!mk) return;
      mk.taken = true;
      mk.ring.visible = false;
      mk.col.visible = false;
    },
    setVisible(v) { visible = v; },
    setHooks(h) { onNear = h.onNear || onNear; onFar = h.onFar || onFar; },
    setBiomeColors() {}
  };
}
