// =====================================================================
// RECONCILIACIÓN DE EVIDENCIA SAT SOBRE UN CFDI YA EXISTENTE.
//
// Un comprobante puede llegar primero por carga manual (sin evidencia) y
// después dentro de un paquete entregado por el SAT. En ese caso NO se crea
// otra fila: se registra la evidencia y se actualiza la proyección.
//
// La verdad NO la decide este archivo: sólo decide si vale la pena llamar al
// RPC `cfdi_registrar_evidencia_sat`, que revalida todo contra los datos
// persistidos (corrida, solicitud con EstadoComprobante="Vigente" y paquete
// procesado). Si algo no cuadra, el documento permanece "desconocido".
// =====================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { ORIGEN_DESCARGA_MASIVA, type LinajeIngesta } from "./evidencia";

export type ArgsEvidencia = {
  cfdi_id: string;
  run_id: string;
  solicitud_id: string;
  paquete_id: string;
};

/**
 * Decide si el linaje es candidato a evidencia. Cerrado por defecto: falta un
 * dato, origen distinto o EstadoComprobante distinto de "Vigente" ⇒ `null`.
 */
export function candidatoEvidencia(
  cfdiId: string,
  linaje?: LinajeIngesta | null,
): ArgsEvidencia | null {
  if (!cfdiId || !linaje) return null;
  if (linaje.origen !== ORIGEN_DESCARGA_MASIVA) return null;
  if (linaje.estado_comprobante !== "Vigente") return null;
  const run_id = linaje.run_id?.trim();
  const solicitud_id = linaje.solicitud_id?.trim();
  const paquete_id = linaje.paquete_id?.trim();
  if (!run_id || !solicitud_id || !paquete_id) return null;
  return { cfdi_id: cfdiId, run_id, solicitud_id, paquete_id };
}

/**
 * Resultado explícito. Nunca se oculta un fallo cuando SÍ había candidato:
 * - `sin_candidato`: el linaje no alcanza; el CFDI permanece "desconocido".
 * - `creada` / `existente`: hay bitácora válida y proyección coherente.
 * - `rechazada`: el RPC revalidó y NO respalda la evidencia.
 * - `error`: fallo técnico al registrar; la evidencia queda PENDIENTE.
 */
export type ResultadoEvidencia = {
  resultado: "sin_candidato" | "creada" | "existente" | "rechazada" | "error";
  intentada: boolean;
  creada: boolean;
  duplicada: boolean;
  /** Hay linaje completo: si no hubo evidencia, el caso exige seguimiento. */
  candidato: ArgsEvidencia | null;
  motivo?: string | null;
};

/**
 * Idempotente: repetir el mismo paquete no duplica evidencia ni contadores.
 * Nunca lanza: un fallo de reconciliación no puede tumbar una ingesta, pero
 * SÍ se reporta para que la ingesta marque el documento como pendiente.
 */
export async function reconciliarEvidenciaSat(
  supabase: SupabaseClient,
  cfdiId: string,
  linaje?: LinajeIngesta | null,
): Promise<ResultadoEvidencia> {
  const args = candidatoEvidencia(cfdiId, linaje);
  if (!args) {
    return { resultado: "sin_candidato", intentada: false, creada: false, duplicada: false, candidato: null };
  }
  try {
    const { data, error } = await supabase.rpc("cfdi_registrar_evidencia_sat", {
      _cfdi_id: args.cfdi_id,
      _run_id: args.run_id,
      _solicitud_id: args.solicitud_id,
      _paquete_id: args.paquete_id,
    });
    if (error) {
      return {
        resultado: "error",
        intentada: true,
        creada: false,
        duplicada: false,
        candidato: args,
        motivo: error.message,
      };
    }
    const r = (data ?? {}) as {
      creada?: boolean;
      duplicada?: boolean;
      rechazada?: boolean;
      motivo?: string | null;
    };
    if (r.creada) {
      return { resultado: "creada", intentada: true, creada: true, duplicada: false, candidato: args, motivo: null };
    }
    if (r.duplicada) {
      return { resultado: "existente", intentada: true, creada: false, duplicada: true, candidato: args, motivo: null };
    }
    return {
      resultado: "rechazada",
      intentada: true,
      creada: false,
      duplicada: false,
      candidato: args,
      motivo: r.motivo ?? "RECHAZADA",
    };
  } catch (e) {
    return {
      resultado: "error",
      intentada: true,
      creada: false,
      duplicada: false,
      candidato: args,
      motivo: (e as Error)?.message ?? "error",
    };
  }
}

/** ¿Hubo candidato completo sin evidencia registrada? Exige seguimiento. */
export function evidenciaPendiente(r: ResultadoEvidencia): boolean {
  return r.resultado === "rechazada" || r.resultado === "error";
}

export const CODIGO_EVIDENCIA_PENDIENTE = "EVIDENCIA_SAT_PENDIENTE";

/** Motivo operativo con lo necesario para reintentar SIN volver a descargar. */
export function motivoEvidenciaPendiente(r: ResultadoEvidencia) {
  return {
    codigo: CODIGO_EVIDENCIA_PENDIENTE,
    mensaje:
      "El paquete declaró este comprobante, pero la evidencia SAT no pudo registrarse. El documento permanece con estatus desconocido hasta reconciliar.",
    motivo_rpc: r.motivo ?? null,
    run_id: r.candidato?.run_id ?? null,
    solicitud_id: r.candidato?.solicitud_id ?? null,
    paquete_id: r.candidato?.paquete_id ?? null,
  };
}

