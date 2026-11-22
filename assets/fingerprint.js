// Identificador aleatório deste perfil de navegador; não é biometria nem prova de aparelho.
// O usuário pode apagá-lo, e outro navegador/perfil recebe outro valor. Não use como autenticação.

const KEY = "uniworld:fp";
let cached = null;

function newId() {
  const bytes = new Uint8Array(16);
  if (!globalThis.crypto?.getRandomValues) throw new Error("Este navegador não oferece geração segura de identificadores.");
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getFingerprint() {
  if (typeof window === "undefined") return "";
  if (cached) return cached;
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored && /^[a-f0-9]{32}$/.test(stored)) {
      cached = stored;
      return cached;
    }
    cached = newId();
    window.localStorage.setItem(KEY, cached);
  } catch {
    // Sem armazenamento persistente, o ID só dura até esta página ser recarregada.
    cached = newId();
  }
  return cached;
}
