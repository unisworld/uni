// fingerprint.js — a impressão digital do aparelho.
// Canvas + GPU + tela + fuso + fontes + hardware. Não usa cookie e não depende
// do navegador: o mesmo aparelho entrega o mesmo valor no Chrome, no Firefox e
// no Safari. É o que impede a mesma pessoa de pegar um segundo mundo.

const KEY = "uniworld:fp";
let cached = null;

function fnv(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let out = (h >>> 0).toString(16);
  while (out.length < 8) out = "0" + out;
  return out;
}

function canvasMark() {
  try {
    const c = document.createElement("canvas");
    c.width = 260;
    c.height = 64;
    const g = c.getContext("2d");
    if (!g) return "sem-canvas";
    g.textBaseline = "top";
    g.font = "16px Arial";
    g.fillStyle = "#f60";
    g.fillRect(0, 0, 130, 32);
    g.fillStyle = "#069";
    g.fillText("uniworld ◐ 世界", 2, 6);
    g.fillStyle = "rgba(102,204,0,0.65)";
    g.fillText("uniworld ◐ 世界", 4, 20);
    g.strokeStyle = "rgba(20,20,20,0.4)";
    g.beginPath();
    g.arc(180, 32, 22, 0, Math.PI * 1.6);
    g.stroke();
    return c.toDataURL();
  } catch (err) {
    return "sem-canvas";
  }
}

function gpuMark() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    if (!gl) return "sem-webgl";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "";
    const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : "";
    return [vendor, renderer, gl.getParameter(gl.VERSION), gl.getParameter(gl.MAX_TEXTURE_SIZE)].join("|");
  } catch (err) {
    return "sem-webgl";
  }
}

function fontMark() {
  try {
    const span = document.createElement("span");
    span.style.cssText = "position:absolute;left:-9999px;top:0;font-size:72px;visibility:hidden";
    span.textContent = "mmmmmmmmmmlli";
    document.body.appendChild(span);
    const base = {};
    ["monospace", "serif", "sans-serif"].forEach((f) => {
      span.style.fontFamily = f;
      base[f] = span.offsetWidth;
    });
    const list = ["Arial", "Georgia", "Courier New", "Times New Roman", "Verdana", "Tahoma", "Trebuchet MS"];
    const out = list.map((f) => {
      span.style.fontFamily = `'${f}',monospace`;
      return `${f}:${span.offsetWidth !== base.monospace ? 1 : 0}`;
    });
    span.remove();
    return out.join(",");
  } catch (err) {
    return "sem-fonte";
  }
}

export function getFingerprint() {
  if (typeof window === "undefined") return "servidor";
  if (cached) return cached;
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored && stored.length >= 16) {
      cached = stored;
      return cached;
    }
  } catch (err) {
    /* navegador sem armazenamento: segue sem cache */
  }

  const parts = [
    canvasMark().slice(-220),
    gpuMark(),
    fontMark(),
    [window.screen.width, window.screen.height, window.screen.colorDepth, window.devicePixelRatio || 1].join("x"),
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    new Date().getTimezoneOffset(),
    (navigator.languages || [navigator.language || ""]).join(","),
    [navigator.hardwareConcurrency || 0, navigator.deviceMemory || 0, navigator.platform || ""].join("|"),
    navigator.maxTouchPoints || 0,
  ];

  const raw = parts.join("~");
  const value = (fnv(raw) + fnv(raw.split("").reverse().join("")) + fnv(raw + raw.length)).slice(0, 32);

  try {
    window.localStorage.setItem(KEY, value);
  } catch (err) {
    /* sem armazenamento: o valor continua igual a cada cálculo */
  }
  cached = value;
  return cached;
}