/**
 * Bóveda de e.firma: cifra/descifra el .key y su contraseña con AES-256-GCM.
 * La llave maestra vive solo en el servidor (SAT_EFIRMA_MASTER_KEY).
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

async function masterKey(): Promise<CryptoKey> {
  const raw = process.env["SAT_EFIRMA_MASTER_KEY"];
  if (!raw) throw new Error("Falta configurar la llave maestra de la bóveda de e.firma");
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(raw));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function toB64(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function cifrar(plain: string): Promise<string> {
  const key = await masterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain));
  return `${toB64(iv)}.${toB64(ct)}`;
}

export async function descifrar(payload: string): Promise<string> {
  const [ivB64, ctB64] = payload.split(".");
  if (!ivB64 || !ctB64) throw new Error("Credencial almacenada inválida");
  const key = await masterKey();
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivB64) },
    key,
    fromB64(ctB64),
  );
  return dec.decode(pt);
}
