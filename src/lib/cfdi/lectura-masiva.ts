// Lógica pura del Lector Masivo de XML: cálculo de impuestos, clasificación
// ingreso/gasto respecto al RFC activo y límites de seguridad al leer ZIP.
// Sin dependencias de React ni de Supabase (JSZip se usa sólo como utilería
// de bajo nivel para leer archivos comprimidos, no acopla a infraestructura).

import JSZip from "jszip";
import type { CfdiParsed } from "@/lib/tools/cfdi-parser";

// ---------------------------------------------------------------------------
// Estatus ante el SAT
// ---------------------------------------------------------------------------

/**
 * Un CFDI recién leído de un XML NUNCA debe mostrarse como "Vigente" sólo
 * porque tiene UUID: eso sólo lo determina una consulta oficial al SAT
 * (Verificación de CFDI). Mientras no haya esa evidencia, el estatus debe
 * quedar como "No verificado ante SAT".
 */
export const ESTADO_NO_VERIFICADO = "No verificado ante SAT" as const;
export const ESTADO_VIGENTE = "Vigente" as const;
export const ESTADO_CANCELADO = "Cancelado" as const;

export type EstadoCfdi = typeof ESTADO_NO_VERIFICADO | typeof ESTADO_VIGENTE | typeof ESTADO_CANCELADO;

/** Evidencia oficial de estatus (por ejemplo, respuesta del webservice de verificación del SAT). */
export type EvidenciaEstatusSat = "vigente" | "cancelado" | undefined | null;

/**
 * Determina el estatus a mostrar. Sin evidencia oficial (que este flujo de
 * lectura local de XML nunca tiene) siempre regresa "No verificado ante SAT".
 */
export function determinarEstado(evidencia?: EvidenciaEstatusSat): EstadoCfdi {
  if (evidencia === "vigente") return ESTADO_VIGENTE;
  if (evidencia === "cancelado") return ESTADO_CANCELADO;
  return ESTADO_NO_VERIFICADO;
}

// ---------------------------------------------------------------------------
// Impuestos: separar IVA (002) de IEPS (003), otros trasladados y retenciones
// ---------------------------------------------------------------------------

export type DesgloseImpuestos = {
  iva: number;
  ieps: number;
  otrosTrasladados: number;
  isrRetenido: number;
  ivaRetenido: number;
  otrosRetenidos: number;
};

function desgloseVacio(): DesgloseImpuestos {
  return { iva: 0, ieps: 0, otrosTrasladados: 0, isrRetenido: 0, ivaRetenido: 0, otrosRetenidos: 0 };
}

function sumarDesglose(a: DesgloseImpuestos, b: DesgloseImpuestos): DesgloseImpuestos {
  return {
    iva: a.iva + b.iva,
    ieps: a.ieps + b.ieps,
    otrosTrasladados: a.otrosTrasladados + b.otrosTrasladados,
    isrRetenido: a.isrRetenido + b.isrRetenido,
    ivaRetenido: a.ivaRetenido + b.ivaRetenido,
    otrosRetenidos: a.otrosRetenidos + b.otrosRetenidos,
  };
}

function attrVal(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m?.[1];
}

function numVal(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Códigos de impuesto del catálogo del SAT (c_Impuesto). */
const CODIGO_ISR = "001";
const CODIGO_IVA = "002";
const CODIGO_IEPS = "003";

/** Suma los nodos Traslado/Retencion (self-closed o con contenido) de un fragmento de XML. */
function extraerDesglose(xmlFragment: string): DesgloseImpuestos {
  const out = desgloseVacio();
  const traslados = xmlFragment.match(/<(?:\w+:)?Traslado\b[^>]*\/?>/g) ?? [];
  for (const tag of traslados) {
    const impuesto = attrVal(tag, "Impuesto");
    const importe = numVal(attrVal(tag, "Importe"));
    if (impuesto === CODIGO_IVA) out.iva += importe;
    else if (impuesto === CODIGO_IEPS) out.ieps += importe;
    else out.otrosTrasladados += importe;
  }
  const retenciones = xmlFragment.match(/<(?:\w+:)?Retencion\b[^>]*\/?>/g) ?? [];
  for (const tag of retenciones) {
    const impuesto = attrVal(tag, "Impuesto");
    const importe = numVal(attrVal(tag, "Importe"));
    if (impuesto === CODIGO_ISR) out.isrRetenido += importe;
    else if (impuesto === CODIGO_IVA) out.ivaRetenido += importe;
    else out.otrosRetenidos += importe;
  }
  return out;
}

/** Separa el bloque de Conceptos (impuestos por concepto) del resto del comprobante (impuestos globales). */
function separarConceptosDelResto(xml: string): { conceptosXml: string; restoXml: string } {
  const m = xml.match(/<(?:\w+:)?Conceptos\b[^>]*>[\s\S]*?<\/(?:\w+:)?Conceptos>/);
  if (!m) return { conceptosXml: "", restoXml: xml };
  return { conceptosXml: m[0], restoXml: xml.slice(0, m.index) + xml.slice((m.index ?? 0) + m[0].length) };
}

export type ImpuestosCfdi = {
  /** Impuestos declarados a nivel Comprobante (el resumen que trae el CFDI). */
  comprobante: DesgloseImpuestos;
  /** Suma de impuestos declarados dentro de cada Concepto (informativo/validación). */
  conceptos: DesgloseImpuestos;
};

/** Calcula el desglose de impuestos (IVA/IEPS/otros trasladados y retenciones) a nivel comprobante y por conceptos. */
export function calcularImpuestos(xml: string): ImpuestosCfdi {
  const { conceptosXml, restoXml } = separarConceptosDelResto(xml);
  return {
    comprobante: extraerDesglose(restoXml),
    conceptos: extraerDesglose(conceptosXml),
  };
}

// ---------------------------------------------------------------------------
// Clasificación por perspectiva del RFC activo
// ---------------------------------------------------------------------------

export type DireccionCfdi =
  | "ingreso"
  | "gasto"
  | "nota_credito_ingreso" // tipo E emitido por el RFC activo: reduce un ingreso
  | "nota_credito_gasto" // tipo E recibido por el RFC activo: reduce un gasto
  | "nomina"
  | "pago"
  | "otro";

export function clasificarDireccion(args: {
  tipo?: string;
  rfcEmisor?: string;
  rfcReceptor?: string;
  rfcActivo: string;
}): DireccionCfdi {
  const tipo = (args.tipo ?? "").toUpperCase();
  const emisor = (args.rfcEmisor ?? "").toUpperCase();
  const receptor = (args.rfcReceptor ?? "").toUpperCase();
  const activo = args.rfcActivo.toUpperCase();

  if (tipo === "N") return "nomina";
  if (tipo === "P") return "pago";
  if (tipo === "E") {
    if (emisor === activo) return "nota_credito_ingreso";
    if (receptor === activo) return "nota_credito_gasto";
    return "otro";
  }
  if (tipo === "I") {
    if (emisor === activo) return "ingreso";
    if (receptor === activo) return "gasto";
    return "otro";
  }
  return "otro";
}

// ---------------------------------------------------------------------------
// Fila procesada (parseo + impuestos + clasificación + estatus)
// ---------------------------------------------------------------------------

export type FilaLecturaMasiva = {
  archivo: string;
  uuid?: string;
  fecha?: string;
  rfcEmisor?: string;
  nombreEmisor?: string;
  rfcReceptor?: string;
  nombreReceptor?: string;
  tipo?: string;
  metodoPago?: string;
  formaPago?: string;
  usoCfdi?: string;
  moneda?: string;
  subtotal?: number;
  total?: number;
  impuestos: ImpuestosCfdi;
  relacionados: CfdiParsed["relacionados"];
  direccion: DireccionCfdi;
  estado: EstadoCfdi;
  warnings: string[];
};

/** Construye la fila de negocio a partir de un CFDI ya parseado y del XML crudo (para el desglose de impuestos). */
export function construirFila(args: {
  filename: string;
  xml: string;
  parsed: CfdiParsed;
  rfcActivo: string;
  evidenciaEstatus?: EvidenciaEstatusSat;
}): FilaLecturaMasiva {
  const { filename, xml, parsed, rfcActivo, evidenciaEstatus } = args;
  return {
    archivo: filename,
    uuid: parsed.uuid,
    fecha: parsed.fecha,
    rfcEmisor: parsed.emisor.rfc,
    nombreEmisor: parsed.emisor.nombre,
    rfcReceptor: parsed.receptor.rfc,
    nombreReceptor: parsed.receptor.nombre,
    tipo: parsed.tipoComprobante,
    metodoPago: parsed.metodoPago,
    formaPago: parsed.formaPago,
    usoCfdi: parsed.receptor.usoCFDI,
    moneda: parsed.moneda,
    subtotal: parsed.subTotal,
    total: parsed.total,
    impuestos: calcularImpuestos(xml),
    relacionados: parsed.relacionados,
    direccion: clasificarDireccion({ tipo: parsed.tipoComprobante, rfcEmisor: parsed.emisor.rfc, rfcReceptor: parsed.receptor.rfc, rfcActivo }),
    estado: determinarEstado(evidenciaEstatus),
    warnings: parsed.warnings,
  };
}

// ---------------------------------------------------------------------------
// Totales agregados respetando la perspectiva del RFC activo
// ---------------------------------------------------------------------------

export type TotalesLecturaMasiva = {
  cantidad: number;
  ingresos: number;
  gastos: number;
  notasCreditoIngreso: number;
  notasCreditoGasto: number;
  ingresosNetos: number;
  gastosNetos: number;
  nominaTotal: number;
  pagosTotal: number;
  otrosTotal: number;
  impuestos: DesgloseImpuestos;
  cancelados: number;
  conAvisos: number;
};

export function calcularTotales(filas: FilaLecturaMasiva[]): TotalesLecturaMasiva {
  const t: TotalesLecturaMasiva = {
    cantidad: filas.length,
    ingresos: 0,
    gastos: 0,
    notasCreditoIngreso: 0,
    notasCreditoGasto: 0,
    ingresosNetos: 0,
    gastosNetos: 0,
    nominaTotal: 0,
    pagosTotal: 0,
    otrosTotal: 0,
    impuestos: desgloseVacio(),
    cancelados: 0,
    conAvisos: 0,
  };
  for (const f of filas) {
    const total = f.total ?? 0;
    switch (f.direccion) {
      case "ingreso":
        t.ingresos += total;
        break;
      case "gasto":
        t.gastos += total;
        break;
      case "nota_credito_ingreso":
        t.notasCreditoIngreso += total;
        break;
      case "nota_credito_gasto":
        t.notasCreditoGasto += total;
        break;
      case "nomina":
        t.nominaTotal += total;
        break;
      case "pago":
        t.pagosTotal += total;
        break;
      default:
        t.otrosTotal += total;
    }
    t.impuestos = sumarDesglose(t.impuestos, f.impuestos.comprobante);
    if (f.estado === ESTADO_CANCELADO) t.cancelados++;
    if (f.warnings.length) t.conAvisos++;
  }
  t.ingresosNetos = t.ingresos - t.notasCreditoIngreso;
  t.gastosNetos = t.gastos - t.notasCreditoGasto;
  return t;
}

// ---------------------------------------------------------------------------
// Límites de seguridad al leer un ZIP
// ---------------------------------------------------------------------------

/** Tamaño máximo aceptado del archivo ZIP subido (200 MB). */
export const ZIP_MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;
/** Cantidad máxima de entradas (archivos+carpetas) dentro del ZIP. */
export const ZIP_MAX_ENTRIES = 20_000;
/** Tamaño máximo total descomprimido de todo el ZIP (1 GB). */
export const ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;
/** Tamaño máximo de un XML individual dentro del ZIP (5 MB). */
export const XML_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
/** Ratio máximo aceptado entre tamaño descomprimido y comprimido de una entrada (protección anti "ZIP bomb"). */
export const ZIP_MAX_COMPRESSION_RATIO = 200;

export type ArchivoIgnorado = { archivo: string; motivo: string };

export type EntradaZip = {
  name: string;
  dir: boolean;
  compressedSize: number;
  uncompressedSize: number;
};

export type ResultadoLimitesZip =
  | { ok: true; entradasValidas: string[]; ignorados: ArchivoIgnorado[] }
  | { ok: false; error: string };

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Aplica los límites de seguridad sobre la lista de entradas ya enumeradas de un ZIP.
 * Rechaza el ZIP completo cuando el riesgo es global (demasiadas entradas o tamaño total
 * descomprimido excesivo); para límites por archivo (tamaño individual o ratio de
 * compresión sospechoso) sólo ignora esa entrada y lo reporta con el motivo.
 */
export function validarLimitesZip(entries: EntradaZip[]): ResultadoLimitesZip {
  if (entries.length > ZIP_MAX_ENTRIES) {
    return {
      ok: false,
      error: `El ZIP tiene ${entries.length.toLocaleString("es-MX")} archivos, más del máximo permitido (${ZIP_MAX_ENTRIES.toLocaleString("es-MX")}). Divide la carga en paquetes más pequeños.`,
    };
  }

  const ignorados: ArchivoIgnorado[] = [];
  const entradasValidas: string[] = [];
  let totalDescomprimido = 0;

  for (const e of entries) {
    if (e.dir) continue;
    if (!/\.xml$/i.test(e.name)) {
      ignorados.push({ archivo: e.name, motivo: "No es un archivo XML." });
      continue;
    }

    totalDescomprimido += e.uncompressedSize;
    if (totalDescomprimido > ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES) {
      return {
        ok: false,
        error: `El contenido descomprimido del ZIP supera el máximo permitido (${mb(ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES)}). Divide la carga en paquetes más pequeños.`,
      };
    }

    if (e.uncompressedSize > XML_MAX_FILE_SIZE_BYTES) {
      ignorados.push({ archivo: e.name, motivo: `El XML pesa más del máximo permitido por archivo (${mb(XML_MAX_FILE_SIZE_BYTES)}).` });
      continue;
    }

    const ratio = e.compressedSize > 0 ? e.uncompressedSize / e.compressedSize : e.uncompressedSize > 0 ? Infinity : 0;
    if (ratio > ZIP_MAX_COMPRESSION_RATIO) {
      ignorados.push({ archivo: e.name, motivo: "Se rechazó por seguridad: ratio de compresión sospechoso de 'ZIP bomb'." });
      continue;
    }

    entradasValidas.push(e.name);
  }

  return { ok: true, entradasValidas, ignorados };
}

export function validarTamanoZip(zipFileSizeBytes: number): string | null {
  if (zipFileSizeBytes > ZIP_MAX_FILE_SIZE_BYTES) {
    return `El archivo ZIP pesa ${mb(zipFileSizeBytes)}, más del máximo permitido (${mb(ZIP_MAX_FILE_SIZE_BYTES)}).`;
  }
  return null;
}

/** Obtiene el tamaño comprimido/descomprimido de una entrada de JSZip (metadatos del ZIP central, sin descomprimir). */
function tamanosEntradaJsZip(entry: unknown): { compressedSize: number; uncompressedSize: number } {
  const data = (entry as { _data?: { compressedSize?: number; uncompressedSize?: number } })._data;
  return { compressedSize: data?.compressedSize ?? 0, uncompressedSize: data?.uncompressedSize ?? 0 };
}

export type ProcesarZipResultado =
  | {
      ok: true;
      archivos: Array<{ name: string; getText: () => Promise<string> }>;
      ignorados: ArchivoIgnorado[];
    }
  | { ok: false; error: string };

/**
 * Carga un ZIP de forma segura: valida tamaño del archivo, número de entradas,
 * tamaño total descomprimido, tamaño por archivo y ratio de compresión antes de
 * exponer los XML que se pueden leer. Nunca descomprime entradas rechazadas.
 */
export async function procesarZipSeguro(file: { size: number; arrayBuffer: () => Promise<ArrayBuffer> }): Promise<ProcesarZipResultado> {
  const errorTamano = validarTamanoZip(file.size);
  if (errorTamano) return { ok: false, error: errorTamano };

  let zip: JSZip;
  try {
    const buf = await file.arrayBuffer();
    zip = await JSZip.loadAsync(buf);
  } catch {
    return { ok: false, error: "El archivo ZIP está dañado o no es un ZIP válido. No se pudo abrir." };
  }

  const entries: EntradaZip[] = [];
  const entryByName = new Map<string, JSZip.JSZipObject>();
  zip.forEach((path, entry) => {
    const sizes = tamanosEntradaJsZip(entry);
    entries.push({ name: path, dir: entry.dir, ...sizes });
    entryByName.set(path, entry);
  });

  const limites = validarLimitesZip(entries);
  if (!limites.ok) return { ok: false, error: limites.error };

  const archivos = limites.entradasValidas.map((name) => {
    const entry = entryByName.get(name)!;
    return { name: name.split("/").pop() || name, getText: () => entry.async("string") };
  });

  return { ok: true, archivos, ignorados: limites.ignorados };
}
