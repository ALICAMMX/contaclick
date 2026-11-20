// ─────────────────────────────────────────────────────────────────────────────
// MOTOR DE CONCILIACIÓN — BLOQUE 2: empates múltiples y complementos de pago
//
// Módulo PURO (sin base de datos, red, IA ni reloj). Corre DESPUÉS del motor
// uno a uno y sólo trabaja con lo que éste dejó libre:
//
//   1. Complementos de pago (CFDI tipo P): cada pago declarado en el
//      complemento (monto, fecha, número de operación) contra un movimiento.
//   2. Uno a varios: un movimiento que liquida varias facturas de la MISMA
//      contraparte (la suma cuadra al centavo).
//   3. Varios a uno: una factura liquidada con varios movimientos de la MISMA
//      contraparte (anticipo + finiquito, pagos parciales).
//
// Reglas de seguridad:
//   - Nunca confirma: sólo propone. Confirmar es un acto humano.
//   - Sólo agrupa documentos de una contraparte identificada; no mezcla
//     facturas de clientes distintos aunque la suma cuadre.
//   - Si hay más de una combinación posible, la propuesta queda para revisión
//     y se dice cuántas alternativas había.
//   - Mismo insumo, mismo resultado, en cualquier orden de lectura.
// ─────────────────────────────────────────────────────────────────────────────

import { ALGORITMO_VERSION, type EvidenciaConciliacion, type NivelPropuesta } from "./contrato";
import { normalizaTexto, type CfdiEntrada, type MovimientoEntrada } from "./motor";

export const ALGORITMO_MULTIPLE_VERSION = "conciliacion-multiple@1";

/** Un pago declarado dentro de un complemento de pago (CFDI tipo P). */
export type PagoComplemento = {
  /** Id del CFDI tipo P al que pertenece. */
  cfdi_id: string;
  fecha: string;
  monto_centavos: number;
  moneda: string | null;
  num_operacion: string | null;
};

export type ParametrosMultiple = {
  /** Días hacia atrás desde el movimiento para buscar facturas (crédito comercial). */
  dias_atras: number;
  /** Días hacia adelante (el banco a veces registra antes que la factura). */
  dias_adelante: number;
  /** Ventana para complementos de pago alrededor de la fecha de pago declarada. */
  dias_ventana_pago: number;
  /** Máximo de documentos en una combinación. */
  max_miembros: number;
  /** Máximo de candidatos por contraparte a combinar (protege el tiempo de cálculo). */
  max_candidatos: number;
};

export const PARAMETROS_MULTIPLE: ParametrosMultiple = {
  dias_atras: 60,
  dias_adelante: 5,
  dias_ventana_pago: 5,
  max_miembros: 8,
  max_candidatos: 24,
};

export type MiembroGrupo = {
  movimiento_id: string;
  cfdi_id: string;
  /** Lo que este par aporta al grupo, en centavos. */
  asignado_centavos: number;
};

export type GrupoMultiple = {
  tipo: "uno_a_uno" | "uno_a_varios" | "varios_a_uno";
  /** Qué regla lo produjo; se guarda en la evidencia. */
  regla: "complemento_pago" | "uno_a_varios_misma_contraparte" | "varios_a_uno_misma_contraparte";
  origen: "motor";
  estado: "propuesto";
  nivel_propuesta: Exclude<NivelPropuesta, "decision_humana">;
  miembros: MiembroGrupo[];
  movimiento_ids: string[];
  cfdi_ids: string[];
  importe_banco_centavos: number;
  importe_cfdi_centavos: number;
  diferencia_centavos: number;
  probabilidad_bp: number;
  evidencia: EvidenciaConciliacion & { combinaciones_alternativas: number; contraparte: string | null };
  idempotency_key: string;
  motivo: string;
};

export type EntradaMultiple = {
  /** Movimientos que el motor uno a uno dejó sin grupo. */
  movimientos: MovimientoEntrada[];
  /**
   * Comprobantes libres: PUE que quedaron sin movimiento, PPD (que el motor
   * uno a uno excluye) y los tipo P (que se emparejan por sus pagos).
   */
  cfdi: CfdiEntrada[];
  pagos: PagoComplemento[];
  movimientos_bloqueados?: string[];
  cfdi_bloqueados?: string[];
  /** Conjuntos ya rechazados por una persona: "mov1,mov2|cfdi1,cfdi2" ordenados. */
  combinaciones_rechazadas?: string[];
  parametros?: Partial<ParametrosMultiple>;
};

export type ResultadoMultiple = {
  version: string;
  grupos: GrupoMultiple[];
  metricas: { complementos: number; uno_a_varios: number; varios_a_uno: number; ambiguos: number };
};

// ── utilidades ──────────────────────────────────────────────────────────────

function dias(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return Number.POSITIVE_INFINITY;
  return Math.round((da - db) / 86400000);
}

const porId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function llaveCombinacion(movs: string[], cfdis: string[]): string {
  return `${[...movs].sort().join(",")}|${[...cfdis].sort().join(",")}`;
}

/** Texto plano del movimiento (descripción + referencia) para buscar señales. */
function textoMov(m: MovimientoEntrada): string {
  return `${normalizaTexto(m.descripcion)}${normalizaTexto(m.referencia)}`;
}

/** ¿El movimiento menciona a esta contraparte (RFC completo o nombre)? */
export function mencionaContraparte(m: MovimientoEntrada, rfc: string | null, nombre: string | null): boolean {
  const t = textoMov(m);
  const r = normalizaTexto(rfc);
  if (r.length >= 12 && t.includes(r)) return true;
  const n = normalizaTexto(nombre)
    // Quita la forma societaria para no exigirla en la descripción bancaria.
    .replace(/(SAPIDECV|SABDECV|SADECV|SCDERLDECV|SDERLDECV|SCDECV)$/, "");
  return n.length >= 8 && t.includes(n.slice(0, 12));
}

/**
 * Busca combinaciones de `items` cuyos importes sumen exactamente `objetivo`.
 * Devuelve hasta `limite` combinaciones (para saber si hay ambigüedad).
 * Determinista: los items se recorren en el orden recibido.
 */
export function combinacionesExactas(
  items: { id: string; centavos: number }[],
  objetivo: number,
  maxMiembros: number,
  limite = 2,
): string[][] {
  const orden = [...items].sort((a, b) => b.centavos - a.centavos || (a.id < b.id ? -1 : 1));
  // Sufijos para podar: lo máximo que aún se puede sumar.
  const resto: number[] = new Array(orden.length + 1).fill(0);
  for (let i = orden.length - 1; i >= 0; i -= 1) resto[i] = resto[i + 1] + orden[i].centavos;
  const out: string[][] = [];
  const pila: string[] = [];
  let pasos = 0;
  const TOPE_PASOS = 200000;

  const buscar = (i: number, falta: number) => {
    if (out.length >= limite || pasos > TOPE_PASOS) return;
    pasos += 1;
    if (falta === 0 && pila.length >= 2) {
      out.push([...pila]);
      return;
    }
    if (i >= orden.length || pila.length >= maxMiembros || falta < 0 || resto[i] < falta) return;
    const it = orden[i];
    if (it.centavos <= falta) {
      pila.push(it.id);
      buscar(i + 1, falta - it.centavos);
      pila.pop();
    }
    buscar(i + 1, falta);
  };
  buscar(0, objetivo);
  return out;
}

function evidenciaBase(
  regla: GrupoMultiple["regla"],
  direccion: "ingreso" | "egreso",
  diferencia: number,
  diasSep: number,
  extra: Partial<EvidenciaConciliacion>,
  alternativas: number,
  contraparte: string | null,
): GrupoMultiple["evidencia"] {
  return {
    importe_coincide: diferencia === 0,
    diferencia_centavos: diferencia,
    dias_separacion: diasSep,
    direccion,
    direccion_coincide: true,
    referencia_coincide: false,
    uuid_coincide: false,
    contraparte_coincide: false,
    moneda_coincide: true,
    candidatos_alternativos: alternativas,
    candidatos_alternativos_ids: [],
    senales_fuertes: 0,
    regla,
    version: `${ALGORITMO_VERSION}+${ALGORITMO_MULTIPLE_VERSION}`,
    ...extra,
    combinaciones_alternativas: alternativas,
    contraparte,
  };
}

// ── motor ───────────────────────────────────────────────────────────────────

export function conciliarMultiple(entrada: EntradaMultiple): ResultadoMultiple {
  const p: ParametrosMultiple = { ...PARAMETROS_MULTIPLE, ...(entrada.parametros ?? {}) };
  const movBloq = new Set(entrada.movimientos_bloqueados ?? []);
  const cfdiBloq = new Set(entrada.cfdi_bloqueados ?? []);
  const rechazadas = new Set(entrada.combinaciones_rechazadas ?? []);

  const movs = entrada.movimientos
    .filter((m) => !m.ignorado && !m.no_fiscal && m.importe_centavos > 0 && !movBloq.has(m.id))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.importe_centavos - b.importe_centavos || porId(a, b)));
  const cfdis = entrada.cfdi
    .filter((c) => !cfdiBloq.has(c.id) && (c.estatus_sat ?? "").toLowerCase() !== "cancelado")
    .sort(porId);
  const cfdiPorId = new Map(cfdis.map((c) => [c.id, c]));

  const movUsado = new Set<string>();
  const cfdiUsado = new Set<string>();
  const grupos: GrupoMultiple[] = [];
  let ambiguos = 0;
  const met = { complementos: 0, uno_a_varios: 0, varios_a_uno: 0 };

  const dirMov = (c: CfdiEntrada): "abono" | "cargo" => (c.direccion === "emitido" ? "abono" : "cargo");
  const monedaIgual = (m: MovimientoEntrada, mon: string | null) =>
    (m.moneda ?? "MXN").toUpperCase() === (mon ?? "MXN").toUpperCase();

  // ── 1. Complementos de pago ───────────────────────────────────────────────
  // Un complemento puede declarar varios pagos; cada uno busca su movimiento.
  const pagos = [...entrada.pagos]
    .filter((pg) => cfdiPorId.get(pg.cfdi_id)?.tipo_cfdi?.toUpperCase() === "P" && pg.monto_centavos > 0)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.cfdi_id < b.cfdi_id ? -1 : a.cfdi_id > b.cfdi_id ? 1 : a.monto_centavos - b.monto_centavos));
  const pagosPorCfdi = new Map<string, PagoComplemento[]>();
  for (const pg of pagos) pagosPorCfdi.set(pg.cfdi_id, [...(pagosPorCfdi.get(pg.cfdi_id) ?? []), pg]);

  for (const [cfdiId, lista] of pagosPorCfdi) {
    const c = cfdiPorId.get(cfdiId)!;
    const miembros: MiembroGrupo[] = [];
    let alternativas = 0;
    let referencia = false;
    let contraparte = false;
    let maxDias = 0;
    for (const pg of lista) {
      const cands = movs.filter(
        (m) =>
          !movUsado.has(m.id) &&
          !miembros.some((x) => x.movimiento_id === m.id) &&
          m.direccion === dirMov(c) &&
          m.importe_centavos === pg.monto_centavos &&
          monedaIgual(m, pg.moneda) &&
          Math.abs(dias(m.fecha, pg.fecha)) <= p.dias_ventana_pago,
      );
      if (cands.length === 0) continue;
      const op = normalizaTexto(pg.num_operacion);
      const puntua = (m: MovimientoEntrada) =>
        (op.length >= 6 && textoMov(m).includes(op) ? 2 : 0) +
        (mencionaContraparte(m, c.rfc_contraparte, c.nombre_contraparte) ? 1 : 0);
      cands.sort((a, b) => puntua(b) - puntua(a) || Math.abs(dias(a.fecha, pg.fecha)) - Math.abs(dias(b.fecha, pg.fecha)) || porId(a, b));
      const mejor = cands[0];
      if (cands.length > 1 && puntua(cands[1]) === puntua(mejor)) alternativas += cands.length - 1;
      referencia ||= op.length >= 6 && textoMov(mejor).includes(op);
      contraparte ||= mencionaContraparte(mejor, c.rfc_contraparte, c.nombre_contraparte);
      maxDias = Math.max(maxDias, Math.abs(dias(mejor.fecha, pg.fecha)));
      miembros.push({ movimiento_id: mejor.id, cfdi_id: c.id, asignado_centavos: pg.monto_centavos });
    }
    // Sólo se propone si TODOS los pagos del complemento encontraron movimiento.
    if (miembros.length === 0 || miembros.length !== lista.length) continue;
    const movIds = miembros.map((x) => x.movimiento_id);
    if (rechazadas.has(llaveCombinacion(movIds, [c.id]))) continue;
    const total = miembros.reduce((s, x) => s + x.asignado_centavos, 0);
    const fuertes = (referencia ? 1 : 0) + (contraparte ? 1 : 0);
    const alta = alternativas === 0 && fuertes >= 1;
    if (!alta && alternativas > 0) ambiguos += 1;
    movIds.forEach((id) => movUsado.add(id));
    cfdiUsado.add(c.id);
    met.complementos += 1;
    grupos.push({
      tipo: movIds.length === 1 ? "uno_a_uno" : "varios_a_uno",
      regla: "complemento_pago",
      origen: "motor",
      estado: "propuesto",
      nivel_propuesta: alta ? "automatica_alta_confianza" : "revision_requerida",
      miembros,
      movimiento_ids: movIds,
      cfdi_ids: [c.id],
      importe_banco_centavos: total,
      importe_cfdi_centavos: total,
      diferencia_centavos: 0,
      probabilidad_bp: alta ? 9000 : 6500,
      evidencia: evidenciaBase(
        "complemento_pago",
        c.direccion === "emitido" ? "ingreso" : "egreso",
        0,
        maxDias,
        { referencia_coincide: referencia, contraparte_coincide: contraparte, senales_fuertes: fuertes },
        alternativas,
        c.rfc_contraparte,
      ),
      idempotency_key: `cp:${llaveCombinacion(movIds, [c.id])}`,
      motivo: alta
        ? "El complemento de pago declara este cobro/pago con el mismo importe y el banco lo confirma. Requiere confirmación de una persona."
        : "El importe del complemento de pago coincide con el banco, pero faltan señales para darlo por seguro: revisa.",
    });
  }

  // Facturas que pueden combinarse: PUE y PPD (las PPD sin complemento también
  // se cobran; el complemento puede llegar después). Nunca P ni T ni importe 0.
  const facturables = cfdis.filter((c) => {
    const t = (c.tipo_cfdi ?? "I").toUpperCase();
    return (t === "I" || t === "E" || t === "") && c.total_centavos > 0;
  });

  // Contrapartes identificadas por RFC (o nombre si no hay RFC).
  const claveContraparte = (c: CfdiEntrada) => normalizaTexto(c.rfc_contraparte) || normalizaTexto(c.nombre_contraparte);

  // ── 2. Uno a varios: un movimiento paga varias facturas ───────────────────
  for (const m of movs) {
    if (movUsado.has(m.id)) continue;
    const dir = m.direccion === "abono" ? "emitido" : "recibido";
    const libres = facturables.filter(
      (c) =>
        !cfdiUsado.has(c.id) &&
        c.direccion === dir &&
        monedaIgual(m, c.moneda) &&
        dias(m.fecha, c.fecha) <= p.dias_atras &&
        dias(m.fecha, c.fecha) >= -p.dias_adelante,
    );
    // Agrupa por contraparte y sólo usa las que el movimiento menciona.
    const porContraparte = new Map<string, CfdiEntrada[]>();
    for (const c of libres) {
      const k = claveContraparte(c);
      if (!k) continue;
      if (!mencionaContraparte(m, c.rfc_contraparte, c.nombre_contraparte)) continue;
      porContraparte.set(k, [...(porContraparte.get(k) ?? []), c]);
    }
    const hallazgos: { k: string; combo: string[]; total: number }[] = [];
    for (const [k, lista] of [...porContraparte].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const items = lista
        .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : porId(a, b)))
        .slice(0, p.max_candidatos)
        .map((c) => ({ id: c.id, centavos: c.total_centavos }));
      for (const combo of combinacionesExactas(items, m.importe_centavos, p.max_miembros, 2)) {
        hallazgos.push({ k, combo, total: m.importe_centavos });
      }
    }
    if (hallazgos.length === 0) continue;
    const elegido = hallazgos[0];
    if (rechazadas.has(llaveCombinacion([m.id], elegido.combo))) continue;
    const alternativas = hallazgos.length - 1;
    if (alternativas > 0) ambiguos += 1;
    const combo = [...elegido.combo].sort();
    const maxDias = Math.max(...combo.map((id) => Math.abs(dias(m.fecha, cfdiPorId.get(id)!.fecha))));
    movUsado.add(m.id);
    combo.forEach((id) => cfdiUsado.add(id));
    met.uno_a_varios += 1;
    const alta = alternativas === 0;
    grupos.push({
      tipo: "uno_a_varios",
      regla: "uno_a_varios_misma_contraparte",
      origen: "motor",
      estado: "propuesto",
      nivel_propuesta: alta ? "automatica_alta_confianza" : "revision_requerida",
      miembros: combo.map((id) => ({ movimiento_id: m.id, cfdi_id: id, asignado_centavos: cfdiPorId.get(id)!.total_centavos })),
      movimiento_ids: [m.id],
      cfdi_ids: combo,
      importe_banco_centavos: m.importe_centavos,
      importe_cfdi_centavos: elegido.total,
      diferencia_centavos: 0,
      probabilidad_bp: alta ? 8500 : 6000,
      evidencia: evidenciaBase(
        "uno_a_varios_misma_contraparte",
        m.direccion === "abono" ? "ingreso" : "egreso",
        0,
        maxDias,
        { contraparte_coincide: true, senales_fuertes: 1 },
        alternativas,
        elegido.k,
      ),
      idempotency_key: `1aN:${llaveCombinacion([m.id], combo)}`,
      motivo: alta
        ? `Un solo movimiento liquida ${combo.length} facturas de la misma contraparte y la suma cuadra al centavo. Requiere confirmación de una persona.`
        : `La suma cuadra con ${combo.length} facturas, pero existe otra combinación posible: revisa cuáles son.`,
    });
  }

  // ── 3. Varios a uno: una factura pagada con varios movimientos ────────────
  for (const c of facturables) {
    if (cfdiUsado.has(c.id)) continue;
    const dir = dirMov(c);
    const libres = movs.filter(
      (m) =>
        !movUsado.has(m.id) &&
        m.direccion === dir &&
        monedaIgual(m, c.moneda) &&
        dias(m.fecha, c.fecha) >= -p.dias_atras && // anticipos antes de la factura
        dias(m.fecha, c.fecha) <= p.dias_atras &&
        mencionaContraparte(m, c.rfc_contraparte, c.nombre_contraparte),
    );
    if (libres.length < 2) continue;
    const items = libres
      .slice(0, p.max_candidatos)
      .map((m) => ({ id: m.id, centavos: m.importe_centavos }));
    const combos = combinacionesExactas(items, c.total_centavos, p.max_miembros, 2);
    if (combos.length === 0) continue;
    const combo = [...combos[0]].sort();
    if (rechazadas.has(llaveCombinacion(combo, [c.id]))) continue;
    const alternativas = combos.length - 1;
    if (alternativas > 0) ambiguos += 1;
    const movPorId = new Map(libres.map((m) => [m.id, m]));
    const maxDias = Math.max(...combo.map((id) => Math.abs(dias(movPorId.get(id)!.fecha, c.fecha))));
    combo.forEach((id) => movUsado.add(id));
    cfdiUsado.add(c.id);
    met.varios_a_uno += 1;
    const alta = alternativas === 0;
    grupos.push({
      tipo: "varios_a_uno",
      regla: "varios_a_uno_misma_contraparte",
      origen: "motor",
      estado: "propuesto",
      nivel_propuesta: alta ? "automatica_alta_confianza" : "revision_requerida",
      miembros: combo.map((id) => ({ movimiento_id: id, cfdi_id: c.id, asignado_centavos: movPorId.get(id)!.importe_centavos })),
      movimiento_ids: combo,
      cfdi_ids: [c.id],
      importe_banco_centavos: c.total_centavos,
      importe_cfdi_centavos: c.total_centavos,
      diferencia_centavos: 0,
      probabilidad_bp: alta ? 8000 : 5500,
      evidencia: evidenciaBase(
        "varios_a_uno_misma_contraparte",
        c.direccion === "emitido" ? "ingreso" : "egreso",
        0,
        maxDias,
        { contraparte_coincide: true, senales_fuertes: 1 },
        alternativas,
        claveContraparte(c) || null,
      ),
      idempotency_key: `Na1:${llaveCombinacion(combo, [c.id])}`,
      motivo: alta
        ? `La factura se cubrió con ${combo.length} movimientos de la misma contraparte y la suma cuadra al centavo. Requiere confirmación de una persona.`
        : `Hay más de una combinación de movimientos que cuadra con esta factura: revisa cuáles son.`,
    });
  }

  return {
    version: ALGORITMO_MULTIPLE_VERSION,
    grupos,
    metricas: { ...met, ambiguos },
  };
}
