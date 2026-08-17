// ─────────────────────────────────────────────────────────────────────────────
// BLOQUE 2 · Motor canónico de pólizas (PURO, en centavos enteros).
//
// Reglas duras:
//  · Cada CONCEPTO del CFDI resuelve EXACTAMENTE una cuenta vigente. Una póliza
//    puede tener varios conceptos, cada uno como renglón separado.
//  · Impuestos, retenciones y descuentos van en renglones independientes.
//  · Un concepto sin cuenta produce el renglón “POR IDENTIFICAR” y BLOQUEA la
//    póliza: queda borrador, no aprobable ni exportable.
//  · Nada se calcula con decimales de JavaScript: todo entra y sale en centavos.
//  · Devengo (CFDI) y cobro/pago (banco) están separados. Un complemento de
//    pago sólo se contabiliza con conciliación bancaria confirmada por persona.
// ─────────────────────────────────────────────────────────────────────────────

import {
  resolverEvidencia,
  evidencia as construirEvidencia,
  type EvidenciaFlujo,
  type NivelEvidencia,
} from "./evidencia";

export const CUENTA_POR_IDENTIFICAR = "POR IDENTIFICAR";

export type RenglonCanonico = {
  cuenta: string;
  cuenta_nombre: string;
  concepto: string;
  cargo_centavos: number;
  abono_centavos: number;
  cfdi_id?: string | null;
  movimiento_bancario_id?: string | null;
};

export type ConceptoCfdi = {
  numero: number;
  clave_prod_serv: string | null;
  descripcion: string | null;
  importe_centavos: number;
  descuento_centavos: number;
};

export type ResolucionConcepto =
  | { estado: "resuelta"; cuenta: string; cuenta_nombre?: string; regla_id: string; version: number }
  | { estado: "ambigua"; motivo: string }
  | { estado: "sin_regla"; motivo: string };

export type CuentasSistema = {
  clientes: string;
  proveedores: string;
  bancos?: string | null;
  iva_trasladado_cobrado: string;
  iva_trasladado_pendiente: string;
  iva_acreditable_pagado: string;
  iva_acreditable_pendiente: string;
  ieps_trasladado: string;
  iva_retenido: string;
  isr_retenido: string;
  descuentos?: string | null;
};

export type CfdiCanonico = {
  id: string;
  uuid: string;
  tipo_cfdi: string | null;      // I, E, P, N, T
  metodo_pago: string | null;    // PUE | PPD
  fecha: string;
  rfc_emisor: string | null;
  rfc_receptor: string | null;
  total_centavos: number;
  subtotal_centavos: number;
  descuento_centavos: number;
  iva_trasladado_centavos: number;
  ieps_trasladado_centavos: number;
  iva_retenido_centavos: number;
  isr_retenido_centavos: number;
};

export type EvidenciaConciliacion = {
  confirmada: boolean;
  movimiento_bancario_id?: string | null;
  estado?: string | null;
  actor?: string | null;
  fecha?: string | null;
};

export type BorradorCanonico = {
  tipo: "ingreso" | "egreso" | "diario";
  concepto: string;
  renglones: RenglonCanonico[];
  bloqueos: string[];
  conceptos_sin_resolver: number;
  cargos_centavos: number;
  abonos_centavos: number;
  cuadra: boolean;
  /** Nivel de evidencia de cobro/pago que respalda este borrador. */
  evidencia: EvidenciaFlujo;
  /** Evidencias adicionales que refuerzan sin duplicar el reconocimiento. */
  refuerzos: NivelEvidencia[];
  /** Contradicciones detectadas entre las evidencias disponibles. */
  incidencias: string[];
};


const fila = (
  cuenta: string,
  nombre: string,
  concepto: string,
  cargo: number,
  abono: number,
  cfdi_id?: string | null,
): RenglonCanonico => ({
  cuenta,
  cuenta_nombre: nombre,
  concepto,
  cargo_centavos: Math.max(0, Math.trunc(cargo)),
  abono_centavos: Math.max(0, Math.trunc(abono)),
  cfdi_id: cfdi_id ?? null,
});

/**
 * Reparte la base neta entre los conceptos en centavos enteros y ajusta el
 * último renglón con la diferencia de redondeo, para que la suma sea exacta.
 */
export function repartirBase(conceptos: ConceptoCfdi[], baseNetaCentavos: number): number[] {
  const brutos = conceptos.map((c) => Math.max(0, c.importe_centavos - c.descuento_centavos));
  const suma = brutos.reduce((s, n) => s + n, 0);
  if (suma === baseNetaCentavos || brutos.length === 0) return brutos;
  const ajuste = baseNetaCentavos - suma;
  const salida = [...brutos];
  salida[salida.length - 1] = Math.max(0, salida[salida.length - 1] + ajuste);
  return salida;
}

/** Construye el borrador canónico de un CFDI de ingreso o de gasto. */
export function construirBorradorCfdi(params: {
  cfdi: CfdiCanonico;
  esIngreso: boolean;
  conceptos: ConceptoCfdi[];
  resoluciones: Record<number, ResolucionConcepto>;
  cuentas: CuentasSistema;
  conciliacion?: EvidenciaConciliacion | null;
  complemento?: { cfdi_pago_id: string; importe_centavos: number } | null;
  manual?: { actor: string; fecha: string; motivo: string } | null;
}): BorradorCanonico {
  const { cfdi, esIngreso, conceptos, resoluciones, cuentas } = params;
  const bloqueos: string[] = [];
  const renglones: RenglonCanonico[] = [];
  const ppd = (cfdi.metodo_pago ?? "").toUpperCase() === "PPD";
  const etiqueta = `${esIngreso ? "Ingreso" : "Gasto"} CFDI ${cfdi.uuid.slice(0, 8)}`;

  if (cfdi.tipo_cfdi === "P") {
    return construirBorradorComplementoPago(params);
  }

  if (conceptos.length === 0) {
    bloqueos.push("El CFDI no tiene conceptos capturados: no puede contabilizarse sin desglose.");
  }

  const baseNeta = cfdi.subtotal_centavos - cfdi.descuento_centavos;
  const partes = repartirBase(conceptos, baseNeta);
  let sinResolver = 0;

  conceptos.forEach((c, i) => {
    const r = resoluciones[c.numero];
    const monto = partes[i] ?? 0;
    const desc = (c.descripcion ?? "").slice(0, 180) || `Concepto ${c.numero}`;
    if (!r || r.estado !== "resuelta") {
      sinResolver += 1;
      const causa =
        !r ? "sin regla contable vigente"
          : r.estado === "ambigua" ? "reglas ambiguas con la misma prioridad"
          : "sin regla contable vigente";
      bloqueos.push(`Concepto ${c.numero} (${c.clave_prod_serv ?? "sin clave"}): ${causa}.`);
      renglones.push(
        fila(CUENTA_POR_IDENTIFICAR, "Cuenta por identificar", desc,
          esIngreso ? 0 : monto, esIngreso ? monto : 0, cfdi.id),
      );
      return;
    }
    renglones.push(
      fila(r.cuenta, r.cuenta_nombre ?? r.cuenta, desc,
        esIngreso ? 0 : monto, esIngreso ? monto : 0, cfdi.id),
    );
  });

  const ivaTrasCta = ppd ? cuentas.iva_trasladado_pendiente : cuentas.iva_trasladado_cobrado;
  const ivaAcrCta = ppd ? cuentas.iva_acreditable_pendiente : cuentas.iva_acreditable_pagado;

  if (esIngreso) {
    renglones.unshift(
      fila(cuentas.clientes, "Clientes", etiqueta, cfdi.total_centavos, 0, cfdi.id),
    );
    if (cfdi.iva_trasladado_centavos > 0) {
      renglones.push(fila(ivaTrasCta, ppd ? "IVA trasladado pendiente de cobro" : "IVA trasladado cobrado",
        "IVA trasladado", 0, cfdi.iva_trasladado_centavos, cfdi.id));
    }
    if (cfdi.ieps_trasladado_centavos > 0) {
      renglones.push(fila(cuentas.ieps_trasladado, "IEPS trasladado", "IEPS trasladado",
        0, cfdi.ieps_trasladado_centavos, cfdi.id));
    }
    if (cfdi.iva_retenido_centavos > 0) {
      renglones.push(fila(cuentas.iva_retenido, "IVA retenido por terceros", "IVA retenido",
        cfdi.iva_retenido_centavos, 0, cfdi.id));
    }
    if (cfdi.isr_retenido_centavos > 0) {
      renglones.push(fila(cuentas.isr_retenido, "ISR retenido por terceros", "ISR retenido",
        cfdi.isr_retenido_centavos, 0, cfdi.id));
    }
  } else {
    renglones.push(
      fila(cuentas.proveedores, "Proveedores", etiqueta, 0, cfdi.total_centavos, cfdi.id),
    );
    if (cfdi.iva_trasladado_centavos > 0) {
      renglones.push(fila(ivaAcrCta, ppd ? "IVA acreditable pendiente de pago" : "IVA acreditable pagado",
        "IVA acreditable", cfdi.iva_trasladado_centavos, 0, cfdi.id));
    }
    if (cfdi.ieps_trasladado_centavos > 0) {
      renglones.push(fila(cuentas.ieps_trasladado, "IEPS pagado", "IEPS", cfdi.ieps_trasladado_centavos, 0, cfdi.id));
    }
    if (cfdi.iva_retenido_centavos > 0) {
      renglones.push(fila(cuentas.iva_retenido, "IVA retenido por enterar", "IVA retenido",
        0, cfdi.iva_retenido_centavos, cfdi.id));
    }
    if (cfdi.isr_retenido_centavos > 0) {
      renglones.push(fila(cuentas.isr_retenido, "ISR retenido por enterar", "ISR retenido",
        0, cfdi.isr_retenido_centavos, cfdi.id));
    }
  }

  const flujo = resolverEvidencia({
    metodo_pago: cfdi.metodo_pago,
    tipo_cfdi: cfdi.tipo_cfdi,
    complemento: params.complemento ?? null,
    banco_confirmado: params.conciliacion?.confirmada
      ? {
          movimiento_bancario_id: params.conciliacion.movimiento_bancario_id ?? "",
          actor: params.conciliacion.actor ?? null,
          fecha: params.conciliacion.fecha ?? null,
        }
      : null,
    manual: params.manual ?? null,
  });

  return cerrar(renglones, bloqueos, sinResolver, esIngreso ? "ingreso" : "egreso", etiqueta, flujo);
}

/**
 * Complemento de pago: el complemento ES evidencia de flujo por sí mismo
 * (nivel `complemento_pago`). Cuando además existe conciliación bancaria
 * confirmada por una persona, el nivel sube a `banco_confirmado` y el
 * complemento queda como refuerzo — nunca se reconoce el cobro dos veces.
 */
export function construirBorradorComplementoPago(params: {
  cfdi: CfdiCanonico;
  esIngreso: boolean;
  cuentas: CuentasSistema;
  conciliacion?: EvidenciaConciliacion | null;
}): BorradorCanonico {
  const { cfdi, esIngreso, cuentas, conciliacion } = params;
  const etiqueta = `Complemento de pago ${cfdi.uuid.slice(0, 8)}`;
  const bloqueos: string[] = [];

  if (!cuentas.bancos) {
    bloqueos.push("El expediente no tiene una cuenta de bancos asignada en el catálogo.");
  }

  const banco = cuentas.bancos ?? CUENTA_POR_IDENTIFICAR;
  const monto = cfdi.total_centavos;
  const renglones: RenglonCanonico[] = esIngreso
    ? [
        fila(banco, "Bancos", etiqueta, monto, 0, cfdi.id),
        fila(cuentas.clientes, "Clientes", etiqueta, 0, monto, cfdi.id),
      ]
    : [
        fila(cuentas.proveedores, "Proveedores", etiqueta, monto, 0, cfdi.id),
        fila(banco, "Bancos", etiqueta, 0, monto, cfdi.id),
      ];

  if (conciliacion?.movimiento_bancario_id) {
    for (const r of renglones) r.movimiento_bancario_id = conciliacion.movimiento_bancario_id;
  }

  const flujo = resolverEvidencia({
    metodo_pago: cfdi.metodo_pago,
    tipo_cfdi: "P",
    complemento: { cfdi_pago_id: cfdi.id, importe_centavos: monto },
    banco_confirmado: conciliacion?.confirmada
      ? {
          movimiento_bancario_id: conciliacion.movimiento_bancario_id ?? "",
          actor: conciliacion.actor ?? null,
          fecha: conciliacion.fecha ?? null,
        }
      : null,
  });

  return cerrar(renglones, bloqueos, cuentas.bancos ? 0 : 1, "diario", etiqueta, flujo);
}

function cerrar(
  renglones: RenglonCanonico[],
  bloqueos: string[],
  sinResolver: number,
  tipo: "ingreso" | "egreso" | "diario",
  concepto: string,
  flujo: { evidencia: EvidenciaFlujo; refuerzos: NivelEvidencia[]; incidencias: string[] } = {
    evidencia: construirEvidencia("sin_evidencia"),
    refuerzos: [],
    incidencias: [],
  },
): BorradorCanonico {
  const cargos = renglones.reduce((s, r) => s + r.cargo_centavos, 0);
  const abonos = renglones.reduce((s, r) => s + r.abono_centavos, 0);
  const cuadra = cargos === abonos && cargos > 0;
  if (!cuadra) {
    bloqueos.push(`Partida doble rota: cargos ${cargos} ≠ abonos ${abonos} (centavos).`);
  }
  return {
    tipo,
    concepto,
    renglones,
    bloqueos,
    conceptos_sin_resolver: sinResolver,
    cargos_centavos: cargos,
    abonos_centavos: abonos,
    cuadra,
    evidencia: flujo.evidencia,
    refuerzos: flujo.refuerzos,
    incidencias: flujo.incidencias,
  };
}

/**
 * Llave de idempotencia canónica:
 *   expediente + tipo de hecho + identificador de evidencia + versión de reglas
 */
export function llaveIdempotencia(
  tipoHecho: "cfdi" | "pago" | "banco" | "manual",
  evidenciaId: string,
  versionReglas: string,
): string {
  return `b2:${tipoHecho}:${evidenciaId}:${versionReglas}`;
}
