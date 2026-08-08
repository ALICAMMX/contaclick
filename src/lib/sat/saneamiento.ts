// Saneamiento de corridas atoradas — módulo PURO (sin red ni base de datos).
//
// Una corrida no puede quedarse indefinidamente en `solicitando`: o el SAT
// entregó folio (y entonces se sigue esperando) o no lo entregó (y entonces es
// un inicio incompleto que debe cerrarse como error, sin reenviar nada).

import type { EstadoCorrida, SolicitudRegistro } from "./maquina-estados";

/** Minutos que puede permanecer una corrida en `solicitando` sin folio SAT. */
export const MINUTOS_ATORADA = 15;

export type CorridaParaSanear = {
  id: string;
  estado: EstadoCorrida | string;
  iniciado_at: string;
  solicitudes?: SolicitudRegistro[] | null;
  errores?: { fase?: string; mensaje?: string }[] | null;
};

export type DecisionSaneamiento =
  | { accion: "ninguna"; motivo: string }
  | { accion: "continuar_esperando"; motivo: string; estado: EstadoCorrida }
  | {
      accion: "cerrar_error";
      motivo: string;
      estado: EstadoCorrida;
      codigo: "error_inicio_incompleto" | "error_excepcion";
      etapa: string;
    };

export function tieneFolioSat(sols?: SolicitudRegistro[] | null): boolean {
  return (sols ?? []).some((s) => !!s?.id_solicitud);
}

export function minutosDesde(iso: string, ahora = Date.now()): number {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return Number.POSITIVE_INFINITY;
  return (ahora - t) / 60_000;
}

/**
 * Decide qué hacer con una corrida potencialmente atorada.
 * NUNCA propone reenviar una solicitud cuyo destino en el SAT se desconoce.
 */
export function clasificarCorridaAtorada(
  run: CorridaParaSanear,
  ahora = Date.now(),
  minutos = MINUTOS_ATORADA,
): DecisionSaneamiento {
  const sols = run.solicitudes ?? [];
  const conFolio = tieneFolioSat(sols);

  if (run.estado !== "solicitando" && run.estado !== "preparando") {
    return { accion: "ninguna", motivo: "La corrida no está en fase de inicio." };
  }

  if (conFolio) {
    return {
      accion: "continuar_esperando",
      estado: "esperando_sat",
      motivo: "El SAT ya devolvió folio: la corrida continúa su ciclo normal, sin reenviar nada.",
    };
  }

  const conExcepcion = (run.errores ?? []).some((e) => !!e?.mensaje);
  if (conExcepcion) {
    return {
      accion: "cerrar_error",
      estado: "error",
      codigo: "error_excepcion",
      etapa: (run.errores ?? [])[0]?.fase ?? "solicitud",
      motivo: "La corrida registró una excepción y no llegó a enviar solicitudes al SAT.",
    };
  }

  if (minutosDesde(run.iniciado_at, ahora) > minutos) {
    return {
      accion: "cerrar_error",
      estado: "error",
      codigo: "error_inicio_incompleto",
      etapa: "solicitud",
      motivo:
        `La corrida quedó en preparación más de ${minutos} minutos sin que el SAT ` +
        "devolviera folio. Se cierra como inicio incompleto: no se envió nada y no se cobró cuota.",
    };
  }

  return { accion: "ninguna", motivo: "La corrida aún está dentro del tiempo permitido." };
}

/** ¿El usuario puede cerrar manualmente esta corrida? */
export function puedeCerrarseManualmente(
  run: CorridaParaSanear,
  ahora = Date.now(),
  minutos = MINUTOS_ATORADA,
): { permitido: boolean; motivo: string } {
  const estadosVivos = [
    "preparando",
    "solicitando",
    "esperando_sat",
    "descargando",
    "ingiriendo",
    "recalculando",
  ];
  if (!estadosVivos.includes(String(run.estado))) {
    return { permitido: false, motivo: "La corrida ya está cerrada." };
  }
  if (!tieneFolioSat(run.solicitudes)) {
    return {
      permitido: true,
      motivo: "No existe una solicitud confirmada en el SAT: cerrarla no pierde información.",
    };
  }
  if (minutosDesde(run.iniciado_at, ahora) > 24 * 60) {
    return {
      permitido: true,
      motivo:
        "La corrida excedió el tiempo permitido. Se cierra conservando el folio y la evidencia.",
    };
  }
  return {
    permitido: false,
    motivo:
      "El SAT ya aceptó una solicitud de esta corrida y todavía puede entregarla. " +
      "Espera o usa Reintentar para volver a consultar el avance.",
  };
}
