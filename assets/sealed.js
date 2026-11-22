// sealed.js — a mensagem final viaja cifrada (AES-256-GCM) junto com o site.
// A chave é derivada de uma frase que fica só no servidor e só é entregue quando
// as duas mil peças estiverem no lugar. Antes disso, o texto não abre.

const decode = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export async function openSealed(keyB64) {
  if (!keyB64) throw new Error("mensagem ainda selada.");
  const res = await fetch("./assets/sealed.json", { cache: "force-cache" });
  const sealed = await res.json();
  const key = await crypto.subtle.importKey("raw", decode(keyB64), { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(sealed.iv) }, key, decode(sealed.data));
  return JSON.parse(new TextDecoder().decode(plain));
}