// Backend do UniWorld: PostgreSQL em produção, JSON local para desenvolvimento.

import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import pg from "pg";
const { Pool } = pg;
import { createHash, randomBytes } from "node:crypto";
import { join, extname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GRID_W,
  GRID_H,
  TOTAL,
  ALPHABET,
  BIOMES,
  SEED_GLOBAL,
  SUPREME_SUFFIX,
  CELESTIAL_MESSAGE,
  generatePiece,
  biomeIndexAt,
  isBorderCell,
} from "./assets/engine.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const DATA_DIR = join(ROOT, "data");
const STORE = join(DATA_DIR, "parts.json");
const PORT = Number(process.env.PORT || 3000);
const BORDERS = [
  [19, 0],
  [39, 24],
  [19, GRID_H - 1],
  [0, 24],
];
const BORDER_RESERVE = 40;

// Segredo fornecido pelo ambiente de produção, nunca versionado.
// Gere um valor aleatório forte e configure REVEAL_PASSPHRASE no host.
const REVEAL_PASSPHRASE = process.env.REVEAL_PASSPHRASE || "";
if (REVEAL_PASSPHRASE.length < 32) {
  throw new Error("Configure REVEAL_PASSPHRASE (mínimo 32 caracteres) nas variáveis de ambiente.");
}

const CLIMATES = ["claro", "chuva", "neve", "névoa", "vento"];

const db = { parts: [], clues: [], devices: [], signs: [], rejected: 0 };

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: true },
      max: 5,
    })
  : null;

async function load() {
  if (pool) {
    await pool.query(`CREATE TABLE IF NOT EXISTS uniworld_state (
      id smallint PRIMARY KEY CHECK (id = 1),
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    const result = await pool.query("SELECT data FROM uniworld_state WHERE id = 1");
    let raw = result.rows[0]?.data;
    if (!raw) {
      // Importa automaticamente os dados antigos do JSON, caso existam.
      try { raw = JSON.parse(await readFile(STORE, "utf8")); } catch { raw = null; }
      if (raw) await pool.query("INSERT INTO uniworld_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING", [JSON.stringify(raw)]);
    }
    if (raw) {
      db.parts = Array.isArray(raw.parts) ? raw.parts : [];
      db.clues = Array.isArray(raw.clues) ? raw.clues : [];
      db.devices = Array.isArray(raw.devices) ? raw.devices : [];
      db.signs = Array.isArray(raw.signs) ? raw.signs : [];
      db.rejected = Number(raw.rejected) || 0;
    }
    return;
  }
  // Desenvolvimento local continua funcionando sem PostgreSQL.
  try {
    const raw = JSON.parse(await readFile(STORE, "utf8"));
    db.parts = Array.isArray(raw.parts) ? raw.parts : [];
    db.clues = Array.isArray(raw.clues) ? raw.clues : [];
    db.devices = Array.isArray(raw.devices) ? raw.devices : [];
    db.signs = Array.isArray(raw.signs) ? raw.signs : [];
    db.rejected = Number(raw.rejected) || 0;
  } catch { /* primeira execução local */ }
}

async function persist() {
  const snapshot = JSON.stringify({ parts: db.parts, clues: db.clues, devices: db.devices, signs: db.signs, rejected: db.rejected });
  if (pool) {
    await pool.query(`INSERT INTO uniworld_state (id, data, updated_at) VALUES (1, $1::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [snapshot]);
    return;
  }
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE, JSON.stringify(JSON.parse(snapshot), null, 2));
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const randomChars = (n) => Array.from(randomBytes(n), (b) => ALPHABET[b % ALPHABET.length]).join("");
const randomInt = (max) => randomBytes(4).readUInt32BE(0) % max;
const revealKey = () => createHash("sha256").update(REVEAL_PASSPHRASE).digest("base64");

const cleanHandle = (raw) =>
  String(raw || "")
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/\/+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, 30);

const publicPart = (p) => ({
  cx: p.cx,
  cy: p.cy,
  seed: p.seed,
  name: p.name,
  welcome: p.welcome,
  biome: p.biome,
  variant: p.variant,
  instagram: p.instagram || "",
  climate: p.climate || "claro",
  name_changes: p.name_changes || 0,
  created_date: p.created_date,
});

const signsOf = (cx, cy) =>
  db.signs
    .filter((s) => s.part_cx === cx && s.part_cy === cy)
    .sort((a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime())
    .map((s) => ({ id: s.id, text: s.text, x: s.x, z: s.z }));

function signSpot(index) {
  const a = index * ((Math.PI * 2) / 5) + 0.55;
  const r = 3.1 + (index % 2) * 1.15;
  return { x: Math.round(Math.cos(a) * r * 100) / 100, z: Math.round(Math.sin(a) * r * 100) / 100 };
}

function deviceFor(fingerprint) {
  return db.devices.find((d) => d.fingerprint === fingerprint) || null;
}

function myPart(fingerprint) {
  const device = deviceFor(fingerprint);
  if (!device) return null;
  return db.parts.find((p) => p.owner_id === device.owner_id) || null;
}

function send(res, status, body, type = "application/json") {
  const payload = type === "application/json" ? JSON.stringify(body) : body;
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 64_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function state() {
  const occupied = db.parts.length;
  const complete = occupied >= TOTAL;
  return {
    total: TOTAL,
    occupied,
    empties: TOTAL - occupied,
    tentativas: occupied + db.rejected,
    rejeitadas: db.rejected,
    bordersOpen: TOTAL - occupied <= BORDER_RESERVE,
    complete,
    reveal: complete ? { key: revealKey() } : null,
    parts: db.parts
      .map(publicPart)
      .sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime()),
  };
}

async function claimPart(body, ip) {
  const ownerId = String(body.ownerId || "");
  const fingerprint = String(body.fingerprint || "");
  if (ownerId.length < 8 || ownerId.length > 64) return [400, { error: "identificador inválido." }];
  if (fingerprint.length < 12 || fingerprint.length > 64) return [400, { error: "aparelho não identificado." }];

  if (deviceFor(fingerprint)) return [409, { error: "este aparelho já tem um mundo. abra o seu mundo para editar." }];

  const ipHash = ip ? sha256(`${ip}:${SEED_GLOBAL}`).slice(0, 40) : "";
  if (ipHash && db.devices.some((d) => d.ip_hash === ipHash))
    return [409, { error: "esta conexão já tem um mundo. abra o seu mundo para editar." }];

  const mine = db.parts.filter((p) => p.owner_id === ownerId);
  const now = Date.now();
  const last = mine.reduce((m, p) => Math.max(m, new Date(p.created_date).getTime() || 0), 0);
  if (last && now - last < 90_000) return [429, { error: "espere 90 segundos entre uma parte e outra." }];

  const taken = new Set(db.parts.map((p) => `${p.cx},${p.cy}`));
  const empties = [];
  for (let cy = 0; cy < GRID_H; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) if (!taken.has(`${cx},${cy}`)) empties.push([cx, cy]);
  }
  const open = empties.length > BORDER_RESERVE ? empties.filter(([cx, cy]) => !isBorderCell(cx, cy)) : empties;
  if (!open.length) return [409, { error: "o mundo está completo." }];

  const [cx, cy] = open[randomInt(open.length)];

  const bIdx = biomeIndexAt(cx, cy);
  const neighbours = [
    [cx - 1, cy],
    [cx + 1, cy],
    [cx, cy - 1],
    [cx, cy + 1],
  ];
  for (const [nx, ny] of neighbours) {
    const nb = db.parts.find((p) => p.cx === nx && p.cy === ny);
    if (nb && Math.abs(BIOMES.indexOf(nb.biome) - bIdx) > 1) {
      db.rejected += 1;
      await persist();
      return [409, { error: "emenda recusada: bioma incompatível com o vizinho." }];
    }
  }

  const seed = randomChars(8);
  const piece = generatePiece(seed, cx, cy);

  const real = randomChars(4);
  let d1 = randomChars(4);
  while (d1 === real) d1 = randomChars(4);
  let d2 = randomChars(4);
  while (d2 === real || d2 === d1) d2 = randomChars(4);

  const realIdx = randomInt(3);
  const options = [d1, d2];
  options.splice(realIdx, 0, real);

  const welcome = typeof body.welcome === "string" && body.welcome.trim() ? body.welcome.trim().slice(0, 200) : piece.welcome;
  const clues = [0, 1, 2].map((i) => {
    const given = Array.isArray(body.clues) ? body.clues[i] : null;
    return typeof given === "string" && given.trim() ? given.trim().slice(0, 120) : piece.clueTexts[i];
  });

  const record = {
    cx,
    cy,
    seed,
    name: piece.name,
    welcome,
    biome: piece.biome,
    variant: piece.variant,
    clue_a: clues[0],
    clue_b: clues[1],
    clue_c: clues[2],
    code_hash: sha256(`${real}:${seed}:${SEED_GLOBAL}`),
    real_idx: realIdx,
    owner_id: ownerId,
    instagram: cleanHandle(body.instagram),
    climate: "claro",
    name_changes: 0,
    created_date: new Date().toISOString(),
  };

  db.parts.push(record);
  db.devices.push({ fingerprint, ip_hash: ipHash, owner_id: ownerId, created_date: new Date().toISOString() });
  await persist();

  return [200, { part: publicPart(record), code: real, options, realIdx, border: isBorderCell(cx, cy) }];
}

async function editWorld(body) {
  const part = myPart(String(body.fingerprint || ""));
  if (!part) return [404, { error: "nenhum mundo neste aparelho." }];

  if (typeof body.name === "string") {
    const name = body.name.trim().replace(/\s+/g, " ");
    if (name !== part.name) {
      if ((part.name_changes || 0) >= 1) return [409, { error: "o nome só pode ser trocado uma vez." }];
      if (name.length < 2) return [400, { error: "o nome precisa de ao menos duas letras." }];
      part.name = name.slice(0, 40);
      part.name_changes = 1;
    }
  }
  if (typeof body.welcome === "string" && body.welcome.trim()) part.welcome = body.welcome.trim().slice(0, 200);
  if (typeof body.instagram === "string") part.instagram = cleanHandle(body.instagram);
  if (CLIMATES.includes(body.climate)) part.climate = body.climate;

  await persist();
  return [200, { part: publicPart(part) }];
}

async function addSign(body) {
  const part = myPart(String(body.fingerprint || ""));
  if (!part) return [404, { error: "nenhum mundo neste aparelho." }];
  const text = String(body.text || "").trim().slice(0, 90);
  if (!text) return [400, { error: "a placa está vazia." }];
  const existing = signsOf(part.cx, part.cy);
  if (existing.length >= 5) return [409, { error: "cinco placas é o limite de uma peça." }];
  const spot = signSpot(existing.length);
  const sign = {
    id: randomBytes(8).toString("hex"),
    part_cx: part.cx,
    part_cy: part.cy,
    text,
    x: spot.x,
    z: spot.z,
    owner_id: part.owner_id,
    created_date: new Date().toISOString(),
  };
  db.signs.push(sign);
  await persist();
  return [200, { sign: { id: sign.id, text: sign.text, x: sign.x, z: sign.z } }];
}

async function removeSign(body) {
  const part = myPart(String(body.fingerprint || ""));
  if (!part) return [404, { error: "nenhum mundo neste aparelho." }];
  const id = String(body.id || "");
  const index = db.signs.findIndex((s) => s.id === id && s.owner_id === part.owner_id);
  if (index < 0) return [404, { error: "esta placa não é sua." }];
  db.signs.splice(index, 1);
  await persist();
  return [200, { ok: true }];
}

async function collectClue(body) {
  const cx = Number(body.cx);
  const cy = Number(body.cy);
  const idx = Number(body.idx);
  const ownerId = String(body.ownerId || "");
  if (!Number.isInteger(cx) || !Number.isInteger(cy) || !Number.isInteger(idx) || idx < 0 || idx > 2)
    return [400, { error: "pedido inválido." }];
  if (ownerId.length < 8) return [400, { error: "identificador inválido." }];

  const part = db.parts.find((p) => p.cx === cx && p.cy === cy);
  if (!part) return [404, { error: "peça não existe." }];

  const piece = generatePiece(part.seed, cx, cy);
  const point = piece.cluePoints[idx];
  const dist = Math.hypot(Number(body.x) - point.x, Number(body.z) - point.z);
  if (!(dist <= 6)) return [409, { error: "longe demais da pista." }];

  if (!db.clues.some((c) => c.owner_id === ownerId && c.cx === cx && c.cy === cy && c.idx === idx)) {
    db.clues.push({ owner_id: ownerId, cx, cy, idx, created_date: new Date().toISOString() });
    await persist();
  }
  return [200, { ok: true }];
}

async function celestial(body) {
  const ownerId = String(body.ownerId || "");
  const code = String(body.code || "").trim().toUpperCase();
  if (db.parts.length < TOTAL) return [409, { error: `faltam ${TOTAL - db.parts.length} partes para o mundo fechar.` }];

  const hashes = [];
  for (const [cx, cy] of BORDERS) {
    const part = db.parts.find((p) => p.cx === cx && p.cy === cy);
    if (!part) return [409, { error: "uma das bordas está vazia." }];
    if (!db.clues.some((c) => c.owner_id === ownerId && c.cx === cx && c.cy === cy))
      return [403, { error: "faltam pistas das bordas." }];
    hashes.push(part.code_hash);
  }

  const supreme = sha256(hashes.join("") + SUPREME_SUFFIX).slice(0, 16).toUpperCase();
  if (code !== supreme) return [403, { error: "o código não confere." }];
  return [200, { ok: true, message: CELESTIAL_MESSAGE, donors: db.parts.map((p) => p.name) }];
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

async function serveStatic(res, pathname) {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  // Nunca sirva código do servidor, configuração, arquivos de dados ou o ZIP antigo.
  if (rel !== "index.html" && !rel.startsWith("assets/") && rel !== "PLANO.md") return send(res, 404, { error: "não encontrado." });
  const target = normalize(join(ROOT, rel));
  if (!target.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) return send(res, 403, { error: "fora do diretório." });
  try {
    const file = await readFile(target);
    res.writeHead(200, { "content-type": MIME[extname(target)] || "application/octet-stream" });
    res.end(file);
  } catch {
    const fallback = await readFile(join(ROOT, "index.html")).catch(() => null);
    if (fallback) {
      res.writeHead(200, { "content-type": MIME[".html"] });
      res.end(fallback);
    } else {
      send(res, 404, { error: "não encontrado." });
    }
  }
}

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const raw = String(req.headers["cf-connecting-ip"] || req.headers["x-real-ip"] || forwarded || req.socket.remoteAddress || "");
  return raw.replace(/^::ffff:/, "").slice(0, 64);
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;

  if (!path.startsWith("/api/")) {
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "método não permitido." });
    return serveStatic(res, path);
  }

  try {
    if (path === "/api/state" && req.method === "GET") return send(res, 200, state());
    if (path === "/api/map" && req.method === "GET") return send(res, 200, { parts: state().parts });

    if (path === "/api/part" && req.method === "POST") {
      const [status, payload] = await claimPart(await readBody(req), clientIp(req));
      return send(res, status, payload);
    }

    if (path === "/api/mine" && req.method === "GET") {
      const part = myPart(url.searchParams.get("fp") || "");
      if (!part) return send(res, 200, null);
      return send(res, 200, {
        part: { ...publicPart(part), border: isBorderCell(part.cx, part.cy) },
        signs: signsOf(part.cx, part.cy),
        canRename: (part.name_changes || 0) < 1,
      });
    }

    if (path === "/api/mine" && req.method === "POST") {
      const [status, payload] = await editWorld(await readBody(req));
      return send(res, status, payload);
    }

    if (path === "/api/sign" && req.method === "POST") {
      const [status, payload] = await addSign(await readBody(req));
      return send(res, status, payload);
    }

    if (path === "/api/sign/delete" && req.method === "POST") {
      const [status, payload] = await removeSign(await readBody(req));
      return send(res, status, payload);
    }

    const partMatch = path.match(/^\/api\/part\/(\d+)\/(\d+)$/);
    if (partMatch && req.method === "GET") {
      const cx = Number(partMatch[1]);
      const cy = Number(partMatch[2]);
      const part = db.parts.find((p) => p.cx === cx && p.cy === cy);
      if (!part) return send(res, 404, { error: "peça vazia." });
      const piece = generatePiece(part.seed, cx, cy);
      return send(res, 200, {
        part: {
          ...publicPart(part),
          clues: [part.clue_a, part.clue_b, part.clue_c],
          border: isBorderCell(cx, cy),
          center: (cx === 19 || cx === 20) && (cy === 24 || cy === 25),
        },
        signs: signsOf(cx, cy),
        local: {
          population: piece.population,
          nodes: piece.nodes,
          citizens: piece.citizens,
          cluePoints: piece.cluePoints,
          variant: piece.variant,
        },
      });
    }

    if (path === "/api/clues" && req.method === "GET") {
      const ownerId = url.searchParams.get("owner") || "";
      return send(res, 200, {
        clues: db.clues.filter((c) => c.owner_id === ownerId).map((c) => ({ cx: c.cx, cy: c.cy, idx: c.idx })),
      });
    }

    if (path === "/api/clue" && req.method === "POST") {
      const [status, payload] = await collectClue(await readBody(req));
      return send(res, status, payload);
    }

    if (path === "/api/celestial" && req.method === "POST") {
      const [status, payload] = await celestial(await readBody(req));
      return send(res, status, payload);
    }

    return send(res, 404, { error: "rota desconhecida." });
  } catch (err) {
    console.error("Erro na API:", err);
    // Recarrega o último estado salvo se uma gravação falhar.
    try { await load(); } catch (loadError) { console.error("Erro ao recarregar:", loadError); }
    return send(res, 500, { error: "erro interno do servidor." });
  }
}

// Serializa acessos ao estado em memória para evitar gravações concorrentes
// dentro de um único processo. Use exatamente uma instância do serviço.
let queue = Promise.resolve();
const server = createServer((req, res) => {
  queue = queue.then(() => handleRequest(req, res)).catch((err) => {
    console.error("Erro de requisição:", err);
    if (!res.headersSent) send(res, 500, { error: "erro interno do servidor." });
    else res.end();
  });
});

await load();
server.listen(PORT, () => {
  console.log(`uniworld em http://localhost:${PORT} · ${db.parts.length}/${TOTAL} partes · ${pool ? "PostgreSQL persistente" : "JSON local"}`);
});

process.on("SIGTERM", async () => {
  server.close(async () => { if (pool) await pool.end(); process.exit(0); });
});