// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZACIÓN FISCAL DEL CFDI
//
// Servicio PURO. Recibe el XML y devuelve la estructura de detalle que el resto
// del sistema consumirá: impuestos por concepto y a nivel comprobante, y el
// complemento de pagos 2.0 completo (Pago → DoctoRelacionado → ImpuestosDR).
//
// No consulta la base, no llama al SAT, no usa IA. Reutiliza `parseCfdi` para
// el encabezado: aquí NO se duplica ese parser.
// ─────────────────────────────────────────────────────────────────────────────

import { parseCfdi, type CfdiParsed } from "@/lib/tools/cfdi-parser";
import { elemento, elementos, entero, numero, sinBloques } from "./xml-elementos";

/** Versión del normalizador. Cambia cuando cambia el detalle extraído. */
export const NORMALIZACION_VERSION = "cfdi-normalizacion-2026.08.09.1";

export type TipoImpuesto = "traslado" | "retencion";

export type ImpuestoDetalle = {
  nivel: "concepto" | "comprobante";
  concepto_numero: number | null;
  tipo: TipoImpuesto;
  /** Clave SAT: 001 ISR, 002 IVA, 003 IEPS. */
  impuesto: string;
  impuesto_nombre: string;
  base: number | null;
  tipo_factor: string | null;
  tasa_cuota: number | null;
  importe: number | null;
};

export type PagoImpuesto = {
  ambito: "P" | "DR";
  /** Índice del DoctoRelacionado dentro del pago (sólo ámbito DR). */
  documento_indice: number | null;
  tipo: TipoImpuesto;
  impuesto: string;
  base: number | null;
  tipo_factor: string | null;
  tasa_cuota: number | null;
  importe: number | null;
};

export type PagoDocumento = {
  indice: number;
  id_documento: string;
  serie: string | null;
  folio: string | null;
  moneda_dr: string | null;
  equivalencia_dr: number | null;
  num_parcialidad: number | null;
  imp_saldo_ant: number | null;
  imp_pagado: number | null;
  imp_saldo_insoluto: number | null;
  objeto_imp_dr: string | null;
};

export type PagoNormalizado = {
  numero_pago: number;
  fecha_pago: string | null;
  forma_pago_p: string | null;
  moneda_p: string | null;
  tipo_cambio_p: number | null;
  monto: number | null;
  num_operacion: string | null;
  documentos: PagoDocumento[];
  impuestos: PagoImpuesto[];
};

export type CfdiNormalizado = {
  encabezado: CfdiParsed;
  impuestos: ImpuestoDetalle[];
  pagos: PagoNormalizado[];
  /** Avisos de normalización (no bloquean la ingestión). */
  avisos: string[];
  version: string;
};

export const NOMBRE_IMPUESTO: Record<string, string> = {
  "001": "ISR",
  "002": "IVA",
  "003": "IEPS",
};

export function nombreImpuesto(clave: string | undefined | null): string {
  if (!clave) return "OTRO";
  return NOMBRE_IMPUESTO[clave] ?? `OTRO(${clave})`;
}

function impuestosDe(
  bloque: string,
  nivel: "concepto" | "comprobante",
  conceptoNumero: number | null,
): ImpuestoDetalle[] {
  const out: ImpuestoDetalle[] = [];
  const push = (tipo: TipoImpuesto, attrs: Record<string, string>) => {
    const clave = attrs["Impuesto"] ?? "";
    out.push({
      nivel,
      concepto_numero: conceptoNumero,
      tipo,
      impuesto: clave,
      impuesto_nombre: nombreImpuesto(clave),
      base: numero(attrs["Base"]) ?? null,
      tipo_factor: attrs["TipoFactor"] ?? null,
      tasa_cuota: numero(attrs["TasaOCuota"]) ?? null,
      importe: numero(attrs["Importe"]) ?? null,
    });
  };
  for (const t of elementos(bloque, "Traslado")) push("traslado", t.attrs);
  for (const r of elementos(bloque, "Retencion")) push("retencion", r.attrs);
  return out;
}

function impuestosPago(
  bloque: string,
  ambito: "P" | "DR",
  documentoIndice: number | null,
): PagoImpuesto[] {
  const suf = ambito;
  const out: PagoImpuesto[] = [];
  const push = (tipo: TipoImpuesto, attrs: Record<string, string>) => {
    out.push({
      ambito,
      documento_indice: documentoIndice,
      tipo,
      impuesto: attrs[`Impuesto${suf}`] ?? attrs["Impuesto"] ?? "",
      base: numero(attrs[`Base${suf}`] ?? attrs["Base"]) ?? null,
      tipo_factor: attrs[`TipoFactor${suf}`] ?? attrs["TipoFactor"] ?? null,
      tasa_cuota: numero(attrs[`TasaOCuota${suf}`] ?? attrs["TasaOCuota"]) ?? null,
      importe: numero(attrs[`Importe${suf}`] ?? attrs["Importe"]) ?? null,
    });
  };
  for (const t of elementos(bloque, `Traslado${suf}`)) push("traslado", t.attrs);
  for (const r of elementos(bloque, `Retencion${suf}`)) push("retencion", r.attrs);
  return out;
}

/** Normaliza un CFDI 4.0 completo. Nunca lanza por complementos faltantes. */
export function normalizarCfdi(xml: string): CfdiNormalizado {
  const encabezado = parseCfdi(xml);
  const avisos: string[] = [...encabezado.warnings];

  const comprobante = elemento(xml, "Comprobante");
  const cuerpo = comprobante?.inner ?? xml;

  // ── Impuestos por concepto ────────────────────────────────────────────────
  const impuestos: ImpuestoDetalle[] = [];
  const conceptos = elementos(cuerpo, "Concepto");
  conceptos.forEach((c, i) => {
    const bloque = elemento(c.inner, "Impuestos");
    if (bloque) impuestos.push(...impuestosDe(bloque.inner, "concepto", i + 1));
  });

  // ── Impuestos a nivel comprobante (excluye los de conceptos y el pago) ────
  const resto = sinBloques(sinBloques(cuerpo, "Conceptos"), "Complemento");
  const globales = elemento(resto, "Impuestos");
  if (globales) impuestos.push(...impuestosDe(globales.inner, "comprobante", null));
  if (!impuestos.length && (encabezado.impuestos.totalTrasladados || encabezado.impuestos.totalRetenidos)) {
    avisos.push("El comprobante declara totales de impuestos pero no se encontró el desglose por traslado/retención.");
  }

  // ── Complemento de pagos 2.0 ──────────────────────────────────────────────
  const pagos: PagoNormalizado[] = [];
  const bloquePagos = elemento(xml, "Pagos");
  if (bloquePagos) {
    elementos(bloquePagos.inner, "Pago").forEach((p, i) => {
      const docs: PagoDocumento[] = [];
      const impsPago: PagoImpuesto[] = [];
      elementos(p.inner, "DoctoRelacionado").forEach((d, j) => {
        docs.push({
          indice: j,
          id_documento: String(d.attrs["IdDocumento"] ?? "").trim().toUpperCase(),
          serie: d.attrs["Serie"] ?? null,
          folio: d.attrs["Folio"] ?? null,
          moneda_dr: d.attrs["MonedaDR"] ?? null,
          equivalencia_dr: numero(d.attrs["EquivalenciaDR"]) ?? null,
          num_parcialidad: entero(d.attrs["NumParcialidad"]) ?? null,
          imp_saldo_ant: numero(d.attrs["ImpSaldoAnt"]) ?? null,
          imp_pagado: numero(d.attrs["ImpPagado"]) ?? null,
          imp_saldo_insoluto: numero(d.attrs["ImpSaldoInsoluto"]) ?? null,
          objeto_imp_dr: d.attrs["ObjetoImpDR"] ?? null,
        });
        const bloqueDR = elemento(d.inner, "ImpuestosDR");
        if (bloqueDR) impsPago.push(...impuestosPago(bloqueDR.inner, "DR", j));
      });
      // ImpuestosP: los del pago, no los de sus documentos relacionados.
      const restoPago = sinBloques(p.inner, "DoctoRelacionado");
      const bloqueP = elemento(restoPago, "ImpuestosP");
      if (bloqueP) impsPago.push(...impuestosPago(bloqueP.inner, "P", null));

      if (!docs.length) avisos.push(`Pago ${i + 1}: complemento sin documentos relacionados.`);

      pagos.push({
        numero_pago: i + 1,
        fecha_pago: p.attrs["FechaPago"] ?? null,
        forma_pago_p: p.attrs["FormaDePagoP"] ?? null,
        moneda_p: p.attrs["MonedaP"] ?? null,
        tipo_cambio_p: numero(p.attrs["TipoCambioP"]) ?? null,
        monto: numero(p.attrs["Monto"]) ?? null,
        num_operacion: p.attrs["NumOperacion"] ?? null,
        documentos: docs,
        impuestos: impsPago,
      });
    });
  } else if (encabezado.tipoComprobante === "P") {
    avisos.push("CFDI tipo P sin complemento de pagos 2.0 legible.");
  }

  return { encabezado, impuestos, pagos, avisos, version: NORMALIZACION_VERSION };
}
