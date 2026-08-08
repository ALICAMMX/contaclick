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
//
// FUENTE ÚNICA: el estado, la cobertura, el texto de resultado, la tabla de
// módulos y el botón se derivan EXCLUSIVAMENTE de los eventos persistidos por
// módulo (tabla `sat_procesamiento_eventos`). Ningún texto puede declarar
// "completado" sin que exista un evento terminal por cada módulo obligatorio.
// ---------------------------------------------------------------------

export const VERSION_PROCESAMIENTO = "v2";
export const VERSION_SOPORTE_SAT = "sat-processing-2026.08.08.2";

export type EstadoModulo = "iniciado" | "completado" | "omitido" | "fallido";

export type EventoModulo = {
  module_id: string;
  estado: EstadoModulo;
  iniciado_at?: string | null;
  finalizado_at?: string | null;
  /** Motivo de omisión o de error. Una omisión sin motivo NO es evidencia. */
  motivo?: string | null;
  resultado?: unknown;
  version?: string | null;
};

/** Llave que impide ejecutar dos veces el mismo módulo de la misma corrida. */
export function llaveModulo(runId: string, moduleId: string, version = VERSION_PROCESAMIENTO) {
  return `proc:${runId}:${moduleId}:${version}`;
}

/** Un evento sólo cuenta como evidencia terminal si está cerrado y justificado. */
export function esEvidenciaTerminal(e: EventoModulo): boolean {
  if (e.estado === "completado" || e.estado === "fallido") return true;
  if (e.estado === "omitido") return !!String(e.motivo ?? "").trim();
  return false;
}

export type EstadoProcesamiento = {
  /** La corrida trajo comprobantes nuevos: el procesamiento es obligatorio. */
  requerido: boolean;
  /** Módulos obligatorios sin evidencia terminal registrada. */
  faltantes: string[];
  /** Módulos con un intento abierto (estado `iniciado`). */
  en_curso: string[];
  /** Módulos terminados con fallo (reintentables). */
  fallidos: string[];
  completo: boolean;
  hubo_fallos: boolean;
  /** Estado que puede declararse honestamente para la corrida. */
  estado_honesto: "completada" | "parcial" | "procesamiento_pendiente" | "recalculando" | "error" | null;
  cobertura_honesta: string | null;
  /** ¿La corrida puede cerrarse (fin definitivo)? */
  terminal: boolean;
  /** Puede ofrecerse la acción de recuperación. */
  puede_recuperar: boolean;
  /** Nombre exacto que debe llevar el botón (null = no debe mostrarse). */
  accion_label: string | null;
  mensaje: string;
};

export function evaluarProcesamiento(args: {
  cobertura?: string | null;
  nuevos: number;
  eventos: EventoModulo[];
  /** Hay otro procesamiento corriendo ahora mismo. */
  ocupado?: boolean;
}): EstadoProcesamiento {
  const nuevos = Number(args.nuevos ?? 0);
  const requerido = nuevos > 0;
  const eventos = (args.eventos ?? []).filter((e) => MODULOS_RECALCULO.includes(e.module_id as any));

  const terminales = new Map<string, EventoModulo>();
  const abiertos = new Set<string>();
  for (const e of eventos) {
    if (esEvidenciaTerminal(e)) {
      const previo = terminales.get(e.module_id);
      // Un módulo completado no puede degradarse por un evento fallido viejo.
      if (!previo || previo.estado === "fallido") terminales.set(e.module_id, e);
    } else if (e.estado === "iniciado") {
      abiertos.add(e.module_id);
    }
  }

  const faltantes = MODULOS_RECALCULO.filter((m) => !terminales.has(m));
  const en_curso = MODULOS_RECALCULO.filter((m) => abiertos.has(m) && !terminales.has(m));
  const fallidos = MODULOS_RECALCULO.filter((m) => terminales.get(m)?.estado === "fallido");
  const hubo_fallos = fallidos.length > 0;
  const completo = requerido ? faltantes.length === 0 : true;

  if (!requerido) {
    return {
      requerido: false,
      faltantes: [],
      en_curso: [],
      fallidos: [],
      completo: true,
      hubo_fallos,
      estado_honesto: null,
      cobertura_honesta: args.cobertura ?? null,
      terminal: true,
      puede_recuperar: false,
      accion_label: null,
      mensaje:
        "Esta corrida no incorporó comprobantes nuevos, por lo que no hay procesamiento posterior que registrar.",
    };
  }

  const etiquetas = (ms: string[]) => ms.map((m) => MODULO_LABEL[m] ?? m).join(", ");

  if (en_curso.length) {
    return {
      requerido: true,
      faltantes: [...faltantes],
      en_curso,
      fallidos,
      completo: false,
      hubo_fallos,
      estado_honesto: "recalculando",
      cobertura_honesta: "pendiente de procesamiento",
      terminal: false,
      puede_recuperar: false,
      accion_label: null,
      mensaje: `Procesamiento en curso: ${etiquetas(en_curso)}.`,
    };
  }

  if (!completo) {
    const nuncaInicio = terminales.size === 0;
    return {
      requerido: true,
      faltantes: [...faltantes],
      en_curso: [],
      fallidos,
      completo: false,
      hubo_fallos,
      estado_honesto: "procesamiento_pendiente",
      cobertura_honesta: "pendiente de procesamiento",
      terminal: false,
      puede_recuperar: !args.ocupado,
      accion_label: args.ocupado
        ? null
        : nuncaInicio
          ? "Completar procesamiento posterior"
          : "Reanudar procesamiento",
      mensaje: `Esta corrida incorporó ${nuevos} comprobante${nuevos === 1 ? "" : "s"} nuevo${
        nuevos === 1 ? "" : "s"
      }, pero faltan eventos de procesamiento posterior: ${etiquetas(faltantes)}.`,
    };
  }

  // Todos los módulos tienen evidencia terminal.
  const todosFallidos = fallidos.length === MODULOS_RECALCULO.length;
  const estado_honesto = todosFallidos ? "error" : hubo_fallos ? "parcial" : "completada";
  return {
    requerido: true,
    faltantes: [],
    en_curso: [],
    fallidos,
    completo: true,
    hubo_fallos,
    estado_honesto,
    cobertura_honesta: hubo_fallos ? "parcial" : (args.cobertura ?? null),
    terminal: true,
    puede_recuperar: hubo_fallos && !args.ocupado,
    accion_label: hubo_fallos && !args.ocupado ? "Reanudar procesamiento" : null,
    mensaje: todosFallidos
      ? `Ningún módulo pudo recalcularse: ${etiquetas(fallidos)}.`
      : hubo_fallos
        ? `El procesamiento posterior se ejecutó, pero falló: ${etiquetas(fallidos)}. La corrida queda parcial.`
        : "Procesamiento posterior completo: todos los módulos dejaron evidencia.",
  };
}

export const ESTADO_PROCESAMIENTO_LABEL: Record<string, string> = {
  completada: "Completada",
  parcial: "Parcial",
  procesamiento_pendiente: "Procesamiento pendiente",
  recalculando: "Recalculando",
  error: "Error",
};

export const ESTADO_MODULO_LABEL: Record<EstadoModulo, string> = {
  iniciado: "En curso",
  completado: "Completado",
  omitido: "Omitido",
  fallido: "Falló",
};

