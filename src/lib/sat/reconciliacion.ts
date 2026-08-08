// =====================================================================
// RECONCILIACIÓN DE EFECTOS PREVIOS DE UN MÓDULO DE PROCESAMIENTO SAT.
//
// Módulo PURO. Responde a una sola pregunta, sin base de datos y sin red:
//
//   Un intento anterior pudo haber ejecutado el módulo SIN dejar recibo.
//   ¿Qué es honesto hacer ahora: reconstruir el recibo, volver a ejecutar,
//   o bloquear y pedir intervención?
//
// Reglas duras:
//   - No basta con que la bitácora tenga llave única: el EFECTO del módulo
//     también debe ser idempotente para autorizar una reejecución.
//   - Si hay efectos comprobables y su resultado es inequívoco, se RECONSTRUYE
//     el recibo (recuperación histórica) y NO se vuelve a ejecutar.
//   - Si hay efectos pero el resultado no puede probarse, sólo se autoriza
//     una operación de REEMPLAZO TOTAL desde la fuente canónica. Nunca una
//     operación acumulativa.
// =====================================================================

/** Cómo escribe cada módulo obligatorio del procesamiento posterior. */
export type SemanticaModulo = {
  /** ¿Produce datos derivados persistentes? */
  escribe: boolean;
  /**
   * - `solo_lectura`: no persiste nada; reejecutar no tiene efecto observable.
   * - `reemplazo_total`: sustituye la fila completa por llave natural.
   * - `acumulativa`: agrega filas en cada corrida (NO es idempotente).
   */
  idempotencia: "solo_lectura" | "reemplazo_total" | "acumulativa";
  /** Tablas que toca (para la auditoría y la evidencia). */
  tablas: string[];
  /** Llave natural que garantiza el reemplazo. */
  llave_natural?: string;
};

export const SEMANTICA_MODULO: Record<string, SemanticaModulo> = {
  salud_fiscal: {
    escribe: true,
    idempotencia: "reemplazo_total",
    tablas: ["salud_fiscal_snapshots"],
    llave_natural: "cliente_id,periodo",
  },
  riesgo_sat: { escribe: false, idempotencia: "solo_lectura", tablas: [] },
  auditor_cfdi: { escribe: false, idempotencia: "solo_lectura", tablas: [] },
  efos: { escribe: false, idempotencia: "solo_lectura", tablas: [] },
};

/** Evidencia observada en las tablas derivadas para un módulo y una corrida. */
export type EvidenciaEfecto = {
  /** Se detectó una escritura atribuible al intento anterior. */
  existe: boolean;
  /** El resultado guardado es legible e inequívoco (permite reconstruir el recibo). */
  determinable: boolean;
  /** Resumen saneado del resultado observado. */
  resultado?: Record<string, unknown>;
  /** Momento de la escritura observada. */
  at?: string | null;
  /** De dónde salió la evidencia (tabla + llave). */
  fuente?: string;
};

export type DecisionRecuperacion = {
  module_id: string;
  accion: "reconstruir" | "ejecutar" | "bloquear";
  /** ¿Es seguro reejecutar el módulo sin acumular efectos? */
  seguro_reejecutar: boolean;
  motivo: string;
};

/**
 * Decide qué hacer con un módulo SIN recibo terminal.
 * `evidencia` puede omitirse cuando no se buscó (módulos de sólo lectura).
 */
export function decidirRecuperacion(args: {
  module_id: string;
  evidencia?: EvidenciaEfecto | null;
}): DecisionRecuperacion {
  const sem = SEMANTICA_MODULO[args.module_id];
  const ev = args.evidencia ?? null;

  if (!sem) {
    return {
      module_id: args.module_id,
      accion: "bloquear",
      seguro_reejecutar: false,
      motivo: "Módulo desconocido: no hay semántica de escritura declarada.",
    };
  }

  // 1) Sin escrituras: reejecutar no puede duplicar nada.
  if (!sem.escribe) {
    return {
      module_id: args.module_id,
      accion: "ejecutar",
      seguro_reejecutar: true,
      motivo: "El módulo no persiste datos derivados; su ejecución es de sólo lectura.",
    };
  }

  // 2) Hay efectos comprobables y su resultado es inequívoco: recuperación
  //    histórica. No se vuelve a ejecutar.
  if (ev?.existe && ev.determinable) {
    return {
      module_id: args.module_id,
      accion: "reconstruir",
      seguro_reejecutar: true,
      motivo: `Existe resultado persistido del intento anterior (${ev.fuente ?? sem.tablas[0]}); se reconstruye el recibo sin reejecutar.`,
    };
  }

  // 3) Hay efectos, pero el resultado no puede probarse.
  if (ev?.existe && !ev.determinable) {
    if (sem.idempotencia === "reemplazo_total") {
      return {
        module_id: args.module_id,
        accion: "ejecutar",
        seguro_reejecutar: true,
        motivo: `Efectos previos sin resultado probable: se recalcula desde la fuente canónica y se sustituye la fila completa (${sem.llave_natural}).`,
      };
    }
    return {
      module_id: args.module_id,
      accion: "bloquear",
      seguro_reejecutar: false,
      motivo: "Efectos previos sin resultado probable y escritura acumulativa: reejecutar duplicaría datos.",
    };
  }

  // 4) Sin efectos detectados.
  if (sem.idempotencia === "acumulativa") {
    return {
      module_id: args.module_id,
      accion: "bloquear",
      seguro_reejecutar: false,
      motivo: "Escritura acumulativa sin garantía de reemplazo: no puede ejecutarse automáticamente.",
    };
  }
  return {
    module_id: args.module_id,
    accion: "ejecutar",
    seguro_reejecutar: true,
    motivo: "No se detectaron efectos previos; la operación es de reemplazo total.",
  };
}

/**
 * Un candado `iniciado` puede quedar huérfano si el proceso murió entre el
 * recibo de inicio y el cierre. Sólo se recupera cuando venció el plazo y la
 * operación es idempotente (nunca acumulativa).
 */
export const RECLAMO_CANDADO_MS = 10 * 60 * 1000;

export function candadoRecuperable(args: {
  module_id: string;
  iniciado_at?: string | null;
  ahora?: number;
}): boolean {
  const sem = SEMANTICA_MODULO[args.module_id];
  if (!sem || sem.idempotencia === "acumulativa") return false;
  const t = args.iniciado_at ? Date.parse(args.iniciado_at) : NaN;
  if (!Number.isFinite(t)) return false;
  return (args.ahora ?? Date.now()) - t >= RECLAMO_CANDADO_MS;
}
