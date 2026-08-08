// =====================================================================
// Linaje y trazabilidad de la Descarga Masiva SAT.
//
// Módulo PURO: sin red, sin base de datos. Define
//   - la clasificación de un CFDI dentro del expediente,
//   - el enmascarado de identificadores sensibles,
//   - la separación entre errores de CREDENCIAL y errores de CORRIDA,
//   - la decisión ÚNICA de si un error admite reintento.
// Servidor y UI comparten estas funciones: no puede haber dos criterios.
// =====================================================================

import { semanticaCodigo } from "./maquina-estados";

// ---------------------------------------------------------------------
// Clasificación contable del comprobante
// ---------------------------------------------------------------------

export type ClasificacionCfdi = "ingreso" | "gasto" | "nomina" | "pago" | "egreso" | "traslado" | "otro";

export function clasificarCfdi(args: {
  tipo_cfdi?: string | null;
  rfc_emisor?: string | null;
  rfc_receptor?: string | null;
  rfc_expediente?: string | null;
}): ClasificacionCfdi {
  const t = String(args.tipo_cfdi ?? "").toUpperCase();
  const rfc = String(args.rfc_expediente ?? "").toUpperCase();
  const emisor = String(args.rfc_emisor ?? "").toUpperCase();
  if (t === "N") return "nomina";
  if (t === "P") return "pago";
  if (t === "T") return "traslado";
  if (t === "E") return "egreso";
  if (t === "I") {
    if (!rfc) return "otro";
    return emisor === rfc ? "ingreso" : "gasto";
  }
  return "otro";
}

export const CLASIFICACION_LABEL: Record<ClasificacionCfdi, string> = {
  ingreso: "Ingreso",
  gasto: "Gasto",
  nomina: "Nómina",
  pago: "Complemento de pago",
  egreso: "Egreso (nota de crédito)",
  traslado: "Traslado",
  otro: "Otro",
};

// ---------------------------------------------------------------------
// Enmascarado (nunca se publica el identificador completo por omisión)
// ---------------------------------------------------------------------

export function enmascararUuid(uuid?: string | null): string {
  const v = String(uuid ?? "").trim();
  if (v.length < 12) return v || "—";
  return `${v.slice(0, 8)}…${v.slice(-4)}`;
}

export function enmascararRfc(rfc?: string | null): string {
  const v = String(rfc ?? "").trim().toUpperCase();
  if (v.length < 8) return v || "—";
  return `${v.slice(0, 4)}${"•".repeat(Math.max(0, v.length - 7))}${v.slice(-3)}`;
}

/** Referencia saneada de un paquete: nunca revela el token de descarga. */
export function paqueteSaneado(idPaquete?: string | null): string {
  const v = String(idPaquete ?? "").trim();
  if (!v) return "—";
  return v.length <= 16 ? v : `${v.slice(0, 12)}…${v.slice(-4)}`;
}

// ---------------------------------------------------------------------
// Errores de CREDENCIAL vs errores de CORRIDA
// ---------------------------------------------------------------------

/**
 * Sólo estos motivos pertenecen a la e.firma. Cualquier otro (rechazo 301,
 * error de paquete, de cosecha, de XML, de cuota o de transporte) es un error
 * de la CORRIDA y no puede presentarse como error del certificado.
 */
const PATRONES_CREDENCIAL: RegExp[] = [
  /vencid[ao]/i,
  /caduc/i,
  /revocad/i,
  /no se pudo (abrir|descifrar)/i,
  /descifrar/i,
  /contraseñ/i,
  /rfc .*(no coincide|incompatible|distinto)/i,
  /certificado .*(inválido|invalido|no corresponde)/i,
  /llave .*(inválida|invalida|no corresponde)/i,
  /e\.firma .*(inválida|invalida|no corresponde)/i,
  /sin e\.firma/i,
];

/** Motivos que SIEMPRE pertenecen a una corrida, aunque mencionen la e.firma. */
const PATRONES_CORRIDA: RegExp[] = [
  /\b3\d\d\b/,
  /\b50\d\d\b/,
  /xml mal formado/i,
  /paquete/i,
  /cosech/i,
  /solicitud/i,
  /descarga/i,
  /SAT \d{3}/i,
  /verifying security/i,
  /frecuencia/i,
  /plan permite/i,
  /PAC/i,
];

export function esErrorDeCredencial(mensaje?: string | null): boolean {
  const m = String(mensaje ?? "").trim();
  if (!m) return false;
  if (PATRONES_CORRIDA.some((re) => re.test(m))) return false;
  return PATRONES_CREDENCIAL.some((re) => re.test(m));
}

/** Mensaje que puede mostrar la tarjeta de e.firma; null si no le pertenece. */
export function errorVisibleCredencial(mensaje?: string | null): string | null {
  return esErrorDeCredencial(mensaje) ? String(mensaje) : null;
}

// ---------------------------------------------------------------------
// Reintentos: decisión ÚNICA (servidor y UI)
// ---------------------------------------------------------------------

/** ¿El código del SAT admite reintentar la MISMA solicitud? */
export function esReintentable(codigo?: string | null): boolean {
  const c = String(codigo ?? "").trim();
  if (!c) return false;
  const sem = semanticaCodigo(c);
  if (sem.terminal) return false;
  return sem.reintentable;
}

export type CorridaMinima = {
  estado?: string | null;
  solicitudes?: unknown;
};

/**
 * ¿Puede ofrecerse "Reintentar" para esta corrida?
 * Sólo si está detenida y alguna solicitud tiene folio vivo con código
 * reintentable. Un rechazo terminal (familia 3xx) exige corrida nueva.
 */
export function corridaReintentable(run: CorridaMinima): boolean {
  const estado = String(run?.estado ?? "");
  if (!["error", "parcial", "vencida"].includes(estado)) return false;
  const sols: any[] = Array.isArray(run?.solicitudes) ? (run!.solicitudes as any[]) : [];
  if (sols.some((s) => semanticaCodigo(String(s?.codigo ?? "")).terminal)) return false;
  return sols.some((s) => !!s?.id_solicitud && esReintentable(String(s?.codigo ?? "")));
}

/** Explicación de por qué no se ofrece reintento. */
export function motivoSinReintento(run: CorridaMinima): string {
  const sols: any[] = Array.isArray(run?.solicitudes) ? (run!.solicitudes as any[]) : [];
  const terminal = sols.find((s) => semanticaCodigo(String(s?.codigo ?? "")).terminal);
  if (terminal) {
    return `El SAT rechazó la solicitud (${terminal.codigo}). Reintentar enviaría exactamente el mismo error: corrige la configuración y crea una corrida nueva.`;
  }
  return "Esta corrida no tiene solicitudes vivas en el SAT. Crea una corrida nueva.";
}

// ---------------------------------------------------------------------
// Recálculos posteriores
// ---------------------------------------------------------------------

export const MODULOS_RECALCULO = [
  "salud_fiscal",
  "riesgo_sat",
  "auditor_cfdi",
  "efos",
] as const;

export type ModuloRecalculo = (typeof MODULOS_RECALCULO)[number];

export const MODULO_LABEL: Record<string, string> = {
  salud_fiscal: "Salud Fiscal",
  riesgo_sat: "Riesgo SAT",
  auditor_cfdi: "Validador / Auditor CFDI",
  efos: "EFOS / 69-B",
  conciliacion: "Conciliación",
  reporte_ejecutivo: "Reporte Ejecutivo",
  contabilidad_auto: "Contabilidad automática",
};

/**
 * Una corrida con comprobantes nuevos NO puede cerrarse como `completada`
 * sin haber pasado por `recalculando`: la trazabilidad exige un evento real.
 */
export function requiereRecalculo(resumen: { estado: string; xml_nuevos: number }): boolean {
  return resumen.estado === "completada" && (resumen.xml_nuevos ?? 0) > 0;
}
