// =====================================================================
// Periodo efectivo de una solicitud de Descarga Masiva SAT.
//
// Módulo puro (sin red, sin base de datos). Existe porque una fecha
// "AAAA-MM-DD" en la interfaz NO es lo que viaja al SAT: el servicio
// recibe una fecha-hora local del centro de México, y el filtro que el
// SAT aplica NO es el mismo para emitidos que para recibidos.
//
// Hallazgo real (corrida 4f8c05ce, 2026-07-29 → 2026-08-01):
// el comprobante BCDD4B19 tiene fecha de emisión 2026-08-01 23:26:04
// (hora del centro) pero fecha de certificación 2026-08-02 03:15:29.
// Como recibidos se filtra por certificación, quedó FUERA de esa corrida
// y apareció en la siguiente (2026-08-01 → 2026-08-03). No hubo pérdida
// ni error de límites: el límite superior sí fue 23:59:59 inclusivo.
// =====================================================================

export type DireccionPeriodo = "emitidos" | "recibidos";

/** Zona en la que el SAT interpreta FechaInicial y FechaFinal. */
export const ZONA_SAT = "America/Mexico_City";
export const ETIQUETA_ZONA_SAT = "hora del centro de México";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Criterio temporal REAL que aplica el SAT en cada dirección.
 * Se muestra al usuario para que el resultado nunca parezca arbitrario.
 */
export function criterioTemporal(direccion: DireccionPeriodo): string {
  return direccion === "emitidos"
    ? "fecha de emisión del comprobante"
    : "fecha de certificación (timbrado), no la fecha de emisión";
}

export function notaCriterio(direccion: DireccionPeriodo): string {
  return direccion === "emitidos"
    ? "Emitidos: el SAT filtra por fecha de emisión del comprobante."
    : "Recibidos: el SAT filtra por fecha de certificación (timbrado). Un comprobante emitido el último día del periodo pero timbrado al día siguiente aparecerá en el periodo siguiente, no en éste.";
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
 * Explica por qué un comprobante concreto entró o no entró en el periodo,
 * distinguiendo emisión de certificación. Sirve para auditoría honesta.
 */
export function explicarInclusion(args: {
  direccion: DireccionPeriodo;
  desde: string;
  hasta: string;
  emision: Date | string;
  certificacion?: Date | string | null;
}): { incluido: boolean; criterio: string; instante: string; motivo: string } {
  const usaCertificacion = args.direccion === "recibidos" && !!args.certificacion;
  const base = usaCertificacion ? args.certificacion! : args.emision;
  const fecha = base instanceof Date ? base : new Date(base);
  const instante = Number.isNaN(fecha.getTime()) ? "—" : fechaHoraLocalSat(fecha);
  const incluido = dentroDelPeriodo(fecha, args.desde, args.hasta);
  const criterio = criterioTemporal(args.direccion);
  return {
    incluido,
    criterio,
    instante,
    motivo: incluido
      ? `Su ${criterio} (${instante}, ${ETIQUETA_ZONA_SAT}) cae dentro del periodo solicitado.`
      : `Su ${criterio} (${instante}, ${ETIQUETA_ZONA_SAT}) queda fuera del periodo solicitado. No se perdió: corresponde a otro periodo.`,
  };
}
