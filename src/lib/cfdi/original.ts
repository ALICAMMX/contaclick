// ─────────────────────────────────────────────────────────────────────────────
// ARCHIVO ORIGINAL DEL CFDI — reglas puras.
//
// Toda la lógica que decide QUÉ se guarda, DÓNDE se guarda y CUÁNDO puede
// considerarse evidencia vive aquí, sin red, sin base y sin Storage, para que
// pueda probarse con datos sintéticos.
//
// Principio: los bytes entregados por el SAT son la fuente canónica. Se
// conservan exactamente como llegaron (no se reformatean, no se reserializan)
// y su huella SHA-256 se calcula ANTES de cualquier transformación.
// ─────────────────────────────────────────────────────────────────────────────

/** Archivero privado exclusivo de originales fiscales. Nunca público. */
export const BUCKET_ORIGINALES = "cfdi-originales";

/** Un CFDI legítimo no pesa megabytes; el tope evita cargas abusivas. */
export const MAX_BYTES_XML = 4 * 1024 * 1024;

export type EstadoOriginal =
  | "pendiente"
  | "almacenado"
  | "verificado"
  | "fallido"
  | "conflicto_integridad"
  | "historico_no_disponible";

export const ETIQUETA_ESTADO_ORIGINAL: Record<EstadoOriginal, string> = {
  pendiente: "Pendiente de almacenamiento",
  almacenado: "Almacenado (sin verificar)",
  verificado: "Original XML disponible y verificado",
  fallido: "Original con error de integridad",
  conflicto_integridad: "Original con error de integridad",
  historico_no_disponible: "Recuperado desde encabezado, sin original",
};

/** Sólo un original releído y con huella coincidente cuenta como cobertura. */
export function originalVerificado(estado: string | null | undefined): boolean {
  return estado === "verificado";
}

// ── Ruta interna ─────────────────────────────────────────────────────────────

/**
 * Ruta estable basada SÓLO en identificadores internos.
 * Nunca contiene RFC, razón social ni correo:
 *   despacho_id/cliente_id/AAAA/MM/uuid.xml
 */
export function rutaOriginal(args: {
  despachoId: string;
  clienteId: string;
  uuid: string;
  fecha?: string | Date | null;
}): string {
  const d = args.fecha ? new Date(args.fecha) : new Date();
  const base = Number.isNaN(d.getTime()) ? new Date() : d;
  const anio = String(base.getUTCFullYear()).padStart(4, "0");
  const mes = String(base.getUTCMonth() + 1).padStart(2, "0");
  const uuid = args.uuid.trim().toUpperCase();
  return `${args.despachoId}/${args.clienteId}/${anio}/${mes}/${uuid}.xml`;
}

// ── Validación de entradas del ZIP ───────────────────────────────────────────

/**
 * Rechaza rutas peligrosas de un paquete: escapes de directorio, rutas
 * absolutas, unidades de Windows, caracteres de control y nombres no XML.
 */
export function entradaZipSegura(nombre: string): { ok: true } | { ok: false; motivo: string } {
  const n = String(nombre ?? "");
  if (!n) return { ok: false, motivo: "Entrada sin nombre." };
  if (n.length > 255) return { ok: false, motivo: "Nombre de entrada demasiado largo." };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(n)) return { ok: false, motivo: "Nombre con caracteres de control." };
  if (n.includes("\\")) return { ok: false, motivo: "Ruta con separador de Windows." };
  if (n.startsWith("/")) return { ok: false, motivo: "Ruta absoluta no permitida." };
  if (/^[a-zA-Z]:/.test(n)) return { ok: false, motivo: "Ruta con unidad de disco no permitida." };
  if (n.split("/").some((p) => p === "..")) return { ok: false, motivo: "Ruta con escape de directorio." };
  if (!/\.xml$/i.test(n)) return { ok: false, motivo: "La entrada no es un XML." };
  return { ok: true };
}

// ── Validación del contenido ─────────────────────────────────────────────────

const BOM = [0xef, 0xbb, 0xbf];

function sinBom(bytes: Uint8Array): Uint8Array {
  if (bytes.length >= 3 && bytes[0] === BOM[0] && bytes[1] === BOM[1] && bytes[2] === BOM[2]) {
    return bytes.subarray(3);
  }
  return bytes;
}

export function textoDeBytes(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Valida que los bytes sean un XML aceptable y sin vectores XXE.
 * No transforma nada: sólo mira.
 */
export function validarBytesXml(bytes: Uint8Array): { ok: true } | { ok: false; motivo: string } {
  if (!bytes || bytes.length === 0) return { ok: false, motivo: "Archivo vacío." };
  if (bytes.length > MAX_BYTES_XML) {
    return { ok: false, motivo: `Archivo demasiado grande (${bytes.length} bytes).` };
  }
  const texto = textoDeBytes(sinBom(bytes));
  const cabeza = texto.slice(0, 4096);
  if (!/^\s*</.test(cabeza)) return { ok: false, motivo: "El contenido no es XML." };
  if (/<!DOCTYPE/i.test(cabeza)) {
    return { ok: false, motivo: "XML con DOCTYPE: entidades externas deshabilitadas por seguridad." };
  }
  if (/<!ENTITY/i.test(texto)) {
    return { ok: false, motivo: "XML con declaración de entidades: rechazado por seguridad (XXE)." };
  }
  return { ok: true };
}

/** SHA-256 en hexadecimal sobre los BYTES ORIGINALES, antes de transformar. */
export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const copia = new Uint8Array(bytes);
  const buf = await crypto.subtle.digest("SHA-256", copia.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── UUID y versión leídos del propio XML ─────────────────────────────────────

export function uuidDeXml(xml: string): string | null {
  const m = xml.match(/UUID\s*=\s*"([^"]+)"/i) ?? xml.match(/UUID\s*=\s*'([^']+)'/i);
  return m?.[1] ? m[1].trim().toUpperCase() : null;
}

export function versionDeXml(xml: string): string | null {
  const m = xml.match(/<cfdi:Comprobante[^>]*\sVersion\s*=\s*"([^"]+)"/i);
  return m?.[1] ?? null;
}

// ── Idempotencia frente a lo ya almacenado ───────────────────────────────────

export type FilaOriginal = {
  id: string;
  original_estado?: string | null;
  original_sha256?: string | null;
  original_path?: string | null;
};

export type DecisionOriginal =
  | { accion: "crear" }
  | { accion: "reutilizar"; motivo: string }
  | { accion: "enriquecer"; motivo: string }
  | { accion: "conflicto"; motivo: string };

/**
 * Qué hacer cuando el UUID ya existe en el expediente:
 *   · mismo hash → idempotente, se reutiliza el objeto y se completa el linaje;
 *   · hash distinto → NUNCA se sobrescribe: incidencia de integridad;
 *   · fila histórica sin original → se enriquece la MISMA fila.
 */
export function decidirOriginal(
  existente: FilaOriginal | null | undefined,
  hashNuevo: string,
): DecisionOriginal {
  if (!existente) return { accion: "crear" };
  const previo = (existente.original_sha256 ?? "").toLowerCase();
  const tieneObjeto = !!existente.original_path && previo.length === 64;
  if (!tieneObjeto) {
    return {
      accion: "enriquecer",
      motivo: "El comprobante existía sin XML original: se incorpora el archivo auténtico a la misma fila.",
    };
  }
  if (previo === hashNuevo.toLowerCase()) {
    return { accion: "reutilizar", motivo: "Mismo UUID y misma huella: el original ya estaba almacenado." };
  }
  return {
    accion: "conflicto",
    motivo:
      "Mismo UUID con contenido distinto al ya almacenado: el original no se sobrescribe y el documento queda en revisión.",
  };
}

export const MOTIVO_CONFLICTO_INTEGRIDAD = {
  codigo: "CONFLICTO_INTEGRIDAD_ORIGINAL",
  mensaje:
    "Se recibió un comprobante con el mismo folio fiscal pero contenido distinto al archivo original ya almacenado. No se sobrescribió; requiere revisión.",
};

export const MOTIVO_ORIGINAL_NO_ALMACENADO = {
  codigo: "ORIGINAL_NO_ALMACENADO",
  mensaje:
    "El XML entregado no pudo conservarse en el archivero seguro. El documento no cuenta con original verificable.",
};
