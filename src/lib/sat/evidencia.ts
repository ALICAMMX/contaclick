// =====================================================================
// EVIDENCIA DE ESTATUS SAT DERIVADA DE LA DESCARGA MASIVA.
//
// Regla dura: el estatus "vigente" NO se inventa ni lo declara el frontend.
// Sólo puede derivarse de una solicitud REAL persistida cuyo atributo
// EstadoComprobante fue "Vigente" y de un paquete entregado por el SAT.
//
// Esto NO es una consulta de estatus posterior a la descarga: es la constancia
// de que el comprobante fue ENTREGADO por el SAT dentro de una solicitud de
// comprobantes vigentes. La redacción de la interfaz debe decir exactamente eso.
// =====================================================================

import type { EstadoComprobante } from "./solicitud-xml";

/** Linaje operativo del documento: de dónde vino y con qué evidencia. */
export type LinajeIngesta = {
  origen: string;
  proveedor?: string | null;
  run_id?: string | null;
  solicitud_id?: string | null;
  paquete_id?: string | null;
  /** Atributo EstadoComprobante de la solicitud persistida que trajo el XML. */
  estado_comprobante?: EstadoComprobante | null;
};

export const ORIGEN_DESCARGA_MASIVA = "sat_descarga_masiva";
export const FUENTE_DESCARGA_MASIVA = "descarga_masiva_sat";

export type EvidenciaEstatus = {
  estatus_sat: "vigente" | "cancelado" | "desconocido";
  estatus_sat_fuente: string | null;
  estatus_sat_evidencia_at: string | null;
};

/**
 * Deriva la evidencia de estatus de UN documento a partir de su linaje.
 *
 * Devuelve "desconocido" —sin fuente ni fecha— salvo que se cumplan TODAS
 * las condiciones: origen de descarga masiva, folio de solicitud, paquete y
 * EstadoComprobante = "Vigente". Una carga manual jamás produce evidencia.
 */
export function evidenciaEstatusSat(
  linaje?: LinajeIngesta | null,
  ahora: () => Date = () => new Date(),
): EvidenciaEstatus {
  const sinEvidencia: EvidenciaEstatus = {
    estatus_sat: "desconocido",
    estatus_sat_fuente: null,
    estatus_sat_evidencia_at: null,
  };
  if (!linaje) return sinEvidencia;
  if (linaje.origen !== ORIGEN_DESCARGA_MASIVA) return sinEvidencia;
  if (!linaje.solicitud_id || !linaje.paquete_id) return sinEvidencia;
  if (linaje.estado_comprobante !== "Vigente") return sinEvidencia;

  return {
    estatus_sat: "vigente",
    estatus_sat_fuente: FUENTE_DESCARGA_MASIVA,
    estatus_sat_evidencia_at: ahora().toISOString(),
  };
}

/** Texto único, sin ambigüedad, para mostrar la evidencia en la interfaz. */
export function leyendaEvidencia(fuente?: string | null): string | null {
  if (fuente !== FUENTE_DESCARGA_MASIVA) return null;
  return "Entregado por el SAT dentro de una solicitud de comprobantes vigentes (Descarga Masiva). No es una consulta de estatus posterior.";
}
