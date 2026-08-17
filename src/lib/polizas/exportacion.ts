// ─────────────────────────────────────────────────────────────────────────────
// BLOQUE 2 · Contrato interno CANÓNICO de exportación.
//
// Lee EXCLUSIVAMENTE pólizas aprobadas y sus renglones canónicos
// (`poliza_renglones`). `metadata.asientos` es formato legado de sólo lectura y
// NUNCA alimenta este contrato.
//
// Este bloque no incluye conexión real con CONTPAQi ni Siigo: sólo deja el
// contrato y su llave de idempotencia listos para construir los adaptadores.
// ─────────────────────────────────────────────────────────────────────────────

export type RenglonExportable = {
  numero: number;
  cuenta: string;
  cuenta_nombre: string | null;
  concepto: string | null;
  cargo_centavos: number;
  abono_centavos: number;
  cfdi_id: string | null;
  movimiento_bancario_id: string | null;
};

export type PolizaExportable = {
  id: string;
  version: number;
  periodo: string;
  fecha: string;
  tipo: string;
  numero: string;
  concepto: string;
  moneda: string;
  referencia: string | null;
  uuid_cfdi: string | null;
  contraparte_rfc: string | null;
  centro_costos: string | null;
  renglones: RenglonExportable[];
  impuestos_centavos: { iva_trasladado: number; iva_acreditable: number; retenciones: number };
  total_centavos: number;
  huella: string;
  idempotency_key: string;
  aprobada_por: string | null;
  aprobada_at: string | null;
};

export type LotePolizasExportable = {
  cliente_id: string;
  rfc: string;
  periodo: string;
  generado_at: string;
  polizas: PolizaExportable[];
  total_centavos: number;
  advertencias: string[];
};

const CUENTAS_IVA_TRASLADADO = /^(208|209)/;
const CUENTAS_IVA_ACREDITABLE = /^(113|118\.01|118-01)/;
const CUENTAS_RETENCION = /^(216|120)/;

/** Normaliza una fila de base de datos al contrato canónico de exportación. */
export function aPolizaExportable(row: any, indice: number): PolizaExportable {
  const renglones: RenglonExportable[] = [...(row.poliza_renglones ?? [])]
    .sort((a: any, b: any) => (a.numero ?? 0) - (b.numero ?? 0))
    .map((r: any) => ({
      numero: r.numero ?? 0,
      cuenta: String(r.cuenta ?? ""),
      cuenta_nombre: r.cuenta_nombre ?? null,
      concepto: r.concepto ?? null,
      cargo_centavos: Number(r.cargo_centavos ?? 0),
      abono_centavos: Number(r.abono_centavos ?? 0),
      cfdi_id: r.cfdi_id ?? null,
      movimiento_bancario_id: r.movimiento_bancario_id ?? null,
    }));

  const total = renglones.reduce((s, r) => s + r.cargo_centavos, 0);
  const sumar = (re: RegExp) =>
    renglones
      .filter((r) => re.test(r.cuenta))
      .reduce((s, r) => s + r.cargo_centavos + r.abono_centavos, 0);

  return {
    id: row.id,
    version: Number(row.version ?? 1),
    periodo: String(row.periodo ?? ""),
    fecha: String(row.fecha ?? "").slice(0, 10),
    tipo: String(row.tipo ?? "diario"),
    numero: String(indice + 1).padStart(5, "0"),
    concepto: String(row.concepto ?? ""),
    moneda: "MXN",
    referencia: row.referencia ?? null,
    uuid_cfdi: row.uuid_cfdi ?? null,
    contraparte_rfc: row.contraparte_rfc ?? null,
    centro_costos: row.centro_costos ?? null,
    renglones,
    impuestos_centavos: {
      iva_trasladado: sumar(CUENTAS_IVA_TRASLADADO),
      iva_acreditable: sumar(CUENTAS_IVA_ACREDITABLE),
      retenciones: sumar(CUENTAS_RETENCION),
    },
    total_centavos: total,
    huella: String(row.input_hash ?? ""),
    idempotency_key: String(row.idempotency_key ?? ""),
    aprobada_por: row.aprobada_por ?? null,
    aprobada_at: row.aprobada_at ?? null,
  };
}

/** Valida el lote antes de entregarlo a cualquier adaptador externo. */
export function validarLote(lote: LotePolizasExportable): string[] {
  const problemas: string[] = [];
  for (const p of lote.polizas) {
    const cargos = p.renglones.reduce((s, r) => s + r.cargo_centavos, 0);
    const abonos = p.renglones.reduce((s, r) => s + r.abono_centavos, 0);
    if (cargos !== abonos) problemas.push(`Póliza ${p.numero}: cargos ${cargos} ≠ abonos ${abonos}.`);
    if (p.renglones.length < 2) problemas.push(`Póliza ${p.numero}: menos de dos renglones.`);
    if (p.renglones.some((r) => /por identificar/i.test(r.cuenta))) {
      problemas.push(`Póliza ${p.numero}: contiene una cuenta por identificar.`);
    }
  }
  return problemas;
}
