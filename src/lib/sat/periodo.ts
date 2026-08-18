// =====================================================================
// Periodo efectivo de una solicitud de Descarga Masiva SAT.
//
// Módulo puro (sin red, sin base de datos).
//
// HECHO OFICIAL (documentación vigente del Servicio de Solicitud de
// Descarga Masiva de CFDI):
//   FechaInicial: CFDI cuya FECHA DE EMISIÓN sea igual o mayor.
//   FechaFinal:   CFDI cuya FECHA DE EMISIÓN sea igual o menor.
// El contrato NO distingue entre emitidos y recibidos, y NO menciona la
// fecha de certificación (timbrado) como criterio de filtrado.
//
// COMPORTAMIENTO OBSERVADO, NO EXPLICADO (corrida 4f8c05ce,
// 2026-07-29 → 2026-08-01): el comprobante BCDD4B19 tiene emisión
// 2026-08-01 23:26:04 y certificación 2026-08-02 03:15:29 (hora del
// centro). No apareció en esa corrida y sí en la siguiente
// (2026-08-01 → 2026-08-03). Un solo caso NO prueba causalidad: se
// registra como anomalía sin explicación definitiva. Hipótesis abiertas
// en HIPOTESIS_ANOMALIA (ninguna verificada; no se codifica ninguna).
// =====================================================================

export type DireccionPeriodo = "emitidos" | "recibidos";

/** Zona en la que el SAT interpreta FechaInicial y FechaFinal. */
export const ZONA_SAT = "America/Mexico_City";
export const ETIQUETA_ZONA_SAT = "hora del centro de México";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Criterio temporal DOCUMENTADO oficialmente. Es el mismo en ambas
 * direcciones: fecha de emisión del comprobante.
 */
export function criterioTemporal(_direccion?: DireccionPeriodo): string {
  return "fecha de emisión del comprobante (criterio documentado)";
}

/** Hipótesis abiertas para la ausencia observada. Ninguna confirmada. */
export const HIPOTESIS_ANOMALIA = [
  "Diferencia entre el request almacenado y el efectivamente firmado y enviado.",
  "Zona horaria u offset: DateTime enviado sin offset explícito.",
  "Paquete parcial o lista de UUID incompleta atribuida al paquete.",
  "Diferencias de RFC, estado del comprobante o tipo de solicitud entre corridas.",
  "Resultado no determinista o inconsistencia temporal del servicio del SAT.",
  "Error de atribución del UUID al paquete durante la cosecha local.",
] as const;

export function notaCriterio(_direccion?: DireccionPeriodo): string {
  return "El SAT documenta que FechaInicial y FechaFinal filtran por la fecha de emisión del comprobante, en ambas direcciones. Se ha observado al menos un comprobante emitido dentro del periodo que no llegó en esa corrida y sí en la siguiente; es un comportamiento observado sin explicación confirmada, no una regla del servicio.";
}


/** Fecha AAAA-MM-DD en la zona del SAT (no en UTC ni en la del navegador). */
export function fechaLocalSat(d: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_SAT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return partes; // en-CA ya entrega AAAA-MM-DD
}

/** Fecha-hora AAAA-MM-DDTHH:MM:SS en la zona del SAT. */
export function fechaHoraLocalSat(d: Date): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_SAT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:${g("second")}`;
}

export type PeriodoEfectivo =
  | {
      valido: true;
      desde: string;
      hasta: string;
      fechaInicial: string;
      fechaFinal: string;
      dias: number;
      zona: string;
      etiqueta: string;
    }
  | { valido: false; motivo: string };

/**
 * Traduce el rango de la interfaz al rango exacto que se envía al SAT.
 * Ambos extremos son inclusivos: 00:00:00 del primer día y 23:59:59 del último.
 */
export function periodoEfectivo(desde: string, hasta: string): PeriodoEfectivo {
  const d = String(desde ?? "").trim();
  const h = String(hasta ?? "").trim();
  if (!FECHA_RE.test(d) || !FECHA_RE.test(h)) {
    return { valido: false, motivo: "Captura ambas fechas con formato AAAA-MM-DD." };
  }
  if (d > h) {
    return { valido: false, motivo: "La fecha inicial no puede ser posterior a la final." };
  }
  const ms = Date.parse(`${h}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`);
  const dias = Math.round(ms / 86_400_000) + 1;
  const fechaInicial = `${d}T00:00:00`;
  const fechaFinal = `${h}T23:59:59`;
  return {
    valido: true,
    desde: d,
    hasta: h,
    fechaInicial,
    fechaFinal,
    dias,
    zona: ZONA_SAT,
    etiqueta: `${fechaInicial} a ${fechaFinal} (${ETIQUETA_ZONA_SAT}, ambos extremos incluidos, ${dias} día(s))`,
  };
}

/**
 * ¿Una marca de tiempo cae dentro del periodo, con el criterio del SAT?
 * `instante` es el momento del evento que el SAT usa como filtro:
 * emisión para emitidos, certificación para recibidos.
 */
export function dentroDelPeriodo(
  instante: Date | string,
  desde: string,
  hasta: string,
): boolean {
  const p = periodoEfectivo(desde, hasta);
  if (!p.valido) return false;
  const fecha = instante instanceof Date ? instante : new Date(instante);
  if (Number.isNaN(fecha.getTime())) return false;
  const local = fechaHoraLocalSat(fecha);
  return local >= p.fechaInicial && local <= p.fechaFinal;
}

/**
 * Explica la inclusión de un comprobante SIEMPRE con el criterio oficial
 * (fecha de emisión). La fecha de certificación se reporta aparte, como
 * dato informativo, nunca como criterio.
 */
export function explicarInclusion(args: {
  direccion: DireccionPeriodo;
  desde: string;
  hasta: string;
  emision: Date | string;
  certificacion?: Date | string | null;
}): {
  incluido: boolean;
  criterio: string;
  instante: string;
  emision: string;
  certificacion: string | null;
  motivo: string;
  anomalia: boolean;
} {
  const fe = args.emision instanceof Date ? args.emision : new Date(args.emision);
  const instante = Number.isNaN(fe.getTime()) ? "—" : fechaHoraLocalSat(fe);
  const fc = args.certificacion
    ? args.certificacion instanceof Date
      ? args.certificacion
      : new Date(args.certificacion)
    : null;
  const certificacion = fc && !Number.isNaN(fc.getTime()) ? fechaHoraLocalSat(fc) : null;
  const incluido = dentroDelPeriodo(fe, args.desde, args.hasta);
  const criterio = criterioTemporal(args.direccion);
  return {
    incluido,
    criterio,
    instante,
    emision: instante,
    certificacion,
    motivo: incluido
      ? `Su ${criterio} (${instante}, ${ETIQUETA_ZONA_SAT}) cae dentro del periodo solicitado.`
      : `Su ${criterio} (${instante}, ${ETIQUETA_ZONA_SAT}) queda fuera del periodo solicitado.`,
    anomalia: false,
  };
}

/**
 * Un comprobante que, según el criterio oficial, DEBÍA venir en el periodo
 * y no llegó. No se le atribuye causa: se marca como comportamiento
 * observado no explicado, con las hipótesis abiertas.
 */
export function clasificarAusencia(args: {
  direccion: DireccionPeriodo;
  desde: string;
  hasta: string;
  emision: Date | string;
  certificacion?: Date | string | null;
}): {
  esperado: boolean;
  anomalia: boolean;
  etiqueta: string;
  hipotesis: readonly string[];
  detalle: ReturnType<typeof explicarInclusion>;
} {
  const detalle = explicarInclusion(args);
  return {
    esperado: detalle.incluido,
    anomalia: detalle.incluido,
    etiqueta: detalle.incluido
      ? "Comportamiento observado no explicado"
      : "Fuera del periodo solicitado según el criterio documentado",
    hipotesis: detalle.incluido ? HIPOTESIS_ANOMALIA : [],
    detalle,
  };
}


// =====================================================================
// RANGO SAT — FUENTE ÚNICA
//
// Origen del defecto corregido: se calculaba "hoy" con
// `new Date().toISOString().slice(0,10)`, es decir el día UTC. A las
// 22:38 del centro de México ya es el día siguiente en UTC, así que la
// solicitud pedía FechaFinal en el futuro y el SAT respondía 301.
//
// Reglas:
//   - "hoy" del SAT SIEMPRE con fechaLocalSat() en America/Mexico_City.
//   - Los periodos automáticos usan SÓLO días completos: terminan ayer.
//   - El periodo personalizado NO se corrige en silencio: se rechaza.
// =====================================================================

export type PeriodoSat = "30d" | "mes_actual" | "ejercicio" | "personalizado";

export type RangoSatValido = {
  ok: true;
  periodo: PeriodoSat;
  desde: string;
  hasta: string;
  /** Último día completo disponible (ayer, hora del centro). */
  maximo: string;
  hoyLocal: string;
};

export type RangoSatInvalido = {
  ok: false;
  periodo: PeriodoSat;
  codigo: "rango_sat_invalido";
  motivo: string;
  accion: string;
  maximo: string;
  hoyLocal: string;
};

export type RangoSat = RangoSatValido | RangoSatInvalido;

/** Suma días a una fecha AAAA-MM-DD sin tocar zonas horarias. */
export function sumarDias(fecha: string, dias: number): string {
  const t = Date.parse(`${fecha}T00:00:00Z`);
  return new Date(t + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Último día completo que el SAT puede entregar: ayer en hora del centro. */
export function ultimoDiaCompletoSat(ahora: Date = new Date()): string {
  return sumarDias(fechaLocalSat(ahora), -1);
}

/**
 * ÚNICA fuente del rango de fechas enviado al SAT: vista previa, preflight,
 * sincronización manual, programaciones nocturnas, construcción de la
 * solicitud e idempotencia de la corrida.
 */
export function resolverRangoSat(args: {
  periodo: PeriodoSat | string | null | undefined;
  fechaDesde?: string | null;
  fechaHasta?: string | null;
  ahora?: Date;
  zonaHoraria?: string;
}): RangoSat {
  const ahora = args.ahora ?? new Date();
  const hoyLocal = fechaLocalSat(ahora);
  const maximo = sumarDias(hoyLocal, -1);
  const periodo = ((): PeriodoSat => {
    const p = String(args.periodo ?? "mes_actual");
    return p === "30d" || p === "ejercicio" || p === "personalizado" ? p : "mes_actual";
  })();

  const invalido = (motivo: string, accion?: string): RangoSatInvalido => ({
    ok: false,
    periodo,
    codigo: "rango_sat_invalido",
    motivo,
    accion: accion ?? `Selecciona un periodo que termine como máximo en ${maximo}.`,
    maximo,
    hoyLocal,
  });

  const valido = (desde: string, hasta: string): RangoSat =>
    ({ ok: true, periodo, desde, hasta, maximo, hoyLocal });

  if (periodo === "personalizado") {
    const d = String(args.fechaDesde ?? "").trim();
    const h = String(args.fechaHasta ?? "").trim();
    if (!FECHA_RE.test(d) || !FECHA_RE.test(h)) {
      return invalido("Captura ambas fechas del periodo personalizado con formato AAAA-MM-DD.");
    }
    if (d > h) {
      return invalido(
        "La fecha inicial no puede ser posterior a la fecha final.",
        "Invierte las fechas: la inicial debe ser anterior o igual a la final.",
      );
    }
    if (h > maximo) {
      return invalido(
        `La fecha final ${h} aún no es un día completo en ${ETIQUETA_ZONA_SAT}; el SAT rechaza periodos que terminan en el futuro (código 301).`,
        `Selecciona un periodo que termine como máximo en ${maximo}.`,
      );
    }
    return valido(d, h);
  }

  if (periodo === "30d") {
    return valido(sumarDias(maximo, -29), maximo);
  }

  if (periodo === "ejercicio") {
    const inicio = `${hoyLocal.slice(0, 4)}-01-01`;
    if (maximo < inicio) {
      return invalido(
        "Todavía no existe un día completo de este ejercicio para descargar.",
        "Elige un periodo personalizado dentro del ejercicio anterior.",
      );
    }
    return valido(inicio, maximo);
  }

  // mes_actual
  const inicioMes = `${hoyLocal.slice(0, 7)}-01`;
  if (maximo < inicioMes) {
    return invalido(
      "Todavía no existe un día completo de este mes para descargar.",
      "Elige un periodo personalizado dentro del mes anterior.",
    );
  }
  return valido(inicioMes, maximo);
}
