// engine.js — geração determinística do uniworld.
// Sem dependências, sem estado, sem Math.random. Mesma seed = mesma peça, para sempre.
// Este arquivo também é distribuído no pacote exportado do projeto.

export const GRID_W = 40;
export const GRID_H = 50;
export const TOTAL = GRID_W * GRID_H;
export const SEED_GLOBAL = "uniworld-v1";
export const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const BIOMES = ["oceano", "costa", "campina", "mata", "serra"];

export const BIOME_HEX = {
  oceano: "#16324a",
  costa: "#2a5a63",
  campina: "#5c7040",
  mata: "#33512c",
  serra: "#5c5d63",
};

export const BIOME_LABEL = {
  oceano: "oceano",
  costa: "costa",
  campina: "campina",
  mata: "mata",
  serra: "serra",
};

// mistura linear de duas cores hex (t = 0 → a, t = 1 → b)
export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p, s) => (p >> s) & 255;
  const out = [16, 8, 0].map((s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t));
  return "#" + out.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/* ---------------- hash e rng ---------------- */

export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- ruído ---------------- */

function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const smooth = (t) => t * t * (3 - 2 * t);

export function noise2(x, y, s = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash2(xi, yi, s);
  const b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s);
  const d = hash2(xi + 1, yi + 1, s);
  return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf;
}

export function fbm(x, y, octaves = 4, s = 0) {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, y * freq, s + i * 131);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

// altitude global — função pura da coordenada, nunca do sorteio
export function elevation(cx, cy) {
  return fbm(cx * 0.085, cy * 0.085, 4, 11);
}

export function biomeIndexAt(cx, cy) {
  const e = elevation(cx, cy);
  if (e < 0.37) return 0;
  if (e < 0.44) return 1;
  if (e < 0.57) return 2;
  if (e < 0.7) return 3;
  return 4;
}

export function biomeAt(cx, cy) {
  return BIOMES[biomeIndexAt(cx, cy)];
}

export function isBorderCell(cx, cy) {
  return (cx === 19 && (cy === 0 || cy === GRID_H - 1)) || (cy === 24 && (cx === 0 || cx === GRID_W - 1));
}

export function isCenterCell(cx, cy) {
  return (cx === 19 || cx === 20) && (cy === 24 || cy === 25);
}

/* ---------------- nomes ---------------- */

const PRE = ["Aur", "Bel", "Cor", "Dor", "Eld", "Fen", "Gal", "Hal", "Ir", "Jor", "Kel", "Lor", "Mar", "Nor", "Or", "Pel", "Quel", "Rav", "Sel", "Tor", "Ul", "Val", "Wen", "Xan", "Yr", "Zel"];
const SIL = ["a", "e", "i", "o", "u", "an", "ar", "el", "in", "or", "un", "av", "ir", "ol", "en", "ur", "ai", "eu"];
const SUF = ["dor", "mir", "vale", "porto", "luz", "mar", "terra", "campo", "alto", "fim", "norte", "sul", "serra", "costa", "ilha", "ermo"];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

/* ---------------- boas-vindas ---------------- */

const WELCOME = {
  oceano: ["aqui o mar chega primeiro e não pede licença.", "quem fica, aprende a contar a maré.", "não há estrada, só horizonte."],
  costa: ["aqui a terra termina sem pressa.", "o sal seca no couro e no telhado.", "de manhã a água está lisa como vidro."],
  campina: ["aqui o vento atravessa tudo de lado a lado.", "o capim é mais alto que as cercas.", "a tarde é longa e ninguém tem hora."],
  mata: ["aqui a sombra é mais antiga que as casas.", "a trilha some quando chove.", "o barulho dos bichos é o relógio."],
  serra: ["aqui o ar é fino e o eco demora.", "a pedra guarda o calor do dia.", "de cima se vê o mundo alheio."],
};

const CLUES = {
  oceano: ["a primeira pista está onde o sal endurece a madeira.", "quem conta as ondas de trás para frente chega perto.", "o nome do barco afundado não está escrito em lugar nenhum."],
  costa: ["o que se procura está enterrado a três passos da maré alta.", "as pedras do cais guardam um número riscado.", "a pista fica onde o rio desiste do mar."],
  campina: ["a pista está no único lugar em que o vento não dobra o capim.", "duas árvores sozinhas marcam a metade do caminho.", "o sino toca uma vez por ano; escute o intervalo."],
  mata: ["a pista está pendurada onde a luz não chega.", "siga a água, nunca a trilha.", "a casca mais velha tem um desenho de mão."],
  serra: ["a pista está na pedra que olha para o leste.", "o eco responde quatro vezes, não três.", "no ponto mais alto, o chão é mais frio que o ar."],
};

/* ---------------- nós sociais ---------------- */

export const NODE_POOL = [
  { kind: "trilha", behavior: "caminhar", prop: "none", cap: 1, radius: 6, needsFlat: 0, biomes: [2, 3, 4] },
  { kind: "praca", behavior: "conversar", prop: "none", cap: 3, radius: 3.5, needsFlat: 0.25, biomes: [1, 2, 3] },
  { kind: "banco", behavior: "ler", prop: "banco", cap: 1, radius: 2, needsFlat: 0.35, biomes: [2, 3] },
  { kind: "banco", behavior: "ouvir musica", prop: "radio", cap: 1, radius: 2, needsFlat: 0.35, biomes: [2, 3] },
  { kind: "banco", behavior: "mexer no celular", prop: "banco", cap: 1, radius: 2, needsFlat: 0.35, biomes: [2, 3] },
  { kind: "campo", behavior: "jogar bola", prop: "campo", cap: 3, radius: 7, needsFlat: 0.85, biomes: [2] },
  { kind: "campo", behavior: "soltar pipa", prop: "campo", cap: 2, radius: 7, needsFlat: 0.8, biomes: [1, 2] },
  { kind: "varanda", behavior: "dormir na cadeira", prop: "cadeira", cap: 1, radius: 2, needsFlat: 0.3, biomes: [1, 2, 3] },
  { kind: "muro", behavior: "lutar", prop: "muro", cap: 2, radius: 3, needsFlat: 0.5, biomes: [2, 3, 4] },
  { kind: "palco", behavior: "dancar", prop: "palco", cap: 5, radius: 4, needsFlat: 0.85, biomes: [2, 3] },
  { kind: "quadra", behavior: "jogar volei", prop: "rede", cap: 4, radius: 6, needsFlat: 0.9, biomes: [1, 2] },
  { kind: "roda", behavior: "capoeira", prop: "tatame", cap: 2, radius: 4, needsFlat: 0.7, biomes: [2, 3] },
  { kind: "agua", behavior: "pescar", prop: "vara", cap: 1, radius: 3, needsFlat: 0, biomes: [0, 1] },
];

const POPULATION = { oceano: [2, 5], costa: [6, 12], campina: [10, 20], mata: [8, 16], serra: [4, 10] };

/* ---------------- peça ---------------- */

// Consome o rng nesta ordem fixa: variant, nome, boas-vindas, população,
// nós, cidadãos, pistas, pontos de pista, real_idx. Mudar a ordem quebra todo mundo.
export function generatePiece(seed, cx, cy) {
  const rnd = mulberry32(xmur3(seed)());
  const bIdx = biomeIndexAt(cx, cy);
  const biome = BIOMES[bIdx];

  const variant = Math.floor(rnd() * 10);

  const name = `${cap(pick(rnd, PRE) + pick(rnd, SIL) + pick(rnd, SIL))} ${cap(pick(rnd, SUF))}`;

  const welcome = `${WELCOME[biome][0]} ${WELCOME[biome][1]}`;

  const [lo, hi] = POPULATION[biome];
  const population = lo + Math.floor(rnd() * (hi - lo + 1));

  const pool = NODE_POOL.filter((n) => n.biomes.includes(bIdx));
  const nodeCount = Math.min(pool.length, 6 + Math.floor(rnd() * 9));
  const nodes = [];
  for (let i = 0; i < nodeCount; i++) {
    const def = pool[Math.floor(rnd() * pool.length)];
    const a = rnd() * Math.PI * 2;
    const r = 2.4 + rnd() * 6.6;
    nodes.push({
      kind: def.kind,
      behavior: def.behavior,
      prop: def.prop,
      cap: def.cap,
      radius: def.radius,
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      rot: rnd() * Math.PI * 2,
    });
  }

  const citizens = [];
  for (let i = 0; i < population; i++) {
    const node = Math.floor(rnd() * nodes.length);
    citizens.push({
      node,
      silhouette: Math.floor(rnd() * 4),
      phase: rnd(),
      speed: 0.75 + rnd() * 0.75,
    });
  }

  const clueTexts = CLUES[biome].slice();
  for (let i = 0; i < 3; i++) {
    const j = Math.floor(rnd() * 3);
    const t = clueTexts[i];
    clueTexts[i] = clueTexts[j];
    clueTexts[j] = t;
  }

  const cluePoints = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rnd() * 0.7;
    const r = 4.5 + rnd() * 4.5;
    cluePoints.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }

  const realIdx = Math.floor(rnd() * 3);

  return { seed, cx, cy, biome, biomeIndex: bIdx, variant, name, welcome, population, nodes, citizens, clueTexts, cluePoints, realIdx };
}

// altura local da ilha — mesma função no app e no pacote exportado
export function terrainHeight(seed, cx, cy, x, z) {
  const e = elevation(cx, cy);
  const h0 = (e - 0.42) * 5.2;
  const n1 = (fbm(x * 0.085 + 13.7, z * 0.085 + 4.2, 3, 21) - 0.5) * 2.4;
  const n2 = (fbm(x * 0.34, z * 0.34, 2, 37) - 0.5) * 0.55;
  const d = Math.sqrt(x * x + z * z) / 11.5;
  const fall = 1 - Math.min(1, Math.max(0, (d - 0.62) / 0.42));
  return (h0 + 1.6 + n1 + n2) * fall * fall - 0.55;
}

export const CELESTIAL_MESSAGE =
  "A mensagem não fala de um lugar. Fala de um intervalo: o tempo entre alguém entregar a sua parte e alguém, que nunca vai conhecê-lo, caminhar sobre ela. O mundo não foi feito para ser visto inteiro. Foi feito para provar que duas mil pessoas desconhecidas conseguem, sem combinar nada, construir uma coisa que nenhuma delas entenderia sozinha. Enquanto houver uma parte vazia, isto aqui é uma promessa. Quando a última for entregue, é só um fato.";

export const SUPREME_SUFFIX = "world";