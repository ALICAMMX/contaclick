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

export type ResultadoEvidencia = {
  intentada: boolean;
  creada: boolean;
  duplicada: boolean;
  motivo?: string | null;
};

/**
 * Idempotente: repetir el mismo paquete no duplica evidencia ni contadores.
 * Nunca lanza: un fallo de reconciliación no puede tumbar una ingesta.
 */
export async function reconciliarEvidenciaSat(
  supabase: SupabaseClient,
  cfdiId: string,
  linaje?: LinajeIngesta | null,
): Promise<ResultadoEvidencia> {
  const args = candidatoEvidencia(cfdiId, linaje);
  if (!args) return { intentada: false, creada: false, duplicada: false };
  try {
    const { data, error } = await supabase.rpc("cfdi_registrar_evidencia_sat", {
      _cfdi_id: args.cfdi_id,
      _run_id: args.run_id,
      _solicitud_id: args.solicitud_id,
      _paquete_id: args.paquete_id,
    });
    if (error) return { intentada: true, creada: false, duplicada: false, motivo: error.message };
    const r = (data ?? {}) as { creada?: boolean; duplicada?: boolean; motivo?: string | null };
    return {
      intentada: true,
      creada: Boolean(r.creada),
      duplicada: Boolean(r.duplicada),
      motivo: r.motivo ?? null,
    };
  } catch (e) {
    return { intentada: true, creada: false, duplicada: false, motivo: (e as Error)?.message ?? "error" };
  }
}
