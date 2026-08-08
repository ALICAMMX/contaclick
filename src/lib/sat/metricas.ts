// =====================================================================
// Métricas inequívocas de una corrida de Descarga Masiva SAT.
//
// Módulo PURO (sin red, sin base de datos). Define de una sola vez el
// significado de cada contador y prohíbe combinaciones contradictorias:
//
//   encontrados : XML contenidos en los paquetes entregados por el SAT.
//   nuevos      : filas canónicas realmente insertadas en el expediente.
//   duplicados  : XML que ya existían (no crean una segunda fila).
//   rechazados  : XML inválidos o no aceptados por la ingesta.
//   vinculados  : comprobantes con linaje persistido hacia ESTA corrida.
//   mostrados   : comprobantes que el detalle logra recuperar y presentar.
//
// Todos se derivan de EVIDENCIA PERSISTIDA (filas y linaje), nunca de
// intentos de procesamiento.
// =====================================================================

export type MetricasCorrida = {
  encontrados: number;
  nuevos: number;
  duplicados: number;
  rechazados: number;
  vinculados: number;
  mostrados: number;
};

/** UUID canónico: sin espacios, en mayúsculas. Única forma admitida. */
export function normalizarUuid(uuid?: string | null): string {
  return String(uuid ?? "").trim().toUpperCase();
}

/** ¿Dos UUID son el mismo comprobante? Ignora espacios y mayúsculas. */
export function mismoUuid(a?: string | null, b?: string | null): boolean {
  const x = normalizarUuid(a);
  return !!x && x === normalizarUuid(b);
}

/** Suma los XML que el SAT entregó, leídos de las solicitudes persistidas. */
export function encontradosDeSolicitudes(solicitudes: any[]): number {
  return (solicitudes ?? []).reduce(
    (t, s) => t + (Number(s?.xml_encontrados ?? 0) || 0),
    0,
  );
}

/**
 * Reconstruye las métricas desde la evidencia persistida.
 *
 * `documentos_vinculados` = filas canónicas cuyo linaje apunta a la corrida.
 * `documentos_huerfanos`  = filas canónicas provenientes de los paquetes de la
 *                           corrida que NO conservan el vínculo (linaje roto).
 */
export function reconstruirMetricas(args: {
  solicitudes: any[];
  documentos_vinculados: number;
  documentos_huerfanos?: number;
  duplicados_persistidos?: number;
  rechazados_persistidos?: number;
  mostrados?: number;
}): MetricasCorrida {
  const encontrados = encontradosDeSolicitudes(args.solicitudes);
  const vinculados = Math.max(0, Number(args.documentos_vinculados ?? 0));
  const huerfanos = Math.max(0, Number(args.documentos_huerfanos ?? 0));
  return {
    encontrados,
    // "Nuevos" son las filas canónicas que existen por esta corrida, tengan o
    // no el vínculo intacto: el documento se incorporó de verdad.
    nuevos: vinculados + huerfanos,
    duplicados: Math.max(0, Number(args.duplicados_persistidos ?? 0)),
    rechazados: Math.max(0, Number(args.rechazados_persistidos ?? 0)),
    vinculados,
    mostrados: Math.max(0, Number(args.mostrados ?? vinculados)),
  };
}

export type CoherenciaMetricas = {
  coherente: boolean;
  problemas: string[];
  /** Texto único que debe usar la interfaz para los comprobantes. */
  mensaje: string;
  /** Faltan vínculos aunque los documentos existan: se puede reconciliar. */
  linaje_incompleto: boolean;
  /** Cobertura que puede declararse honestamente. */
  cobertura_honesta: "total" | "parcial" | "nula";
};

/**
 * Reglas duras. Ninguna interfaz puede mostrar:
 *   - nuevos > 0 con cero incorporados,
 *   - "no incorporó comprobantes" con nuevos > 0,
 *   - cobertura total si falta linaje o visibilidad.
 */
export function evaluarCoherencia(m: MetricasCorrida): CoherenciaMetricas {
  const problemas: string[] = [];
  const procesados = m.nuevos + m.duplicados + m.rechazados;

  if (m.encontrados > 0 && procesados < m.encontrados) {
    problemas.push(
      `El SAT entregó ${m.encontrados} comprobante(s) y sólo hay evidencia de ${procesados}.`,
    );
  }
  const linaje_incompleto = m.nuevos > m.vinculados;
  if (linaje_incompleto) {
    problemas.push(
      `${m.nuevos - m.vinculados} comprobante(s) existen en el expediente pero perdieron el vínculo con esta corrida.`,
    );
  }
  if (m.vinculados > m.mostrados) {
    problemas.push(
      `${m.vinculados - m.mostrados} comprobante(s) tienen linaje pero el detalle no los recupera.`,
    );
  }

  const cobertura_honesta =
    m.encontrados === 0
      ? m.nuevos > 0
        ? "parcial"
        : "nula"
      : problemas.length === 0
        ? "total"
        : m.nuevos + m.duplicados > 0
          ? "parcial"
          : "nula";

  let mensaje: string;
  if (m.encontrados === 0 && m.nuevos === 0 && m.duplicados === 0) {
    mensaje = "El SAT no entregó comprobantes en el periodo solicitado.";
  } else if (m.nuevos === 0 && m.duplicados > 0) {
    mensaje = `Los ${m.duplicados} comprobante(s) entregados ya existían en el expediente: no se creó ningún documento nuevo.`;
  } else if (linaje_incompleto) {
    mensaje = `Se incorporaron ${m.nuevos} comprobante(s), pero sólo ${m.vinculados} conservan el vínculo con esta corrida. Reconcilia el linaje para verlos aquí.`;
  } else if (m.nuevos > 0 && m.mostrados === 0) {
    mensaje = `Se incorporaron ${m.nuevos} comprobante(s) al expediente, pero el detalle no logró recuperarlos.`;
  } else {
    mensaje = `Se incorporaron ${m.nuevos} comprobante(s) nuevos y ${m.duplicados} ya existían.`;
  }

  return {
    coherente: problemas.length === 0,
    problemas,
    mensaje,
    linaje_incompleto,
    cobertura_honesta,
  };
}

// ---------------------------------------------------------------------
// Reconciliación explícita: paquete + UUID + hash
// ---------------------------------------------------------------------

export type DocumentoCandidato = {
  id: string;
  uuid: string;
  archivo_hash?: string | null;
  sat_paquete_id?: string | null;
  sat_run_id?: string | null;
};

/**
 * Documentos que pertenecen a los paquetes de la corrida y no conservan el
 * vínculo. Nunca toca documentos ya vinculados a OTRA corrida.
 */
export function candidatosReconciliacion(args: {
  paquetes: string[];
  documentos: DocumentoCandidato[];
}): DocumentoCandidato[] {
  const paquetes = new Set(
    (args.paquetes ?? []).map((p) => String(p ?? "").trim().toUpperCase()).filter(Boolean),
  );
  return (args.documentos ?? []).filter((d) => {
    if (d.sat_run_id) return false;
    const p = String(d.sat_paquete_id ?? "").trim().toUpperCase();
    return !!p && paquetes.has(p) && !!normalizarUuid(d.uuid);
  });
}

// ---------------------------------------------------------------------
// Selección de dirección y periodo (resumen previo al envío)
// ---------------------------------------------------------------------

export type ResumenEnvio = {
  direcciones: Array<"emitidos" | "recibidos">;
  direcciones_label: string;
  solicitudes: number;
  dias: number;
  valido: boolean;
  motivo: string | null;
};

const DIR_LABEL: Record<string, string> = { emitidos: "Emitidos", recibidos: "Recibidos" };

/** Días INCLUSIVOS entre dos fechas ISO (yyyy-mm-dd). */
export function diasInclusivos(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.floor((b - a) / 86_400_000) + 1;
}

export function resumirEnvio(args: {
  emitidos: boolean;
  recibidos: boolean;
  desde: string;
  hasta: string;
}): ResumenEnvio {
  const direcciones: Array<"emitidos" | "recibidos"> = [];
  if (args.emitidos) direcciones.push("emitidos");
  if (args.recibidos) direcciones.push("recibidos");
  const dias = diasInclusivos(args.desde, args.hasta);
  const motivo =
    direcciones.length === 0
      ? "Selecciona al menos una dirección: Emitidos o Recibidos."
      : dias === 0
        ? "El periodo no es válido: la fecha final debe ser igual o posterior a la inicial."
        : null;
  return {
    direcciones,
    direcciones_label: direcciones.map((d) => DIR_LABEL[d]).join(" y ") || "ninguna",
    solicitudes: direcciones.length,
    dias,
    valido: motivo === null,
    motivo,
  };
}

// ---------------------------------------------------------------------
// Presentación de resultados estructurados (nunca "[object Object]")
// ---------------------------------------------------------------------

export function formatearValor(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.length ? v.map(formatearValor).join(", ") : "—";
  if (typeof v === "object") {
    const entradas = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== null && x !== undefined && typeof x !== "object")
      .map(([k, x]) => `${k}: ${formatearValor(x)}`);
    return entradas.length ? entradas.join(", ") : "—";
  }
  return String(v);
}

/** Convierte el resultado de un módulo en pares legibles para la tabla. */
export function formatearResultado(
  resultado: Record<string, unknown> | null | undefined,
): Array<{ campo: string; valor: string }> {
  if (!resultado) return [];
  return Object.entries(resultado).map(([campo, valor]) => ({
    campo,
    valor: formatearValor(valor),
  }));
}
