// app.js — interface do uniworld. Sem framework, sem build: módulos nativos do navegador.
import { createRealm } from "./realm.js";
import { createAmbience } from "./ambience.js";
import { getFingerprint } from "./fingerprint.js";
import { openSealed } from "./sealed.js";
import { GRID_W, GRID_H, BIOME_HEX, BIOME_LABEL, mixHex, biomeAt, isBorderCell } from "./engine.js";

const app = document.getElementById("app");
// GitHub Pages hospeda arquivos estáticos, sem executar a API Node.
const STATIC_PREVIEW = location.hostname.endsWith(".github.io");
const PIX_KEY = "ab3a2cd5-6283-4fab-9676-905ccd7d8d0c";
let realm = null;
let ambience = null;
let fullscreenCleanup = null;
let routeEpoch = 0;

function setupWorldFullscreen(stage) {
  const button = stage.querySelector("#fullscreen");
  let active = false;
  let fallbackActive = false;
  let disposed = false;
  let savedOverflow = null;

  function lockPageScroll() {
    if (savedOverflow) return;
    const html = document.documentElement;
    const body = document.body;
    savedOverflow = {
      html: [html.style.getPropertyValue("overflow"), html.style.getPropertyPriority("overflow")],
      body: [body.style.getPropertyValue("overflow"), body.style.getPropertyPriority("overflow")],
    };
    html.style.setProperty("overflow", "hidden");
    body.style.setProperty("overflow", "hidden");
  }

  function restorePageScroll() {
    if (!savedOverflow) return;
    const restore = (element, [value, priority]) => {
      if (value) element.style.setProperty("overflow", value, priority);
      else element.style.removeProperty("overflow");
    };
    restore(document.documentElement, savedOverflow.html);
    restore(document.body, savedOverflow.body);
    savedOverflow = null;
  }

  function paintState() {
    stage.classList.toggle("is-world-fullscreen", active);
    stage.classList.toggle("is-world-fullscreen-fallback", fallbackActive);
    button.textContent = active ? "sair da tela cheia" : "tela cheia";
    button.setAttribute("aria-label", active ? "Sair da tela cheia" : "Abrir mundo em tela cheia");
    button.setAttribute("aria-pressed", String(active));
  }

  function syncNativeState() {
    if (disposed) return;
    const nativeActive = document.fullscreenElement === stage;
    if (nativeActive) {
      active = true;
      fallbackActive = false;
      lockPageScroll();
    } else if (active && !fallbackActive) {
      active = false;
      restorePageScroll();
    }
    paintState();
  }

  function enterFallback() {
    if (disposed || !stage.isConnected) return;
    active = true;
    fallbackActive = true;
    lockPageScroll();
    paintState();
  }

  function exitNativeFullscreen() {
    if (document.fullscreenElement !== stage || !document.exitFullscreen) return;
    try {
      const exit = document.exitFullscreen();
      if (exit && typeof exit.catch === "function") exit.catch(() => {});
    } catch (_) {}
  }

  function leaveFullscreen() {
    if (!active && document.fullscreenElement !== stage) return;
    active = false;
    fallbackActive = false;
    stage.classList.remove("is-world-fullscreen", "is-world-fullscreen-fallback");
    restorePageScroll();
    paintState();
    exitNativeFullscreen();
  }

  function onButtonClick() {
    if (active) {
      leaveFullscreen();
      return;
    }
    // requestFullscreen must run synchronously from this click to retain the
    // browser's user-gesture permission. Older mobile browsers use the overlay.
    if (typeof stage.requestFullscreen !== "function") {
      enterFallback();
      return;
    }
    try {
      const request = stage.requestFullscreen();
      Promise.resolve(request).then(() => {
        if (disposed) {
          exitNativeFullscreen();
          return;
        }
        syncNativeState();
      }).catch(() => {
        if (!disposed && document.fullscreenElement !== stage) enterFallback();
      });
    } catch (_) {
      enterFallback();
    }
  }

  function onKeyDown(event) {
    if (event.key === "Escape" && fallbackActive) {
      event.preventDefault();
      leaveFullscreen();
    }
  }

  button.addEventListener("click", onButtonClick);
  document.addEventListener("fullscreenchange", syncNativeState);
  window.addEventListener("keydown", onKeyDown);

  return function cleanupFullscreen() {
    if (disposed) return;
    disposed = true;
    button.removeEventListener("click", onButtonClick);
    document.removeEventListener("fullscreenchange", syncNativeState);
    window.removeEventListener("keydown", onKeyDown);
    exitNativeFullscreen();
    active = false;
    fallbackActive = false;
    stage.classList.remove("is-world-fullscreen", "is-world-fullscreen-fallback");
    restorePageScroll();
  };
}

function clearWorldFullscreen() {
  if (!fullscreenCleanup) return;
  fullscreenCleanup();
  fullscreenCleanup = null;
}

const owner = (() => {
  const key = "uniworld:owner";
  let v = localStorage.getItem(key);
  if (!v) {
    v = (window.crypto && crypto.randomUUID && crypto.randomUUID()) || "u" + Date.now().toString(36) + Math.random().toString(36).slice(2);
    localStorage.setItem(key, v);
  }
  return v;
})();

const fp = getFingerprint();

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function api(path, body) {
  const res = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "pedido recusado");
  return data;
}

const LOGO = `<svg width="24" height="24" viewBox="0 0 26 26" fill="none" aria-hidden="true">
  <circle cx="13" cy="13" r="9.4" stroke="currentColor" stroke-width="1.1"/>
  <ellipse cx="13" cy="13" rx="4.5" ry="9.4" stroke="currentColor" stroke-width="0.85" opacity="0.85"/>
  <line x1="3.6" y1="13" x2="22.4" y2="13" stroke="currentColor" stroke-width="0.85" opacity="0.85"/>
  <line x1="5.2" y1="8.2" x2="20.8" y2="8.2" stroke="currentColor" stroke-width="0.6" opacity="0.45"/>
  <line x1="5.2" y1="17.8" x2="20.8" y2="17.8" stroke="currentColor" stroke-width="0.6" opacity="0.45"/>
  <rect x="3.6" y="2.9" width="3.1" height="3.1" fill="currentColor"/>
  <rect x="3.6" y="6.4" width="3.1" height="3.1" fill="currentColor"/>
  <rect x="7.1" y="6.4" width="3.1" height="3.1" fill="currentColor"/>
</svg>`;

function layout(inner) {
  return `<header class="site"><div class="wrap">
      <a class="brand" href="#/">${LOGO}<span>uniworld</span></a>
      <nav class="site">
        <a href="#/">mapa</a><a href="#/editar">meu mundo</a><a href="#/estado">estado</a><a href="#/sobre">sobre</a><a href="#/regras">regras</a><a href="https://uniworld.neocities.org/game/index">Jogue</a><a href="https://uniworld.neocities.org/">Descubra</a>
      </nav>
    </div></header>
    <main class="wrap">${inner}</main>
    <footer class="site"><div class="wrap">
      <p>uniworld — criado por Vinícius Gabriel</p>
      <p>Instagram: @morvezito · Contato: miatsupport@gmail.com</p>
      <p>Doe: chave PIX ${PIX_KEY}</p>
    </div></footer>`;
}

function climateWord(c) {
  return c || "claro";
}

/* ---------------- mensagem final ---------------- */

async function messageBlock(state) {
  if (!state.complete || !state.reveal) return "";
  try {
    const lines = await openSealed(state.reveal.key);
    const body = lines
      .map((text, i) => {
        const isTitle = !/[.!?]$/.test(text);
        if (isTitle) return `<h3 class="seal-title">${esc(text)}</h3>`;
        return `<p class="${i === 0 ? "seal-lead" : "seal-line"}">${esc(text)}</p>`;
      })
      .join("");
    return `<section class="seal" id="mensagem">
      <p class="kicker">o mundo está inteiro</p>
      <h2>a mensagem</h2>
      <article>${body}</article>
    </section>`;
  } catch (err) {
    return `<section class="seal"><p class="kicker">o mundo está inteiro</p><h2>a mensagem</h2><p class="hint">o texto não abriu: recarregue a página.</p></section>`;
  }
}

/* ---------------- mapa ---------------- */

async function viewMap() {
  const state = STATIC_PREVIEW ? { parts: [], occupied: 0, total: 2000, empties: 2000, bordersOpen: false } : await api("/api/state");
  const mine = STATIC_PREVIEW ? null : await api("/api/mine").catch(() => null);
  const byCell = new Map(state.parts.map((p) => [p.cx + "," + p.cy, p]));
  let cells = "";
  for (let cy = 0; cy < GRID_H; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      const p = byCell.get(cx + "," + cy);
      const biome = p ? p.biome : biomeAt(cx, cy);
      const color = p ? BIOME_HEX[biome] : mixHex(BIOME_HEX[biome], "#090c10", 0.84);
      const ring = isBorderCell(cx, cy) ? "box-shadow:inset 0 0 0 1px rgba(200,164,92,.4);" : "";
      cells += `<div class="cell${p ? " on" : ""}" data-cx="${cx}" data-cy="${cy}" style="background:${color};${ring}" title="${p ? esc(p.name) : "vazia"}"></div>`;
    }
  }
  const pct = (state.occupied / state.total) * 100;
  const mineBlock = mine
    ? `<div class="panel" style="margin-top:28px">
        <p class="kicker">seu mundo</p>
        <h2 style="margin-top:8px">${esc(mine.part.name)}</h2>
        <p class="note">${BIOME_LABEL[mine.part.biome]} · ${mine.part.cx},${mine.part.cy} · ${climateWord(mine.part.climate)}</p>
        <p class="hint">Que bom ter você de volta. Sua parte está esperando por você.</p>
        <div class="actions">
          <a class="btn solid" href="#/mundo/${mine.part.cx}/${mine.part.cy}">entrar no meu mundo</a>
          <a class="btn" href="#/editar">editar</a>
        </div>
      </div>`
    : "";

  app.innerHTML = layout(`
    <section class="hero">
      <div>
        <p class="kicker">projeto aberto${STATIC_PREVIEW ? " · prévia estática" : ""}</p>
        ${STATIC_PREVIEW ? `<p class="hint">Esta é uma prévia do mapa. Para visitar os mundos e participar, acesse a versão completa do UniWorld.</p>` : ""}
        <h1>Um mundo em duas mil partes.</h1>
        <p class="lede">Cada pessoa traz uma parte, e ela encontra seu lugar no mapa. É assim que um mundo compartilhado começa a nascer.</p>
        <p class="lede" style="margin-top:10px">Quando as duas mil partes estiverem reunidas, uma mensagem será revelada no centro do mapa.</p>
        <div class="actions">
          ${mine || STATIC_PREVIEW ? "" : `<a class="btn solid" href="#/entregar">receber uma parte</a>`}
          <a class="btn" href="#/sobre">como funciona</a>
        </div>
        ${mineBlock}
        ${STATIC_PREVIEW ? "" : `<dl class="stats">
          <div><dt>entregues</dt><dd>${state.occupied}</dd></div>
          <div><dt>vazias</dt><dd>${state.empties}</dd></div>
          <div><dt>totem</dt><dd style="color:var(--ocre)">${state.bordersOpen ? "aberto" : "fechado"}</dd></div>
        </dl>
        <div class="bar"><i style="width:${Math.max(pct, 0.4)}%"></i></div>
        <p class="note">${Math.round(pct * 10) / 10}% do mundo entregue</p>`}
      </div>
      <div>
        <div class="map-wrap"><div class="map">${cells}</div></div>
        <div class="legend">
          ${["oceano", "costa", "campina", "mata", "serra"]
            .map((b) => `<span><i style="background:${BIOME_HEX[b]}"></i>${b}</span>`)
            .join("")}
        </div>
        <p class="note">grade 40 × 50 · 2000 posições</p>
      </div>
    </section>
    ${await messageBlock(state)}`);

  app.querySelectorAll(".cell.on").forEach((el) => {
    el.addEventListener("click", () => {
      location.hash = `#/mundo/${el.dataset.cx}/${el.dataset.cy}`;
    });
  });
}

/* ---------------- entregar ---------------- */

async function viewClaim() {
  app.innerHTML = layout(`
    <section style="padding:48px 0 24px">
      <p class="kicker">entregar uma parte</p>
      <h1 style="font-size:2rem">o que os outros vão ler</h1>
      <div class="panel" style="margin-top:28px;max-width:620px">
        <form id="claim">
          <div class="field">
            <label for="welcome">boas-vindas (até 200 caracteres)</label>
            <textarea id="welcome" rows="3" maxlength="200" placeholder="a frase que todo cidadão do seu mundo diz a quem chega."></textarea>
          </div>
          <div class="field">
            <label for="insta">seu instagram (opcional)</label>
            <input id="insta" maxlength="30" placeholder="seu.perfil" />
          </div>
          <div class="field">
            <label for="c1">pista 1 (opcional)</label>
            <input id="c1" maxlength="120" />
          </div>
          <div class="field">
            <label for="c2">pista 2 (opcional)</label>
            <input id="c2" maxlength="120" />
          </div>
          <div class="field">
            <label for="c3">pista 3 (opcional)</label>
            <input id="c3" maxlength="120" />
          </div>
          <p class="hint">Sua parte vai encontrar um lugar entre os espaços disponíveis. A posição é sorteada, assim como a vizinhança que você vai descobrir.</p>
          <p class="hint">O acesso ao seu mundo fica guardado neste navegador. Se você apagar os dados dele, trocar de navegador ou de aparelho, pode perder o acesso; a recuperação não é automática.</p>
          <div class="actions">
            <button class="btn solid" type="submit">entregar parte</button>
            <a class="btn" href="#/">voltar ao mapa</a>
          </div>
          <p id="err"></p>
        </form>
        <div id="result"></div>
      </div>
    </section>`);

  const form = document.getElementById("claim");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("err");
    errEl.textContent = "";
    errEl.className = "";
    const btn = form.querySelector("button");
    btn.disabled = true;
    btn.textContent = "entregando...";
    try {
      const clues = ["c1", "c2", "c3"].map((id) => document.getElementById(id).value.trim()).filter(Boolean);
      const res = await api("/api/part", {
        ownerId: owner,
        fingerprint: fp,
        instagram: document.getElementById("insta").value.trim() || undefined,
        welcome: document.getElementById("welcome").value.trim() || undefined,
        clues,
      });
      form.classList.add("hidden");
      document.getElementById("result").innerHTML = `
        <p class="kicker">parte entregue</p>
        <h2 style="margin-top:12px">${esc(res.part.name)}</h2>
        <p class="note">${BIOME_LABEL[res.part.biome]} · posição ${res.part.cx},${res.part.cy}</p>
        <div class="field">
          <label>seu código</label>
          <p class="code">${esc(res.code)}</p>
          <p class="hint">Guarde seu código verdadeiro com carinho: ele aparece só desta vez e fará parte do mistério das quatro bordas. Os outros dois são falsos; você pode compartilhá-los com quem quiser.</p>
          <p class="hint">${res.options.map((o, i) => `<span style="border:1px solid var(--line);padding:4px 8px;margin-right:6px;${i === res.realIdx ? "border-color:rgba(200,164,92,.6);color:var(--ocre)" : ""}">${esc(o)}</span>`).join("")}</p>
        </div>
        <div class="actions">
          <a class="btn solid" href="#/mundo/${res.part.cx}/${res.part.cy}">visitar meu mundo</a>
          <a class="btn" href="#/editar">editar meu mundo</a>
        </div>`;
    } catch (err) {
      errEl.className = "error";
      errEl.innerHTML = `${esc(err.message)} ${
        /mundo já/i.test(err.message) ? '<a href="#/editar" style="color:var(--ocre)">abrir o meu mundo</a>' : ""
      }`;
      btn.disabled = false;
      btn.textContent = "entregar parte";
    }
  });
}

/* ---------------- meu mundo ---------------- */

async function viewEdit() {
  const mine = await api("/api/mine").catch(() => null);

  if (!mine) {
    app.innerHTML = layout(`
      <section style="padding:48px 0 24px;max-width:640px">
        <p class="kicker">meu mundo</p>
        <h1 style="font-size:2rem">ainda não encontramos seu mundo aqui.</h1>
        <p class="hint">Se você já criou uma parte, tente voltar ao navegador e ao aparelho que usou para criá-la. Apagar os dados do navegador também pode fazer você perder o acesso, e a recuperação não é automática. Se precisar de ajuda, fale com a gente em <a href="mailto:miatsupport@gmail.com">miatsupport@gmail.com</a> antes de tentar criar outra parte.</p>
        <div class="actions"><a class="btn solid" href="#/">ir ao mapa</a></div>
      </section>`);
    return;
  }

  const part = mine.part;
  const climates = ["claro", "chuva", "neve", "névoa", "vento"];

  app.innerHTML = layout(`
    <section style="padding:40px 0 24px;max-width:680px">
      <p class="kicker">seu mundo</p>
      <h1 style="font-size:2.2rem;margin-top:10px">${esc(part.name)}</h1>
      <p class="note">${BIOME_LABEL[part.biome]} · ${part.cx},${part.cy}</p>
      <div class="panel" style="margin-top:24px">
        <form id="edit">
          <div class="field">
            <label for="name">nome ${mine.canRename ? "" : "(selado)"}</label>
            <input id="name" maxlength="40" value="${esc(part.name)}" ${mine.canRename ? "" : "disabled"} />
            <p class="hint">${mine.canRename ? "Você pode trocar o nome uma única vez. Escolha com carinho." : "O nome já foi alterado e agora permanece assim."}</p>
          </div>
          <div class="field">
            <label for="welcome">boas-vindas (até 200)</label>
            <textarea id="welcome" rows="3" maxlength="200">${esc(part.welcome)}</textarea>
          </div>
          <div class="field">
            <label for="insta">instagram</label>
            <input id="insta" maxlength="30" value="${esc(part.instagram || "")}" placeholder="seu.perfil" />
          </div>
          <div class="field">
            <label>clima</label>
            <div class="actions" id="climates">
              ${climates
                .map(
                  (c) =>
                    `<button class="btn${climateWord(part.climate) === c ? " solid" : ""}" type="button" data-climate="${c}">${c}</button>`,
                )
                .join("")}
            </div>
          </div>
          <div class="actions"><button class="btn solid" type="submit">salvar mudanças</button></div>
          <p id="edit-msg" class="hint"></p>
        </form>
      </div>

      <div class="panel" style="margin-top:20px">
        <p class="kicker">placas</p>
        <p class="hint">até cinco, fixadas no chão do seu mundo. 90 caracteres cada.</p>
        <ul class="list" id="signs">
          ${
            mine.signs.length
              ? mine.signs
                  .map((s) => `<li><span>${esc(s.text)}</span><button class="btn" data-remove="${s.id}" type="button">remover</button></li>`)
                  .join("")
              : `<li>Seu mundo ainda não tem placas.</li>`
          }
        </ul>
        <form id="sign" class="actions" style="margin-top:12px">
          <input id="sign-text" maxlength="90" placeholder="o que a placa diz" style="flex:1" />
          <button class="btn" type="submit" ${mine.signs.length >= 5 ? "disabled" : ""}>fixar placa</button>
        </form>
        <p id="sign-msg" class="hint"></p>
      </div>

      <div class="actions" style="margin-top:20px">
        <a class="btn solid" href="#/mundo/${part.cx}/${part.cy}">visitar</a>
        <a class="btn" href="#/">mapa</a>
      </div>
    </section>`);

  let climate = climateWord(part.climate);
  document.getElementById("climates").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-climate]");
    if (!btn) return;
    climate = btn.dataset.climate;
    document.querySelectorAll("#climates .btn").forEach((b) => b.classList.toggle("solid", b.dataset.climate === climate));
  });

  document.getElementById("edit").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("edit-msg");
    msg.textContent = "";
    msg.className = "hint";
    try {
      await api("/api/mine", {
        name: document.getElementById("name").value.trim(),
        welcome: document.getElementById("welcome").value.trim(),
        instagram: document.getElementById("insta").value.trim(),
        climate,
      });
      msg.textContent = "Suas mudanças foram salvas.";
      msg.className = "hint ok";
      const reload = await api("/api/mine");
      if (!reload.canRename) document.getElementById("name").setAttribute("disabled", "disabled");
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "hint error";
    }
  });

  document.getElementById("sign").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("sign-text");
    const msg = document.getElementById("sign-msg");
    msg.textContent = "";
    if (!input.value.trim()) return;
    try {
      await api("/api/sign", { text: input.value.trim() });
      location.hash = "#/editar";
      router();
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "hint error";
    }
  });

  document.getElementById("signs").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    try {
      await api("/api/sign/delete", { id: btn.dataset.remove });
      router();
    } catch (err) {
      const msg = document.getElementById("sign-msg");
      msg.textContent = err.message;
      msg.className = "hint error";
    }
  });
}

/* ---------------- mundo ---------------- */

async function viewWorld(cx, cy, routeToken) {
  const data = await api(`/api/part/${cx}/${cy}`);
  const clues = await api("/api/clues").catch(() => ({ clues: [] }));
  if (routeToken !== routeEpoch) return;
  const got = new Set(clues.clues.filter((c) => c.cx === cx && c.cy === cy).map((c) => c.idx));
  const part = data.part;

  app.innerHTML = layout(`
    <div style="display:flex;justify-content:space-between;gap:12px;padding:16px 0;font-size:10px;text-transform:uppercase;letter-spacing:.18em;color:var(--muted)">
      <a href="#/">← mapa</a>
      <span>${part.cx},${part.cy} · ${BIOME_LABEL[part.biome]}${part.border ? " · borda" : ""}</span>
    </div>
    <div class="world">
      <div class="stage" id="stage">
        <div class="realm-host" id="realm"></div>
        <div class="hud-top">
          <span class="chip" id="mode">órbita · pistas ${got.size}/3</span>
          <div class="hud-btns">
            <button class="btn" id="sound" type="button" aria-pressed="false" aria-label="Ativar som do mundo">som: ativando…</button>
            <button class="btn" id="recenter" type="button">recentrar</button>
            <button class="btn" id="cam" type="button">câmera</button>
            <button class="btn" id="fullscreen" type="button" aria-pressed="false" aria-label="Abrir mundo em tela cheia">tela cheia</button>
          </div>
        </div>
        <div class="bubble hidden" id="bubble"></div>
        <button class="btn solid collect hidden" id="collect" type="button">coletar pista</button>
        <div class="pad" id="pad"><i></i></div>
      </div>
      <aside class="side">
        <h2 style="font-size:1.9rem">${esc(part.name)}</h2>
        <p class="meta">${BIOME_LABEL[part.biome]} · ${data.local.population} cidadãos · ${climateWord(part.climate)}</p>
        ${part.instagram ? `<p class="meta"><a href="https://instagram.com/${esc(part.instagram)}" target="_blank" rel="noreferrer" style="color:var(--ocre)">@${esc(part.instagram)}</a></p>` : ""}
        <p class="quote">${esc(part.welcome)}</p>
        <p class="meta" style="margin-top:24px">pistas</p>
        <ul class="clues" id="clues">
          ${part.clues
            .map((text, i) =>
              got.has(i)
                ? `<li><b>pista ${i + 1}</b>${esc(text)}</li>`
                : `<li><b>não coletada</b>Caminhe até a forma dourada e toque nela para descobrir a pista.</li>`,
            )
            .join("")}
        </ul>
        <p class="note" style="margin-top:20px">Arraste para olhar ao redor e use o direcional para caminhar. Se quiser, experimente o botão de câmera para trazer o mundo para perto de você.</p>
      </aside>
    </div>`);

  const stage = document.getElementById("stage");
  fullscreenCleanup = setupWorldFullscreen(stage);
  const bubble = document.getElementById("bubble");
  const collectBtn = document.getElementById("collect");
  let nearClue = null;

  realm = createRealm(document.getElementById("realm"), {
    piece: {
      seed: part.seed,
      cx: part.cx,
      cy: part.cy,
      biome: part.biome,
      welcome: part.welcome,
      climate: part.climate,
      signs: data.signs || [],
      nodes: data.local.nodes,
      citizens: data.local.citizens,
      cluePoints: data.local.cluePoints,
      population: data.local.population,
      variant: data.local.variant,
    },
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    onStatus: (m) => {
      const chip = document.getElementById("mode");
      if (chip) chip.textContent = `${m === "camera" ? "câmera" : "órbita"} · pistas ${got.size}/3`;
    },
    onNear: (near) => {
      if (!near) {
        bubble.classList.add("hidden");
        return;
      }
      bubble.textContent = part.welcome;
      bubble.classList.remove("hidden");
    },
    onNearClue: (near) => {
      nearClue = near && !near.far ? near.idx : null;
      collectBtn.classList.toggle("hidden", nearClue === null);
    },
    onClue: (idx, x, z) => collect(idx, x, z),
  });

  const soundButton = document.getElementById("sound");
  function updateSoundButton() {
    if (!soundButton || !ambience) return;
    const state = ambience.getState();
    const on = state === "on";
    soundButton.classList.toggle("solid", on);
    soundButton.setAttribute("aria-pressed", String(on));
    soundButton.disabled = state === "starting" || state === "unavailable";
    if (state === "starting") {
      soundButton.textContent = "som: iniciando";
      soundButton.setAttribute("aria-label", "Ativando som do mundo");
    } else if (state === "blocked") {
      soundButton.textContent = "som: toque";
      soundButton.setAttribute("aria-label", "Som bloqueado; toque no botão ou interaja com o mundo para ativar");
    } else if (state === "unavailable") {
      soundButton.textContent = "sem áudio";
      soundButton.setAttribute("aria-label", "Áudio indisponível neste navegador");
    } else if (on) {
      soundButton.textContent = "som: ligado";
      soundButton.setAttribute("aria-label", "Desativar som do mundo");
    } else {
      soundButton.textContent = "som: desligado";
      soundButton.setAttribute("aria-label", "Ativar som do mundo");
    }
  }
  ambience = createAmbience(part.biome, part.climate);
  soundButton.addEventListener("click", async () => {
    soundButton.disabled = true;
    await ambience.toggle();
    updateSoundButton();
  });
  // Match Neocities: attempt to begin on entering a world; if the browser
  // blocks autoplay, the ambience module waits for the first real user gesture.
  ambience.onState(updateSoundButton);
  ambience.start();

  async function collect(idx, x, z) {
    try {
      const collected = await api("/api/clue", { cx, cy, idx, x, z });
      part.clues[idx] = collected.clue;
      got.add(idx);
      const chip = document.getElementById("mode");
      if (chip) chip.textContent = `${realm && realm.isCameraOn() ? "câmera" : "órbita"} · pistas ${got.size}/3`;
      document.getElementById("clues").innerHTML = part.clues
        .map((text, i) =>
          got.has(i) ? `<li><b>pista ${i + 1}</b>${esc(text)}</li>` : `<li><b>não coletada</b>Caminhe até a forma dourada e toque nela para descobrir a pista.</li>`,
        )
        .join("");
      collectBtn.classList.add("hidden");
    } catch (err) {
      bubble.textContent = err.message;
      bubble.classList.remove("hidden");
      setTimeout(() => bubble.classList.add("hidden"), 2600);
    }
  }

  collectBtn.addEventListener("click", () => {
    if (nearClue === null) return;
    const pos = realm.getAvatar();
    collect(nearClue, pos.x, pos.z);
  });

  document.getElementById("recenter").addEventListener("click", () => realm.recenter());
  document.getElementById("cam").addEventListener("click", async () => {
    if (realm.isCameraOn()) return realm.disableCamera();
    const res = await realm.enableCamera();
    if (res !== "camera") {
      bubble.textContent =
        res === "denied" ? "o aparelho recusou a câmera: seguindo em órbita." : "este navegador não abre a câmera: seguindo em órbita.";
      bubble.classList.remove("hidden");
      setTimeout(() => bubble.classList.add("hidden"), 2600);
    }
  });

  const pad = document.getElementById("pad");
  const knob = pad.querySelector("i");
  let dragging = false;

  function movePad(e) {
    const rect = pad.getBoundingClientRect();
    const max = rect.width / 2 - 14;
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > max) {
      dx = (dx / d) * max;
      dy = (dy / d) * max;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    realm.setMove(dx / max, -dy / max);
  }

  pad.addEventListener("pointerdown", (e) => {
    dragging = true;
    pad.setPointerCapture(e.pointerId);
    movePad(e);
  });
  pad.addEventListener("pointermove", (e) => {
    if (dragging) movePad(e);
  });
  ["pointerup", "pointercancel"].forEach((type) =>
    pad.addEventListener(type, () => {
      dragging = false;
      knob.style.transform = "";
      realm.setMove(0, 0);
    }),
  );

  stage.style.position = "relative";
}

/* ---------------- peça isolada ---------------- */

async function viewPart(id) {
  const [cx, cy] = String(id || "").split("-").map(Number);
  const data = await api(`/api/part/${cx}/${cy}`);
  const part = data.part;
  app.innerHTML = layout(`
    <section style="padding:40px 0 24px;max-width:760px">
      <p class="kicker">peça ${part.cx},${part.cy}</p>
      <h1 style="font-size:2.4rem;margin-top:14px">${esc(part.name)}</h1>
      <p class="meta note">${BIOME_LABEL[part.biome]} · ${data.local.population} cidadãos</p>
      ${part.instagram ? `<p class="meta note"><a href="https://instagram.com/${esc(part.instagram)}" target="_blank" rel="noreferrer" style="color:var(--ocre)">@${esc(part.instagram)}</a></p>` : ""}
      <p class="quote">${esc(part.welcome)}</p>
      <div class="actions">
        <a class="btn solid" href="#/mundo/${part.cx}/${part.cy}">visitar o mundo</a>
        <a class="btn" href="#/">mapa</a>
      </div>
    </section>`);
}

/* ---------------- estado, sobre, regras ---------------- */

async function viewState() {
  const state = await api("/api/state");
  const pct = (state.occupied / state.total) * 100;
  app.innerHTML = layout(`
    <section style="padding:48px 0 24px">
      <p class="kicker">a jornada até aqui</p>
      <h1 style="font-size:2.2rem">estado do mundo</h1>
      <p class="lede">Acompanhe como o UniWorld está crescendo, uma parte de cada vez.</p>
      <dl class="stats">
        <div><dt>entregues</dt><dd>${state.occupied}</dd></div>
        <div><dt>lugares disponíveis</dt><dd>${state.empties}</dd></div>
        <div><dt>bordas</dt><dd style="color:var(--ocre)">${state.bordersOpen ? "disponíveis" : "reservadas"}</dd></div>
      </dl>
      <div class="bar"><i style="width:${Math.max(pct, 0.4)}%"></i></div>
      <p class="note">${Math.round(pct * 10) / 10}% do mundo preenchido</p>
      <h2 style="margin-top:36px">últimas partes</h2>
      <ul class="list">
        ${state.parts
          .slice(0, 12)
          .map(
            (p) =>
              `<li><a href="#/mundo/${p.cx}/${p.cy}">${esc(p.name)}</a><span>${BIOME_LABEL[p.biome]} · ${p.cx},${p.cy}</span></li>`,
          )
          .join("") || `<li>O primeiro pedacinho ainda está esperando para chegar.</li>`}
      </ul>
    </section>`);
}

async function viewAbout() {
  app.innerHTML = layout(`
    <section style="padding:48px 0 24px;max-width:680px">
      <p class="kicker">sobre</p>
      <h1 style="font-size:2.2rem">um mundo que construímos juntos</h1>
      <div class="prose">
        <p>O UniWorld nasce aos poucos, com pedacinhos trazidos por pessoas que talvez nunca tenham se encontrado. Cada parte encontra seu lugar no mapa e passa a fazer parte de algo maior.</p>
        <p>Você pode visitar os mundos, conhecer seus cidadãos e procurar as pistas espalhadas pelo caminho. Se quiser, também pode deixar sua própria parte e receber quem chegar com uma mensagem de boas-vindas.</p>
        <p>Quando as duas mil partes estiverem reunidas, uma mensagem será revelada no centro do mapa. Até lá, há um mundo inteiro para descobrir, junto com quem vier depois de você.</p>
        <p>O UniWorld é gratuito, sem anúncios e sem conta obrigatória. Foi criado por Vinícius Gabriel. Se quiser apoiar o projeto, a chave PIX está no rodapé; se precisar de ajuda ou quiser contar algo, escreva para <a href="mailto:miatsupport@gmail.com">miatsupport@gmail.com</a>.</p>
      </div>
      <div class="actions"><a class="btn" href="#/">explorar o mapa</a><a class="btn" href="#/regras">como participar</a></div>
    </section>`);
}

async function viewRules() {
  const rules = [
    ["uma parte para cada pessoa", "A ideia é que cada pessoa deixe uma parte e ajude o mundo a crescer junto com as outras."],
    ["cada parte encontra seu lugar", "A posição é sorteada entre os espaços disponíveis. Sua vizinhança será uma surpresa."],
    ["deixe suas palavras", "Escreva boas-vindas de até 200 caracteres, pistas de até 120 e placas de até 90. Escolha palavras que acolham quem visitar seu mundo e não coloque links nesses textos."],
    ["escolha o nome com carinho", "Você pode mudar o nome do seu mundo uma única vez. Depois disso, ele permanece como você escolheu."],
    ["guarde seu código", "Cada parte recebe um código verdadeiro e dois falsos. O verdadeiro aparece só uma vez; guarde-o para o mistério das bordas."],
    ["as bordas ficam para depois", "Os espaços das bordas ficam reservados até restarem 40 lugares vazios no mapa."],
    ["cuide do seu acesso", "Seu acesso fica neste navegador. Se você apagar os dados dele ou trocar de aparelho, pode perdê-lo, e a recuperação não é automática."],
  ];
  app.innerHTML = layout(`
    <section style="padding:48px 0 24px;max-width:680px">
      <p class="kicker">regras</p>
      <h1 style="font-size:2.2rem">alguns combinados</h1>
      <p class="lede">Para que todo mundo se sinta bem por aqui, reunimos o que é importante saber antes de participar.</p>
      <ol class="prose" style="list-style:none">
        ${rules.map(([t, d]) => `<li><b style="font-weight:400">${t}</b><br /><span class="note">${d}</span></li>`).join("")}
      </ol>
    </section>`);
}

/* ---------------- roteador ---------------- */

async function router() {
  const routeToken = ++routeEpoch;
  clearWorldFullscreen();
  if (realm) {
    realm.dispose();
    realm = null;
  }
  if (ambience) {
    ambience.dispose();
    ambience = null;
  }
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [route, a, b] = parts;
  try {
    if (STATIC_PREVIEW && ["entregar", "editar", "mundo", "parte", "estado"].includes(route)) {
      app.innerHTML = layout(`<section style="padding:48px 0"><p class="kicker">prévia do UniWorld</p><h1 style="font-size:1.9rem">vamos para o mundo completo?</h1><p class="hint">Esta é uma prévia. Para visitar mundos, acompanhar o mapa e participar, acesse a <a href="https://uniworld-s753.onrender.com/">versão completa do UniWorld</a>.</p><div class="actions"><a class="btn" href="#/">voltar ao mapa</a></div></section>`);
      return;
    }
    if (!route) return await viewMap();
    if (route === "entregar") return await viewClaim();
    if (route === "editar") return await viewEdit();
    if (route === "mundo") return await viewWorld(Number(a), Number(b), routeToken);
    if (route === "parte") return await viewPart(a);
    if (route === "estado") return await viewState();
    if (route === "sobre") return await viewAbout();
    if (route === "regras") return await viewRules();
    return await viewMap();
  } catch (err) {
    app.innerHTML = layout(`<section style="padding:48px 0">
      <p class="kicker">erro</p>
      <h1 style="font-size:1.9rem">${esc(err.message)}</h1>
      <p class="hint">Não conseguimos abrir esta parte agora. Tente novamente em instantes; se o problema continuar, fale com a gente em <a href="mailto:miatsupport@gmail.com">miatsupport@gmail.com</a>.</p>
      <div class="actions"><a class="btn" href="#/">voltar ao mapa</a></div>
    </section>`);
  }
}

window.addEventListener("hashchange", router);
router();