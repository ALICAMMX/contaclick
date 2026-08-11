// ─────────────────────────────────────────────────────────────────────────────
// CONSERVACIÓN DEL XML ORIGINAL EN EL ARCHIVERO PRIVADO.
//
// Storage y base de datos NO comparten transacción. Por eso el orden es
// recuperable y verificable:
//   1. validar bytes  2. subir objeto  3. RELEER y comparar SHA-256
//   4. sólo entonces se declara "verificado" y la base puede registrarlo.
//
// El almacén se inyecta como puerto (`AlmacenOriginales`) para poder probar
// caídas, huérfanos y reintentos sin tocar la nube.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUCKET_ORIGINALES,
  decidirOriginal,
  rutaOriginal,
  sha256Bytes,
  validarBytesXml,
  type EstadoOriginal,
  type FilaOriginal,
} from "./original";

export interface AlmacenOriginales {
  /** Sube sin sobrescribir. `existia: true` cuando el objeto ya estaba. */
  subir(path: string, bytes: Uint8Array): Promise<{ ok: boolean; existia?: boolean; error?: string }>;
  /** Relee el objeto tal cual quedó almacenado. `null` si no existe. */
  leer(path: string): Promise<Uint8Array | null>;
  /** Borra un huérfano (objeto subido cuyo registro no llegó a existir). */
  eliminar(path: string): Promise<void>;
}

/** Puerto real contra Supabase Storage. Requiere cliente de servicio. */
export function almacenSupabase(supabase: SupabaseClient): AlmacenOriginales {
  const bucket = supabase.storage.from(BUCKET_ORIGINALES);
  return {
    async subir(path, bytes) {
      const { error } = await bucket.upload(path, new Blob([new Uint8Array(bytes)]), {
        contentType: "application/xml",
        upsert: false,
      });
      if (!error) return { ok: true };
      const msg = String((error as any)?.message ?? error);
      // El objeto ya existía: no es un fallo, es idempotencia.
      if (/exists|duplicate|409/i.test(msg)) return { ok: true, existia: true };
      return { ok: false, error: msg };
    },
    async leer(path) {
      const { data, error } = await bucket.download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    async eliminar(path) {
      await bucket.remove([path]);
    },
  };
}

export type ResultadoOriginal =
  | {
      ok: true;
      estado: Extract<EstadoOriginal, "verificado">;
      bucket: string;
      path: string;
      sha256: string;
      bytes: number;
      reutilizado: boolean;
      xml: string;
    }
  | {
      ok: false;
      estado: Extract<EstadoOriginal, "fallido" | "conflicto_integridad">;
      error: string;
      path?: string;
    };

/**
 * Conserva los bytes ORIGINALES y los verifica releyéndolos.
 * Nunca reformatea el archivo: lo que se guarda es byte a byte lo entregado.
 */
export async function conservarOriginal(
  almacen: AlmacenOriginales,
  args: {
    despachoId: string;
    clienteId: string;
    uuid: string;
    fecha?: string | Date | null;
    bytes: Uint8Array;
    /** Fila ya existente con ese UUID, si la hay. */
    existente?: FilaOriginal | null;
  },
): Promise<ResultadoOriginal> {
  const v = validarBytesXml(args.bytes);
  if (!v.ok) return { ok: false, estado: "fallido", error: v.motivo };

  const sha256 = await sha256Bytes(args.bytes);
  const decision = decidirOriginal(args.existente ?? null, sha256);
  if (decision.accion === "conflicto") {
    return { ok: false, estado: "conflicto_integridad", error: decision.motivo };
  }

  const path =
    decision.accion === "reutilizar" && args.existente?.original_path
      ? args.existente.original_path
      : rutaOriginal({
          despachoId: args.despachoId,
          clienteId: args.clienteId,
          uuid: args.uuid,
          fecha: args.fecha ?? null,
        });

  const subida = await almacen.subir(path, args.bytes);
  if (!subida.ok) {
    // Antes de subir con éxito no se crea ningún registro que aparente original.
    return { ok: false, estado: "fallido", error: subida.error ?? "No se pudo almacenar el original.", path };
  }

  // VERIFICACIÓN OBLIGATORIA: lectura de vuelta y huella coincidente.
  const releido = await almacen.leer(path);
  if (!releido) {
    return { ok: false, estado: "fallido", error: "El objeto no pudo releerse tras almacenarse.", path };
  }
  const shaReleido = await sha256Bytes(releido);
  if (shaReleido !== sha256) {
    // Objeto preexistente con contenido distinto: jamás se sobrescribe.
    if (subida.existia) {
      return {
        ok: false,
        estado: "conflicto_integridad",
        error: "Ya existía un objeto con esa ruta y contenido distinto; no se sobrescribió.",
        path,
      };
    }
    return { ok: false, estado: "fallido", error: "La huella del objeto releído no coincide.", path };
  }

  return {
    ok: true,
    estado: "verificado",
    bucket: BUCKET_ORIGINALES,
    path,
    sha256,
    bytes: args.bytes.byteLength,
    reutilizado: decision.accion === "reutilizar" || subida.existia === true,
    xml: new TextDecoder("utf-8").decode(releido),
  };
}

/**
 * Relee y verifica un original ya registrado. Devuelve el XML sólo cuando el
 * objeto existe y su huella coincide con la registrada.
 */
export async function leerOriginalVerificado(
  almacen: AlmacenOriginales,
  fila: { original_path?: string | null; original_sha256?: string | null },
): Promise<{ ok: true; xml: string } | { ok: false; error: string }> {
  if (!fila.original_path) return { ok: false, error: "El comprobante no tiene original almacenado." };
  const bytes = await almacen.leer(fila.original_path);
  if (!bytes) return { ok: false, error: "El objeto no existe en el archivero." };
  const sha = await sha256Bytes(bytes);
  if (fila.original_sha256 && sha !== fila.original_sha256.toLowerCase()) {
    return { ok: false, error: "La huella del original no coincide con la registrada." };
  }
  return { ok: true, xml: new TextDecoder("utf-8").decode(bytes) };
}

/** Limpia un objeto huérfano de forma segura (sólo si nadie lo registró). */
export async function limpiarHuerfano(
  supabase: SupabaseClient,
  almacen: AlmacenOriginales,
  path: string,
): Promise<{ limpiado: boolean }> {
  const { data } = await supabase
    .from("cfdi_xml")
    .select("id")
    .eq("original_path", path)
    .limit(1)
    .maybeSingle();
  if (data?.id) return { limpiado: false };
  await almacen.eliminar(path);
  return { limpiado: true };
}

/** Almacén real con credenciales de servicio; nunca llega al navegador. */
export async function almacenDeServicio(): Promise<AlmacenOriginales> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return almacenSupabase(supabaseAdmin as unknown as SupabaseClient);
}
