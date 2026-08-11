// ─────────────────────────────────────────────────────────────────────────────
// ETAPA 4 (clasificación fiscal) — lógica pura de decisiones de deducibilidad.
//
// Regla dura del producto: la IA sugiere, la persona decide. Ninguna decisión
// puede quedar registrada con origen "ia": la sugerencia se conserva sólo como
// evidencia adjunta. Sin datos no hay verde: la cobertura es real o es 0.
// ─────────────────────────────────────────────────────────────────────────────

export type Decision = "deducible" | "no_deducible" | "parcial" | "por_revisar";

export const DECISIONES: { id: Decision; etiqueta: string; descripcion: string }[] = [
  { id: "deducible", etiqueta: "Deducible", descripcion: "Procede al 100% con fundamento." },
  { id: "parcial", etiqueta: "Parcialmente deducible", descripcion: "Procede sólo en un porcentaje." },
  { id: "no_deducible", etiqueta: "No deducible", descripcion: "Se excluye; exige motivo." },
  { id: "por_revisar", etiqueta: "Por revisar", descripcion: "Sin decisión: bloquea el cierre." },
];

export type CfdiClasificable = {
  id: string;
  uuid: string;
  fecha: string;
  total: number;
  rfc_emisor: string;
  nombre_emisor: string | null;
  clase_documental: string | null;
  estatus_sat: string | null;
};

export type DecisionRegistrada = {
  cfdi_id: string;
  decision: Decision;
  porcentaje_deducible: number;
  motivo: string | null;
  fundamento: string | null;
  origen: "humano" | "regla";
};

export type EntradaDecision = {
  decision: Decision;
  porcentaje_deducible?: number | null;
  motivo?: string | null;
  fundamento?: string | null;
};

/** Validación de una decisión antes de persistirla. Falla cerrada. */
export function validarDecision(entrada: EntradaDecision): { ok: boolean; errores: string[]; porcentaje: number } {
  const errores: string[] = [];
  const motivo = (entrada.motivo ?? "").trim();
  let porcentaje = entrada.porcentaje_deducible ?? (entrada.decision === "deducible" ? 100 : 0);

  switch (entrada.decision) {
    case "deducible":
      porcentaje = 100;
      if (!(entrada.fundamento ?? "").trim()) errores.push("Una deducción exige fundamento (concepto y soporte).");
      break;
    case "parcial":
      if (!(porcentaje > 0 && porcentaje < 100)) errores.push("El porcentaje parcial debe ser mayor a 0 y menor a 100.");
      if (motivo.length < 10) errores.push("La deducción parcial exige un motivo de al menos 10 caracteres.");
      break;
    case "no_deducible":
      porcentaje = 0;
      if (motivo.length < 10) errores.push("Rechazar la deducción exige un motivo de al menos 10 caracteres.");
      break;
    case "por_revisar":
      porcentaje = 0;
      break;
  }
  return { ok: errores.length === 0, errores, porcentaje };
}

/** Un CFDI sin evidencia SAT vigente no puede declararse deducible. */
export function exigePorRevisar(cfdi: Pick<CfdiClasificable, "estatus_sat">): boolean {
  return (cfdi.estatus_sat ?? "desconocido") !== "vigente";
}

export type CoberturaClasificacion = {
  total: number;
  decididos: number;
  porRevisar: number;
  sinDecision: number;
  inconsistentes: string[];
  cobertura: number;
  listo: boolean;
  criteriosCumplidos: string[];
  criteriosPendientes: string[];
  montoDeducible: number;
};

/**
 * Cobertura real de la etapa. `listo` sólo cuando cada comprobante tiene una
 * decisión distinta de "por revisar" y ninguna contradice la evidencia SAT.
 */
export function coberturaClasificacion(
  cfdis: CfdiClasificable[],
  decisiones: DecisionRegistrada[],
): CoberturaClasificacion {
  const porCfdi = new Map(decisiones.map((d) => [d.cfdi_id, d]));
  const inconsistentes: string[] = [];
  let decididos = 0;
  let porRevisar = 0;
  let sinDecision = 0;
  let montoDeducible = 0;

  for (const cfdi of cfdis) {
    const d = porCfdi.get(cfdi.id);
    if (!d) {
      sinDecision += 1;
      continue;
    }
    if (d.decision === "por_revisar") {
      porRevisar += 1;
      continue;
    }
    if (exigePorRevisar(cfdi) && d.decision !== "no_deducible") {
      inconsistentes.push(cfdi.uuid);
      continue;
    }
    decididos += 1;
    montoDeducible += (Number(cfdi.total) || 0) * (Number(d.porcentaje_deducible) || 0) / 100;
  }

  const total = cfdis.length;
  const cobertura = total === 0 ? 0 : Math.round((decididos / total) * 10000) / 100;
  const listo = total > 0 && decididos === total && inconsistentes.length === 0;

  const criteriosCumplidos: string[] = [];
  const criteriosPendientes: string[] = [];
  (sinDecision === 0 && total > 0 ? criteriosCumplidos : criteriosPendientes).push(
    total === 0
      ? "No hay comprobantes recibidos cargados en el periodo"
      : `Decisión fiscal registrada en ${total - sinDecision} de ${total} comprobantes`,
  );
  (porRevisar === 0 ? criteriosCumplidos : criteriosPendientes).push(
    porRevisar === 0 ? "Sin comprobantes en “por revisar”" : `${porRevisar} comprobantes siguen “por revisar”`,
  );
  (inconsistentes.length === 0 ? criteriosCumplidos : criteriosPendientes).push(
    inconsistentes.length === 0
      ? "Ninguna decisión contradice la evidencia SAT"
      : `${inconsistentes.length} decisiones sobre comprobantes sin evidencia SAT vigente`,
  );

  return {
    total,
    decididos,
    porRevisar,
    sinDecision,
    inconsistentes,
    cobertura,
    listo,
    criteriosCumplidos,
    criteriosPendientes,
    montoDeducible: Math.round(montoDeducible * 100) / 100,
  };
}
