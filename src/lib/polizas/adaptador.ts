// ─────────────────────────────────────────────────────────────────────────────
// BLOQUE 2 · Adaptador de LECTURA para consumidores históricos.
//
// Los exportadores (CONTPAQi, Anexo 24, balanza, ZIP del expediente) fueron
// escritos contra el formato legado `metadata.asientos`. Este adaptador los
// alimenta EXCLUSIVAMENTE desde `poliza_renglones`, la fuente contable única,
// para que ningún reporte vuelva a leer metadata.
// ─────────────────────────────────────────────────────────────────────────────

/** Columnas mínimas que debe pedir cualquier consumidor histórico. */
export const SELECT_RENGLONES_LEGADO =
  "poliza_renglones(numero, cuenta, cuenta_nombre, concepto, cargo_centavos, abono_centavos, cfdi_id, movimiento_bancario_id)";

export type AsientoLegado = {
  cuenta: string;
  nombre: string;
  debe: number;
  haber: number;
};

const pesos = (centavos: unknown) => Math.round(Number(centavos ?? 0)) / 100;

/**
 * Convierte los renglones canónicos de una póliza al formato de asiento en
 * pesos que esperan los exportadores. No lee `metadata` bajo ninguna condición.
 */
export function asientosDesdeRenglones(poliza: any): AsientoLegado[] {
  const renglones = (poliza?.poliza_renglones ?? []) as any[];
  return [...renglones]
    .sort((a, b) => Number(a.numero ?? 0) - Number(b.numero ?? 0))
    .map((r) => ({
      cuenta: String(r.cuenta ?? ""),
      nombre: String(r.cuenta_nombre ?? r.cuenta ?? ""),
      debe: pesos(r.cargo_centavos),
      haber: pesos(r.abono_centavos),
    }));
}

/** Monto canónico de la póliza (suma de cargos) en pesos. */
export function montoDesdeRenglones(poliza: any): number {
  const renglones = (poliza?.poliza_renglones ?? []) as any[];
  return pesos(renglones.reduce((s, r) => s + Number(r.cargo_centavos ?? 0), 0));
}
