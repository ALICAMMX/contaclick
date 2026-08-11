// ─────────────────────────────────────────────────────────────────────────────
// EVIDENCIA MÍNIMA DE UN COMPROBANTE Y DECISIONES PERMITIDAS.
//
// Regla dura: sin evidencia SAT vigente o sin XML original, un CFDI NO puede
// declararse deducible (ni parcialmente deducible). Sólo caben "por revisar"
// (que bloquea el cierre) o "no deducible" con motivo suficiente.
//
// Esta lógica es PURA y se usa en tres lugares: el servidor de clasificación
// (payload por comprobante), la interfaz (opciones deshabilitadas con motivo)
// y el RPC de negocio en la base (que es la frontera real de seguridad).
// ─────────────────────────────────────────────────────────────────────────────

import type { Decision } from "./decisiones";
import { VERSION_RECUPERACION_ENCABEZADO } from "./reparacion";

export type EvidenciaFila = {
  estatus_sat: string | null;
  estatus_sat_fuente?: string | null;
  detalle_reconstruible?: boolean | null;
  normalizacion_version?: string | null;
};

/** El XML original está disponible sólo si el detalle es reconstruible desde él. */
export function xmlOriginalDisponible(c: EvidenciaFila): boolean {
  if (c.detalle_reconstruible !== true) return false;
  return (c.normalizacion_version ?? "") !== VERSION_RECUPERACION_ENCABEZADO;
}

/** La evidencia SAT sólo cuenta cuando el comprobante está confirmado vigente. */
export function estatusSatConfirmado(c: EvidenciaFila): boolean {
  return (c.estatus_sat ?? "desconocido") === "vigente";
}

export type Evidencia = {
  estatus_sat: string;
  estatus_sat_confirmado: boolean;
  xml_original_disponible: boolean;
  suficiente: boolean;
  limitaciones: string[];
};

export const MOTIVO_SIN_ESTATUS =
  "Estatus SAT no confirmado: el comprobante no está verificado como vigente.";
export const MOTIVO_SIN_XML =
  "XML original no disponible: el detalle fiscal no puede verificarse.";

export function evaluarEvidencia(c: EvidenciaFila): Evidencia {
  const estatusOk = estatusSatConfirmado(c);
  const xmlOk = xmlOriginalDisponible(c);
  const limitaciones: string[] = [];
  if (!estatusOk) limitaciones.push(MOTIVO_SIN_ESTATUS);
  if (!xmlOk) limitaciones.push(MOTIVO_SIN_XML);
  return {
    estatus_sat: c.estatus_sat ?? "desconocido",
    estatus_sat_confirmado: estatusOk,
    xml_original_disponible: xmlOk,
    suficiente: estatusOk && xmlOk,
    limitaciones,
  };
}

export type PermisoDecision = { permitida: boolean; motivo: string | null; exige: string[] };

/**
 * Decisiones permitidas por comprobante. El servidor las devuelve y la base las
 * vuelve a aplicar: deshabilitar botones en React NO es un control.
 */
export function decisionesPermitidas(c: EvidenciaFila): Record<Decision, PermisoDecision> {
  const ev = evaluarEvidencia(c);
  const bloqueo = ev.limitaciones.join(" ");
  return {
    deducible: ev.suficiente
      ? { permitida: true, motivo: null, exige: ["Fundamento del gasto"] }
      : { permitida: false, motivo: bloqueo, exige: [] },
    parcial: ev.suficiente
      ? {
          permitida: true,
          motivo: null,
          exige: ["Porcentaje ISR (1-99)", "Porcentaje de acreditamiento de IVA", "Motivo (mín. 10)"],
        }
      : { permitida: false, motivo: bloqueo, exige: [] },
    no_deducible: { permitida: true, motivo: null, exige: ["Motivo (mín. 10 caracteres)"] },
    por_revisar: {
      permitida: true,
      motivo: null,
      exige: [],
    },
  };
}

/** Estado honesto del análisis de deducibilidad. Nunca "verde" por omisión. */
export type EstadoAnalisis =
  | "no_analizado"
  | "no_evaluable"
  | "con_hallazgos"
  | "sin_hallazgos_detectados";

export function estadoAnalisis(input: {
  analizado: boolean;
  total: number;
  evaluables: number;
  hallazgos: number;
}): EstadoAnalisis {
  if (!input.analizado || input.total === 0) return "no_analizado";
  if (input.evaluables === 0) return "no_evaluable";
  return input.hallazgos > 0 ? "con_hallazgos" : "sin_hallazgos_detectados";
}

export const ETIQUETA_ESTADO_ANALISIS: Record<EstadoAnalisis, string> = {
  no_analizado: "No analizado",
  no_evaluable: "No evaluable por evidencia insuficiente",
  con_hallazgos: "Analizado con hallazgos",
  sin_hallazgos_detectados: "Analizado sin hallazgos detectados",
};
