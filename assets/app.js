// app.js — interface, rotas e API. O mundo 3D é só o palco.
import { GRID_W, GRID_H, BIOME_HEX, BIOME_LABEL, mixHex, biomeAt, isBorderCell } from './engine.js';
import { getFingerprint } from './fingerprint.js';
import { openSealed } from './sealed.js';
import { initWorld } from './world.js';

const PIX_KEY = 'ab3a2cd5-6283-4fab-9676-905ccd7d8d0c';
const TOTAL = GRID_W * GRID_H;
const STATIC_PREVIEW = /\.github\.io$/.test(location.hostname);

const $ = (s, r) => (r || document).querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };

const panel = $('#panel');
const toastEl = $('#toast');
const veil = $('#veil');
const promptEl = $('#prompt');
const compass = $('#compass');
const needle = $('#needle');
const hud = $('#hud');
const occEl = $('#occ');
const totEl = $('#tot');

let state = null;
let mine = null;
let current = null;
let collected = new Set();
let toastTimer = 0;

/* ------------------------------- identidade ------------------------------- */
function ownerId() {
  try {
    let v = localStorage.getItem('uniworld:owner');
    if (v && v.length >= 8) return v;
    v = crypto.randomUUID ? crypto.randomUUID() : 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2);
    localStorage.setItem('uniworld:owner', v);
    return v;
  } catch { return 'u' + Date.now().toString(36); }
}

/* ---------------------------------- rede ---------------------------------- */
async function api(path, body) {
  if (STATIC_PREVIEW) throw new Error('prévia estática: a API só roda no servidor Node.');
  const res = await fetch(path, body
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    : { method: 'GET' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'falha na rede.');
  return data;
}

function toast(msg, bad) {
  toastEl.textContent = msg;
  toastEl.classList.toggle('bad', !!bad);
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), 4200);
}

/* --------------------------------- mundo ---------------------------------- */
let world = null;
function bootWorld() {
  if (world) return;
  world = initWorld($('#c'), {
    onNear: (i) => {
      promptEl.textContent = 'pressione E para colher a pista';
      promptEl.classList.add('on');
      pendingClue = i;
    },
    onFar: (i) => {
      if (pendingClue === i) { promptEl.classList.remove('on'); pendingClue = -1; }
    },
    onPortal: () => { if (current && !current.portalDone) { current.portalDone = true; location.hash = '#/'; } }
  });
}
let pendingClue = -1;

addEventListener('keydown', (e) => {
  if (e.code === 'KeyE' && pendingClue >= 0 && current) collectClue(pendingClue);
});

/* --------------------------------- rotas ---------------------------------- */
const ROUTES = [
  [/^#\/?$/, viewMap],
  [/^#\/entregar$/, viewClaim],
  [/^#\/editar$/, viewEdit],
  [/^#\/mundo\/(\d+)\/(\d+)$/, viewWorld],
  [/^#\/parte\/([A-Z0-9]+)$/, viewCode],
  [/^#\/estado$/, viewState],
  [/^#\/sobre$/, viewAbout],
  [/^#\/regras$/, viewRules]
];

function router() {
  const h = location.hash || '#/';
  panel.className = '';
  panel.innerHTML = '';
  panel.classList.remove('on');
  hud.classList.remove('on');
  promptEl.classList.remove('on');
  pendingClue = -1;
  document.querySelectorAll('#barLinks a').forEach((a) => a.classList.remove('on'));

  for (const [re, fn] of ROUTES) {
    const m = h.match(re);
    if (!m) continue;
    if (fn === viewMap) {
      panel.classList.remove('on');
      hud.classList.add('on');
      if (world) world.setVisible(true);
      refreshState();
      return;
    }
    panel.classList.add('on');
    if (world) world.setVisible(false);
    fn(m);
    return;
  }
  location.hash = '#/';
}

/* ---------------------------------- mapa ---------------------------------- */
async function refreshState() {
  try {
    state = await api('/api/state');
  } catch (e) {
    occEl.textContent = '—';
    return;
  }
  occEl.textContent = state.occupied;
  totEl.textContent = state.total;
  if (state.complete && !revealed) showReveal();
}

let revealed = false;

function viewMap() {}

/* painel do mapa (aberto pelo botão "mapa" da barra) */
function openMap() {
  panel.className = 'on wide';
  panel.innerHTML = '';
  const s = el('div', 'sheet');
  s.appendChild(el('h2', null, 'o mundo inteiro'));
  s.appendChild(el('p', 'lead', 'Cada quadrado é uma pessoa. Toque num quadrado livre para caminhar nele; toque num ocupado para visitar.'));
  const grid = el('div', '');
  grid.id = 'grid';
  panel.appendChild(s);
  panel.appendChild(grid);

  const frag = document.createDocumentFragment();
  const taken = new Map((state ? state.parts : []).map((p) => [p.cx + ',' + p.cy, p]));
  const mineSet = new Set((state && state.parts ? state.parts : []).filter((p) => p.owner_id === ownerId()).map((p) => p.cx + ',' + p.cy));

  for (let cy = 0; cy < GRID_H; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      const b = el('button');
      const bi = biomeAt(cx, cy);
      b.style.setProperty('--cell', BIOME_HEX[bi] || '#1b2a24');
      b.dataset.cx = cx; b.dataset.cy = cy;
      if (taken.has(cx + ',' + cy)) b.dataset.taken = '1';
      if (mineSet.has(cx + ',' + cy)) b.dataset.mine = '1';
      if ((cx === 19 || cx === 20) && (cy === 24 || cy === 25)) b.dataset.center = '1';
      b.title = BIOME_LABEL[bi] + ' · ' + cx + ',' + cy;
      frag.appendChild(b);
    }
  }
  grid.appendChild(frag);

  const legend = el('div', 'legend');
  BIOME_LABEL.forEach((l, i) => {
    const item = el('span', null, '<i style="background:' + BIOME_HEX[i] + '"></i>' + l);
    legend.appendChild(item);
  });
  panel.appendChild(legend);
}

/* -------------------------------- entrega --------------------------------- */
function viewClaim() {
  if (STATIC_PREVIEW) return staticNotice();
  const s = el('div', 'sheet');
  s.innerHTML = `
    <h2>entregar uma parte</h2>
    <p class="lead">O sistema sorteia uma posição livre e verifica se a emenda combina com os vizinhos. Você recebe um código de três opções: guarde o certo.</p>
    <form id="claimForm">
      <label class="field"><span>boas-vindas</span>
        <textarea name="welcome" maxlength="200" placeholder="o que quem chegar aqui deve ler"></textarea></label>
      <label class="field"><span>três pistas</span>
        <input name="c0" maxlength="120" placeholder="pista 1">
        <input name="c1" maxlength="120" placeholder="pista 2" style="margin-top:.4rem">
        <input name="c2" maxlength="120" placeholder="pista 3" style="margin-top:.4rem">
        <span class="hintline">deixe em branco para usar as pistas geradas.</span></label>
      <label class="field"><span>instagram</span>
        <input name="instagram" maxlength="30" placeholder="sem @"></label>
      <button class="btn wide" type="submit">entregar</button>
    </form>`;
  panel.appendChild(s);
  $('#claimForm').addEventListener('submit', claim);
}

async function claim(e) {
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector('button');
  btn.disabled = true;
  try {
    const clues = [f.c0.value, f.c1.value, f.c2.value].filter((v) => v.trim());
    const data = await api('/api/part', {
      ownerId: ownerId(),
      fingerprint: getFingerprint(),
      welcome: f.welcome.value,
      instagram: f.instagram.value,
      clues
    });
    showCode(data);
    refreshState();
  } catch (err) {
    toast(err.message, true);
    btn.disabled = false;
  }
}

function showCode(data) {
  panel.innerHTML = '';
  const s = el('div', 'sheet');
  s.innerHTML = `
    <h2>sua parte existe</h2>
    <p class="lead">Posição <b class="mono">${data.part.cx},${data.part.cy}</b> · ${BIOME_LABEL[data.part.biome] || ''}${data.border ? ' · borda' : ''}</p>
    <p class="lead">Escolha o código verdadeiro. Depois de escolher, ele não aparece mais.</p>
    <div class="codes" id="codes"></div>
    <div class="actions"><a class="btn ghost" href="#/mundo/${data.part.cx}/${data.part.cy}">caminhar até lá</a></div>`;
  panel.appendChild(s);

  const box = $('#codes');
  data.options.forEach((code, i) => {
    const b = el('button', null, code);
    b.addEventListener('click', () => {
      box.querySelectorAll('button').forEach((x) => (x.disabled = true));
      const real = i === data.realIdx;
      b.style.borderColor = real ? 'var(--teal)' : '#ff9f86';
      toast(real ? 'código correto. guarde-o.' : 'não era esse. o certo é ' + data.options[data.realIdx], !real);
      s.querySelector('.actions').insertAdjacentHTML('afterbegin',
        `<a class="btn" href="#/parte/${data.options[data.realIdx]}">ver a parte</a>`);
    });
    box.appendChild(b);
  });
}

/* --------------------------------- visita --------------------------------- */
async function viewWorld(m) {
  const cx = +m[1], cy = +m[2];
  panel.innerHTML = '';
  const s = el('div', 'sheet');
  s.appendChild(el('h2', null, 'carregando a peça…'));
  panel.appendChild(s);
  let data;
  try { data = await api(`/api/part/${cx}/${cy}`); }
  catch (err) { s.innerHTML = '<h2>peça vazia</h2><p class="lead">' + err.message + '</p>'; return; }

  current = { cx, cy, data, portalDone: false };
  panel.innerHTML = '';
  const b = el('div', 'sheet');
  const p = data.part;
  b.innerHTML = `
    <p class="small">${BIOME_LABEL[p.biome] || ''} · ${cx},${cy}${p.border ? ' · borda' : ''}${p.center ? ' · centro' : ''}</p>
    <h2>${escapeHtml(p.name)}</h2>
    <p class="lead">${escapeHtml(p.welcome)}</p>
    <div class="rule"></div>
    <h3>pistas</h3>
    <div id="clues"></div>
    <div class="rule"></div>
    <h3>placas</h3>
    <div id="signs"></div>
    <div class="actions">
      ${p.instagram ? `<a class="btn ghost" href="https://instagram.com/${encodeURIComponent(p.instagram)}" target="_blank" rel="noopener">@${escapeHtml(p.instagram)}</a>` : ''}
      <a class="btn ghost" href="#/">mapa</a>
    </div>`;
  panel.appendChild(b);

  const cluesBox = $('#clues');
  p.clues.forEach((c, i) => {
    const row = el('div', 'kv');
    row.innerHTML = `<span>pista ${i + 1}</span><b>${c ? escapeHtml(c) : '—'}</b>`;
    cluesBox.appendChild(row);
  });

  const signsBox = $('#signs');
  if (!data.signs.length) signsBox.innerHTML = '<p class="small">nenhuma placa.</p>';
  data.signs.forEach((sg) => signsBox.appendChild(el('p', 'small', '“' + escapeHtml(sg.text) + '”')));

  if (world) {
    world.setVisible(true);
    world.setRealm({
      seed: p.seed,
      biome: p.biome,
      cluePoints: data.local.cluePoints,
      portal: true
    });
    world.place(0, 8);
  }

  // auto-coleta quando a peça é do próprio visitante
  window.__clueCtx = { cx, cy };
}

async function collectClue(i) {
  if (!window.__clueCtx) return;
  try {
    const r = await api('/api/clue', { ...window.__clueCtx, idx: i, x: 0, z: 0, ownerId: ownerId() });
    world.markTaken(i);
    toast('pista colhida: ' + r.clue);
    pendingClue = -1;
    promptEl.classList.remove('on');
  } catch (err) { toast(err.message, true); }
}

/* --------------------------------- código --------------------------------- */
function viewCode(m) {
  const s = el('div', 'sheet center');
  s.innerHTML = `
    <svg class="sigil" viewBox="0 0 64 64"><circle cx="32" cy="32" r="20"/><ellipse cx="32" cy="32" rx="9" ry="20"/><rect x="27" y="27" width="10" height="10"/></svg>
    <h2>guarde este código</h2>
    <p class="lead">Ele abre a sua peça e as pistas. Não aparece de novo.</p>
    <p class="mono" style="margin-top:1.2rem;font-size:1.4rem">${escapeHtml(m[1])}</p>
    <div class="actions" style="justify-content:center">
      <a class="btn" href="#/">voltar ao mapa</a>
      <a class="btn ghost" href="#/editar">editar meu mundo</a>
    </div>`;
  panel.appendChild(s);
}

/* ---------------------------------- editar -------------------------------- */
async function viewEdit() {
  if (STATIC_PREVIEW) return staticNotice();
  panel.innerHTML = '';
  let data;
  try { data = await api('/api/mine'); }
  catch (err) { panel.innerHTML = '<div class="sheet"><h2>sem mundo aqui</h2><p class="lead">' + err.message + '</p></div>'; return; }
  if (!data) {
    panel.innerHTML = '<div class="sheet"><h2>sem mundo neste aparelho</h2><p class="lead">Este navegador não tem uma peça registrada. Se você limpou o perfil, procure o operador.</p><div class="actions"><a class="btn" href="#/entregar">entregar uma parte</a></div></div>';
    return;
  }
  mine = data;
  const s = el('div', 'sheet');
  s.innerHTML = `
    <h2>meu mundo</h2>
    <p class="lead">${data.part.cx},${data.part.cy} · ${BIOME_LABEL[data.part.biome] || ''}</p>
    <form id="editForm">
      <label class="field"><span>nome${data.canRename ? '' : ' (trocado uma vez)'}</span>
        <input name="name" maxlength="40" value="${escapeAttr(data.part.name)}" ${data.canRename ? '' : 'disabled'}></label>
      <label class="field"><span>boas-vindas</span>
        <textarea name="welcome" maxlength="200">${escapeHtml(data.part.welcome)}</textarea></label>
      <label class="field"><span>instagram</span>
        <input name="instagram" maxlength="30" value="${escapeAttr(data.part.instagram)}"></label>
      <label class="field"><span>clima</span>
        <select name="climate">
          ${['claro', 'chuva', 'neve', 'névoa', 'vento'].map((c) => `<option ${data.part.climate === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select></label>
      <button class="btn wide" type="submit">salvar</button>
    </form>
    <div class="rule"></div>
    <h3>placas</h3>
    <div id="mySigns"></div>
    <form id="signForm" class="actions">
      <input class="field" name="text" maxlength="90" placeholder="nova placa" style="flex:1;min-width:12rem;padding:.7rem .8rem;border:1px solid var(--hair);background:rgba(255,255,255,.03);color:var(--ink)">
      <button class="btn ghost" type="submit">fixar</button>
    </form>`;
  panel.appendChild(s);

  const box = $('#mySigns');
  if (!data.signs.length) box.innerHTML = '<p class="small">nenhuma placa.</p>';
  data.signs.forEach((sg) => {
    const row = el('div', 'kv');
    row.innerHTML = `<span>${escapeHtml(sg.text)}</span>`;
    const del = el('button', 'btn ghost', 'remover');
    del.style.padding = '.3rem .7rem';
    del.addEventListener('click', async () => {
      try { await api('/api/sign/delete', { id: sg.id }); router(); } catch (e) { toast(e.message, true); }
    });
    row.appendChild(del);
    box.appendChild(row);
  });

  $('#editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/api/mine', {
        name: f.name.value,
        welcome: f.welcome.value,
        instagram: f.instagram.value,
        climate: f.climate.value
      });
      toast('salvo.');
      router();
    } catch (err) { toast(err.message, true); }
  });

  $('#signForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = e.target.text;
    try {
      await api('/api/sign', { text: input.value });
      toast('placa fixada.');
      router();
    } catch (err) { toast(err.message, true); }
  });
}

/* ---------------------------------- estado -------------------------------- */
async function viewState() {
  if (STATIC_PREVIEW) return staticNotice();
  const s = el('div', 'sheet');
  panel.appendChild(s);
  try { state = await api('/api/state'); } catch (e) { s.innerHTML = '<h2>sem estado</h2><p class="lead">' + e.message + '</p>'; return; }
  s.innerHTML = `
    <h2>estado do mundo</h2>
    <div class="card">
      <div class="kv"><span>partes no lugar</span><b>${state.occupied} / ${state.total}</b></div>
      <div class="kv"><span>vazias</span><b>${state.empties}</b></div>
      <div class="kv"><span>tentativas</span><b>${state.tentativas}</b></div>
      <div class="kv"><span>recusadas por emenda</span><b>${state.rejeitadas}</b></div>
      <div class="kv"><span>bordas abertas</span><b>${state.bordersOpen ? 'sim' : 'não'}</b></div>
    </div>
    <div class="rule"></div>
    <h3>código supremo</h3>
    <p class="small">Só vale com o mundo completo e as quatro pistas das bordas colhidas por você.</p>
    <form id="celForm" class="actions">
      <input name="code" maxlength="16" class="mono" placeholder="16 CARACTERES"
        style="flex:1;min-width:12rem;padding:.7rem .8rem;border:1px solid var(--hair);background:rgba(255,255,255,.03);color:var(--warm)">
      <button class="btn" type="submit" ${state.complete ? '' : 'disabled'}>abrir</button>
    </form>
    <div id="celOut"></div>`;
  $('#celForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/celestial', { code: e.target.code.value });
      $('#celOut').innerHTML = '<div class="card"><h3>doadores</h3><p class="small">' + r.donors.map(escapeHtml).join(' · ') + '</p></div>';
      toast('código aceito.');
    } catch (err) { toast(err.message, true); }
  });
}

async function showReveal() {
  revealed = true;
  if (!state || !state.reveal) return;
  try {
    const msg = await openSealed(state.reveal.key);
    const s = el('div', 'sheet center');
    s.innerHTML = '<h3>a mensagem</h3><h2>' + escapeHtml(msg.title || '') + '</h2><div class="rule"></div>' +
      String(msg.body || msg.text || '').split('\n').map((p) => '<p class="lead">' + escapeHtml(p) + '</p>').join('');
    panel.className = 'on';
    panel.innerHTML = '';
    panel.appendChild(s);
  } catch (e) { /* selo ainda fechado */ }
}

/* -------------------------------- estáticas ------------------------------- */
function staticNotice() {
  panel.className = 'on';
  panel.innerHTML = '<div class="sheet"><h2>prévia estática</h2><p class="lead">Esta cópia está no GitHub Pages, que não executa a API. O mundo, o mapa e as peças aparecem; entregar, editar e colher pistas só funcionam no servidor Node.</p></div>';
}

function viewAbout() {
  const s = el('div', 'sheet');
  s.innerHTML = `
    <h2>um mundo em duas mil partes</h2>
    <p class="lead">Duas mil pessoas diferentes doam uma peça cada, sem combinar nada. O sistema decide onde cada parte cabe, verificando se o bioma emenda com os vizinhos.</p>
    <div class="rule"></div>
    <p>Cada peça é reproduzível: a mesma semente e a mesma coordenada devolvem sempre a mesma ilha. O terreno é função das coordenadas globais, nunca do sorteio, então a emenda é automática.</p>
    <p>Quem entrega recebe um código de três opções e precisa guardar o certo. As pistas de uma peça só abrem para quem tem o código dela.</p>
    <div class="rule"></div>
    <h3>apoio</h3>
    <p class="small mono">pix · ${PIX_KEY}</p>`;
  panel.appendChild(s);
}

function viewRules() {
  const s = el('div', 'sheet');
  s.innerHTML = `
    <h2>regras</h2>
    <p class="lead">Poucas, e todas por um motivo.</p>
    <div class="rule"></div>
    <p>Uma parte a cada 90 segundos, doze em 24 horas por identificador.</p>
    <p>Um registro por perfil de navegador e por conexão de rede. Não é prova de identidade: limpar o perfil perde o acesso.</p>
    <p>O nome só pode ser trocado uma vez. Boas-vindas, instagram, clima e placas, quantas vezes quiser.</p>
    <p>Cinco placas por peça, 90 caracteres cada.</p>
    <div class="rule"></div>
    <p class="small">O código supremo exige o mundo completo e as quatro pistas das bordas.</p>`;
  panel.appendChild(s);
}

/* -------------------------------- utilidades ------------------------------ */
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const escapeAttr = escapeHtml;

/* ---------------------------------- início -------------------------------- */
function boot() {
  bootWorld();
  totEl.textContent = TOTAL;
  addEventListener('hashchange', router);
  router();
  refreshState();
  setInterval(() => { if (!state || !state.complete) refreshState(); }, 20000);

  // botão do mapa na barra: #/ abre o painel do mapa
  const brand = $('#brand');
  brand.addEventListener('click', (e) => {
    if (location.hash === '#/' || location.hash === '') {
      e.preventDefault();
      if (panel.classList.contains('on')) { panel.classList.remove('on'); hud.classList.add('on'); if (world) world.setVisible(true); }
      else { panel.classList.add('on'); openMap(); }
    }
  });

  // E abre e fecha o mapa
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') {
      if (panel.classList.contains('on')) { panel.classList.remove('on'); hud.classList.add('on'); if (world) world.setVisible(true); }
      else { panel.classList.add('on'); openMap(); }
    }
  });

  setTimeout(() => veil.classList.add('off'), 500);
  setTimeout(() => veil.remove(), 2400);
}

boot();
