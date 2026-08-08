// =====================================================================
// Procesamiento posterior de una corrida SAT — FUENTE ÚNICA.
//
// Módulo PURO (sin red, sin base de datos). Resuelve, con un solo criterio
// compartido por servidor y UI:
//   - qué paquetes entregó realmente el SAT y cuáles conservan referencia,
//   - qué complementos trae un comprobante según su tipo real,
//   - si una corrida con comprobantes nuevos ya tiene procesamiento posterior,
//   - qué estado y cobertura pueden declararse honestamente.
//
// Regla dura: nunca puede afirmarse "no hubo comprobantes nuevos" cuando
// nuevos > 0, ni "sin paquetes entregados" cuando el SAT reportó paquetes.
// =====================================================================

import { MODULOS_RECALCULO, MODULO_LABEL, paqueteSaneado } from "./linaje";

// ---------------------------------------------------------------------
// Paquetes
// ---------------------------------------------------------------------

export type PaqueteVisible = { referencia: string };

export type ResumenPaquetes = {
  /** Referencias reales conservadas (enmascaradas). */
  lista: PaqueteVisible[];
  /** Cuántos paquetes reportó el SAT (fuente: solicitudes + contador). */
  reportados: number;
  /** El SAT reportó paquetes pero no se conservó ninguna referencia. */
  sin_referencia: boolean;
  /** Texto único que debe mostrar la interfaz. */
  mensaje: string | null;
};

function refsDeSolicitud(s: any): string[] {
  const campos = [s?.paquetes_procesados, s?.paquetes_encontrados, s?.paquetes];
  const out: string[] = [];
  for (const c of campos) {
    if (!Array.isArray(c)) continue;
    for (const x of c) {
      const v = String(typeof x === "string" ? x : (x?.id ?? x?.id_paquete ?? "")).trim();
      if (v) out.push(v);
    }
  }
  return out;
}

/**
 * Une TODAS las fuentes de paquetes: las solicitudes de la corrida y el linaje
 * persistido en los comprobantes. El contador y la lista salen de aquí, nunca
 * de fuentes distintas.
 */
export function resumirPaquetes(args: {
  solicitudes: any[];
  documentos: Array<{ sat_paquete_id?: string | null }>;
  paquetes_reportados?: number | null;
}): ResumenPaquetes {
  const crudas = new Set<string>();
  for (const s of args.solicitudes ?? []) for (const r of refsDeSolicitud(s)) crudas.add(r);
  for (const d of args.documentos ?? []) {
    const v = String(d?.sat_paquete_id ?? "").trim();
    if (v) crudas.add(v);
  }
  const lista = Array.from(crudas).map((id) => ({ referencia: paqueteSaneado(id) }));
  const reportados = Math.max(Number(args.paquetes_reportados ?? 0) || 0, lista.length);
  const sin_referencia = reportados > 0 && lista.length === 0;

  let mensaje: string | null = null;
  if (sin_referencia) {
    mensaje = `El SAT reportó ${reportados} paquete${reportados === 1 ? "" : "s"}; la referencia histórica no fue conservada.`;
  } else if (reportados === 0) {
    mensaje = "El SAT no entregó paquetes en esta corrida.";
  }
  return { lista, reportados, sin_referencia, mensaje };
}

// ---------------------------------------------------------------------
// Clasificación factual: complementos derivados del comprobante real
// ---------------------------------------------------------------------

/**
 * Complementos que se derivan del TipoDeComprobante real. No depende de
 * ningún botón de la interfaz: es un hecho del XML.
 */
export function complementosDe(tipo_cfdi?: string | null): string[] {
  const t = String(tipo_cfdi ?? "").toUpperCase();
  if (t === "P") return ["Complemento de recepción de pagos"];
  if (t === "N") return ["Complemento de nómina"];
  return [];
}

export const TIPO_COMPROBANTE_LABEL: Record<string, string> = {
  I: "I · Ingreso",
  E: "E · Egreso",
  T: "T · Traslado",
  N: "N · Nómina",
  P: "P · Pago",
};

export function etiquetaTipoComprobante(tipo?: string | null): string {
  const t = String(tipo ?? "").toUpperCase();
  return TIPO_COMPROBANTE_LABEL[t] ?? (t ? `${t} · No clasificado` : "No clasificado");
}

// ---------------------------------------------------------------------
// Procesamiento posterior (recálculos obligatorios)
// ---------------------------------------------------------------------

export type EventoRecalculo = {
  modulo: string;
  estado: "ejecutado" | "omitido" | "fallido" | "pendiente";
  mensaje?: string | null;
  at?: string | null;
};

export type EstadoProcesamiento = {
  /** La corrida trajo comprobantes nuevos: el procesamiento es obligatorio. */
  requerido: boolean;
  /** Módulos obligatorios sin evidencia registrada. */
  faltantes: string[];
  completo: boolean;
  hubo_fallos: boolean;
  /** Estado que puede declararse honestamente para la corrida. */
  estado_honesto: "completada" | "parcial" | "procesamiento_pendiente" | "error" | null;
  cobertura_honesta: string | null;
  /** Puede ofrecerse "Completar procesamiento posterior". */
  puede_recuperar: boolean;
  mensaje: string;
};

/** Traduce el `tipo` guardado en sat_sync_eventos al estado del módulo. */
export function estadoDeEvento(tipo: string): EventoRecalculo["estado"] | null {
  if (tipo === "recalculo_ok" || tipo === "recalculo_aplicado") return "ejecutado";
  if (tipo === "recalculo_omitido") return "omitido";
  if (tipo === "recalculo_fallido") return "fallido";
  if (tipo === "recalculo_pendiente") return "pendiente";
  return null;
}

export function evaluarProcesamiento(args: {
  estado: string;
  cobertura?: string | null;
  nuevos: number;
  recalculos: EventoRecalculo[];
  /** Hay otro procesamiento corriendo ahora mismo. */
  ocupado?: boolean;
}): EstadoProcesamiento {
  const nuevos = Number(args.nuevos ?? 0);
  const requerido = nuevos > 0;
  const registrados = new Map<string, EventoRecalculo["estado"]>();
  for (const r of args.recalculos ?? []) {
    if (r.estado === "pendiente") continue;
    registrados.set(r.modulo, r.estado);
  }
  const faltantes = MODULOS_RECALCULO.filter((m) => !registrados.has(m));
  const hubo_fallos = Array.from(registrados.values()).includes("fallido");
  const completo = requerido ? faltantes.length === 0 : true;

  if (!requerido) {
    return {
      requerido: false,
      faltantes: [],
      completo: true,
      hubo_fallos,
      estado_honesto: null,
      cobertura_honesta: args.cobertura ?? null,
      puede_recuperar: false,
      mensaje:
        "Esta corrida no incorporó comprobantes nuevos, por lo que no hay procesamiento posterior que registrar.",
    };
  }

  if (!completo) {
    return {
      requerido: true,
      faltantes: [...faltantes],
      completo: false,
      hubo_fallos,
      estado_honesto: "procesamiento_pendiente",
      cobertura_honesta: "pendiente de procesamiento",
      puede_recuperar: !args.ocupado,
      mensaje: `Esta corrida incorporó ${nuevos} comprobante${nuevos === 1 ? "" : "s"} nuevo${nuevos === 1 ? "" : "s"}, pero faltan eventos de procesamiento posterior: ${faltantes
        .map((m) => MODULO_LABEL[m] ?? m)
        .join(", ")}.`,
    };
  }

  return {
    requerido: true,
    faltantes: [],
    completo: true,
    hubo_fallos,
    estado_honesto: hubo_fallos ? "parcial" : "completada",
    cobertura_honesta: hubo_fallos ? "parcial" : (args.cobertura ?? null),
    puede_recuperar: false,
    mensaje: hubo_fallos
      ? "El procesamiento posterior se ejecutó, pero al menos un módulo falló: la corrida queda parcial."
      : "Procesamiento posterior completo: todos los módulos dejaron evidencia.",
  };
}

export const ESTADO_PROCESAMIENTO_LABEL: Record<string, string> = {
  completada: "Completada",
  parcial: "Parcial",
  procesamiento_pendiente: "Procesamiento pendiente",
  error: "Error",
};
