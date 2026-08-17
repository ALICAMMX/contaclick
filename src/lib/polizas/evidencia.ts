// ─────────────────────────────────────────────────────────────────────────────
// BLOQUE 2 · Niveles de evidencia de cobro/pago.
//
// Separación dura:
//   · DEVENGO contable  → nace del CFDI, no necesita flujo.
//   · COBRO/PAGO fiscal → exige evidencia de flujo, y esa evidencia tiene NIVEL.
//   · CONCILIACIÓN      → sólo existe cuando una persona la confirmó.
//
// Nunca se presenta un PUE como conciliación bancaria confirmada, y un PPD sin
// complemento ni banco confirmado NO inventa cobro, pago, IVA efectivamente
// cobrado ni IVA acreditable pagado.
// ─────────────────────────────────────────────────────────────────────────────

export const NIVELES_EVIDENCIA = [
  "documental_pue",
  "complemento_pago",
  "banco_confirmado",
  "manual_justificado",
  "sin_evidencia",
] as const;

export type NivelEvidencia = (typeof NIVELES_EVIDENCIA)[number];

export type EvidenciaFlujo = {
  nivel: NivelEvidencia;
  /** Texto que ve el contador. Nunca menciona tablas, RPC ni SQL. */
  leyenda: string;
  /** ¿Puede reconocerse IVA efectivamente cobrado / pagado con este nivel? */
  reconoce_flujo: boolean;
  /** ¿Hay una persona que respalde la evidencia? */
  actor?: string | null;
  fecha?: string | null;
  motivo?: string | null;
  movimiento_bancario_id?: string | null;
  cfdi_pago_id?: string | null;
};

const LEYENDAS: Record<NivelEvidencia, string> = {
  documental_pue: "Pago declarado PUE, no confirmado con banco",
  complemento_pago: "Cobro o pago respaldado por complemento de pago",
  banco_confirmado: "Movimiento bancario conciliado y confirmado por una persona",
  manual_justificado: "Cobro o pago reconocido manualmente con motivo registrado",
  sin_evidencia: "Sin evidencia de cobro o pago: sólo se reconoce el devengo",
};

/** Fuerza de cada nivel: define cuál gana cuando coinciden varios. */
const FUERZA: Record<NivelEvidencia, number> = {
  sin_evidencia: 0,
  documental_pue: 1,
  manual_justificado: 2,
  complemento_pago: 3,
  banco_confirmado: 4,
};

export function evidencia(
  nivel: NivelEvidencia,
  extra: Partial<Omit<EvidenciaFlujo, "nivel" | "leyenda" | "reconoce_flujo">> = {},
): EvidenciaFlujo {
  return {
    nivel,
    leyenda: LEYENDAS[nivel],
    reconoce_flujo: nivel !== "sin_evidencia",
    actor: extra.actor ?? null,
    fecha: extra.fecha ?? null,
    motivo: extra.motivo ?? null,
    movimiento_bancario_id: extra.movimiento_bancario_id ?? null,
    cfdi_pago_id: extra.cfdi_pago_id ?? null,
  };
}

export type SenalesEvidencia = {
  metodo_pago?: string | null;
  tipo_cfdi?: string | null;
  /** Complementos de pago relacionados (importe ya distribuido, en centavos). */
  complemento?: { cfdi_pago_id: string; importe_centavos: number } | null;
  /** Conciliación bancaria CONFIRMADA por una persona. */
  banco_confirmado?: { movimiento_bancario_id: string; actor?: string | null; fecha?: string | null } | null;
  /** Decisión humana explícita con motivo. */
  manual?: { actor: string; fecha: string; motivo: string } | null;
};

/**
 * Determina el nivel de evidencia SIN duplicar el reconocimiento: cuando
 * coinciden PUE, complemento y banco se conserva un solo cobro/pago (el nivel
 * más fuerte) y los demás quedan documentados como refuerzo.
 */
export function resolverEvidencia(s: SenalesEvidencia): {
  evidencia: EvidenciaFlujo;
  refuerzos: NivelEvidencia[];
  incidencias: string[];
} {
  const presentes: NivelEvidencia[] = [];
  const ppd = String(s.metodo_pago ?? "").toUpperCase() === "PPD";
  const pue = String(s.metodo_pago ?? "").toUpperCase() === "PUE";

  if (pue) presentes.push("documental_pue");
  if (s.complemento) presentes.push("complemento_pago");
  if (s.banco_confirmado) presentes.push("banco_confirmado");
  if (s.manual) presentes.push("manual_justificado");

  const incidencias: string[] = [];
  if (pue && s.complemento) {
    incidencias.push(
      "El comprobante se declaró de pago en una sola exhibición y además tiene complemento de pago: revisa cuál refleja la realidad.",
    );
  }
  if (ppd && s.banco_confirmado && !s.complemento) {
    incidencias.push(
      "Hay un movimiento bancario confirmado sin complemento de pago que lo respalde: falta el comprobante de pago.",
    );
  }
  if (pue && s.banco_confirmado) {
    // No es una anomalía: el banco simplemente refuerza lo declarado.
  }

  if (presentes.length === 0) {
    return { evidencia: evidencia("sin_evidencia"), refuerzos: [], incidencias };
  }

  const ganador = presentes.reduce((a, b) => (FUERZA[b] > FUERZA[a] ? b : a));
  const refuerzos = presentes.filter((n) => n !== ganador);

  const detalle =
    ganador === "banco_confirmado"
      ? {
          movimiento_bancario_id: s.banco_confirmado!.movimiento_bancario_id,
          actor: s.banco_confirmado!.actor ?? null,
          fecha: s.banco_confirmado!.fecha ?? null,
        }
      : ganador === "complemento_pago"
        ? { cfdi_pago_id: s.complemento!.cfdi_pago_id }
        : ganador === "manual_justificado"
          ? { actor: s.manual!.actor, fecha: s.manual!.fecha, motivo: s.manual!.motivo }
          : {};

  return { evidencia: evidencia(ganador, detalle), refuerzos, incidencias };
}

/**
 * Reparte el importe de un complemento entre los CFDI relacionados sin duplicar
 * cobros: el último documento absorbe la diferencia de redondeo en centavos.
 */
export function distribuirComplemento(
  importeCentavos: number,
  relacionados: Array<{ cfdi_id: string; saldo_centavos: number }>,
): Array<{ cfdi_id: string; aplicado_centavos: number }> {
  const salida: Array<{ cfdi_id: string; aplicado_centavos: number }> = [];
  let restante = Math.max(0, Math.trunc(importeCentavos));
  for (const r of relacionados) {
    const aplicado = Math.min(restante, Math.max(0, Math.trunc(r.saldo_centavos)));
    salida.push({ cfdi_id: r.cfdi_id, aplicado_centavos: aplicado });
    restante -= aplicado;
  }
  if (restante > 0 && salida.length > 0) {
    salida[salida.length - 1].aplicado_centavos += restante;
  }
  return salida;
}

/** Desglose por nivel para publicar de dónde viene cada parte del preliminar. */
export function agruparPorNivel(
  partidas: Array<{ nivel: NivelEvidencia; importe_centavos: number }>,
): Record<NivelEvidencia, number> {
  const base = Object.fromEntries(NIVELES_EVIDENCIA.map((n) => [n, 0])) as Record<NivelEvidencia, number>;
  for (const p of partidas) base[p.nivel] += Math.trunc(p.importe_centavos);
  return base;
}
