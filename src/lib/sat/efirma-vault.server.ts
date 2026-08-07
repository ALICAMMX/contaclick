/**
 * Bóveda de e.firma (AES-256-GCM) con VERSIÓN, ROTACIÓN DE LLAVE y AAD.
 *
 * Formato v2:   v2.<keyId>.<iv_b64>.<ct_b64>
 * Formato v1:   <iv_b64>.<ct_b64>            (heredado, sólo lectura)
 *
 * - `aad` liga el criptograma a su expediente: un blob copiado a otro
 *   expediente NO se puede descifrar.
 * - La llave activa se toma de SAT_EFIRMA_MASTER_KEY (id SAT_EFIRMA_KEY_ID,
 *   por defecto "k1"). Para rotar se conserva SAT_EFIRMA_MASTER_KEY_PREV
 *   (id SAT_EFIRMA_KEY_ID_PREV, por defecto "k0"), que sólo descifra.
 * - Nunca se registra en logs el material descifrado.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

export const VAULT_VERSION = 2;

function keyIdActivo(): string {
  return process.env["SAT_EFIRMA_KEY_ID"] || "k1";
}

async function importar(raw: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(raw));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function llavePorId(id: string): Promise<CryptoKey> {
  const activaId = keyIdActivo();
  const previaId = process.env["SAT_EFIRMA_KEY_ID_PREV"] || "k0";
  const raw =
    id === activaId
      ? process.env["SAT_EFIRMA_MASTER_KEY"]
      : id === previaId
        ? process.env["SAT_EFIRMA_MASTER_KEY_PREV"]
        : undefined;
  if (!raw) {
    throw new Error(
      "No está disponible la llave de la bóveda de e.firma que cifró esta credencial. " +
        "Vuelve a cargar la e.firma del expediente.",
    );
  }
  return importar(raw);
}

async function masterKeyActiva(): Promise<CryptoKey> {
  const raw = process.env["SAT_EFIRMA_MASTER_KEY"];
  if (!raw) throw new Error("Falta configurar la llave maestra de la bóveda de e.firma");
  return importar(raw);
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

/** Dato adicional autenticado: liga el criptograma a un expediente concreto. */
export function aadExpediente(args: {
  despachoId?: string | null;
  clienteId: string;
  rfc?: string | null;
  campo: string;
}): string {
  return [args.despachoId ?? "", args.clienteId, (args.rfc ?? "").toUpperCase(), args.campo].join(
    "|",
  );
}

export async function cifrar(plain: string, aad?: string): Promise<string> {
  const key = await masterKeyActiva();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const params: AesGcmParams = { name: "AES-GCM", iv };
  if (aad) params.additionalData = enc.encode(aad);
  const ct = await crypto.subtle.encrypt(params, key, enc.encode(plain));
  return `v2.${keyIdActivo()}.${toB64(iv)}.${toB64(ct)}`;
}

export async function descifrar(payload: string, aad?: string): Promise<string> {
  const partes = payload.split(".");

  // v1 heredado: iv.ct con la llave activa y sin AAD.
  if (partes.length === 2) {
    const [ivB64, ctB64] = partes;
    if (!ivB64 || !ctB64) throw new Error("Credencial almacenada inválida");
    const key = await masterKeyActiva();
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(ivB64) },
      key,
      fromB64(ctB64),
    );
    return dec.decode(pt);
  }

  if (partes.length === 4 && partes[0] === "v2") {
    const [, keyId, ivB64, ctB64] = partes;
    if (!keyId || !ivB64 || !ctB64) throw new Error("Credencial almacenada inválida");
    const key = await llavePorId(keyId);
    const params: AesGcmParams = { name: "AES-GCM", iv: fromB64(ivB64) };
    if (aad) params.additionalData = enc.encode(aad);
    const pt = await crypto.subtle.decrypt(params, key, fromB64(ctB64));
    return dec.decode(pt);
  }

  throw new Error("Credencial almacenada inválida");
}

/** ¿El criptograma quedó cifrado con la versión y llave vigentes? */
export function necesitaRecifrado(payload: string): boolean {
  const partes = payload.split(".");
  if (partes.length !== 4 || partes[0] !== "v2") return true;
  return partes[1] !== keyIdActivo();
}
