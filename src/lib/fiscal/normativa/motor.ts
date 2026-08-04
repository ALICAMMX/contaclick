// ─────────────────────────────────────────────────────────────────────────────
// MOTOR NORMATIVO — resolución por periodo + cálculos deterministas
// ─────────────────────────────────────────────────────────────────────────────
// Todas las funciones de cálculo son DETERMINISTAS (sin IA) y devuelven el
// sello normativo (ejercicio, versión, fuente, fecha de actualización) para que
// el resultado pueda archivarse y reproducirse en el futuro.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CATALOGO_NORMATIVO,
  hashConjunto,
  type ConjuntoNormativo,
  type Impuesto,
  type Regimen,
  type TramoTarifa,
} from "./catalogo";

export class NormativaNoVigenteError extends Error {
  readonly code = "NORMATIVA_NO_VIGENTE";
  constructor(
    readonly regimen: Regimen,
    readonly periodo: string,
    message: string,
  ) {
    super(message);
    this.name = "NormativaNoVigenteError";
  }
}

export type SelloNormativo = {
  conjuntoId: string;
  /** Huella de integridad del conjunto usado (detecta edición silenciosa) */
  hash: string;
  /** Fecha/hora en que se ejecutó el cálculo (ISO) */
  calculadoEn: string;
  /** Estado de cotejo del conjunto contra la publicación oficial */
  verificacion: "verificado" | "pendiente_cotejo";
  ejercicio: number;
  version: string;
  vigencia: string;
  fuente: string;
  url: string;
  publicacionDOF: string;
  entradaVigor: string;
  actualizadoAl: string;
  notas?: string;
  /** Distingue reglas deterministas de análisis generado por IA */
  naturaleza: "determinista";
  requiereRevisionProfesional: true;
};

const PERIODO_MES = /^(\d{4})-(0[1-9]|1[0-2])$/;
const PERIODO_ANIO = /^(\d{4})$/;

export function rangoPeriodo(periodo: string): { desde: string; hasta: string; ejercicio: number } {
  const mes = PERIODO_MES.exec(periodo);
  if (mes) {
    const y = Number(mes[1]);
    const m = Number(mes[2]);
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
      desde: `${periodo}-01`,
      hasta: `${periodo}-${String(ultimo).padStart(2, "0")}`,
      ejercicio: y,
    };
  }
  const anio = PERIODO_ANIO.exec(periodo);
  if (anio) {
    return { desde: `${periodo}-01-01`, hasta: `${periodo}-12-31`, ejercicio: Number(anio[1]) };
  }
  throw new NormativaNoVigenteError(
    "PF_GENERAL_MENSUAL",
    periodo,
    `Periodo inválido "${periodo}". Usa el formato AAAA-MM (mensual) o AAAA (anual).`,
  );
}

/**
 * Devuelve el conjunto normativo aplicable al periodo solicitado.
 * NO hace fallback a la última tabla publicada: si no hay norma que cubra
 * íntegramente el periodo, lanza NormativaNoVigenteError y el cálculo se bloquea.
 */
export function resolverNormativa(
  impuesto: Impuesto,
  regimen: Regimen,
  periodo: string,
): ConjuntoNormativo {
  const { desde, hasta, ejercicio } = rangoPeriodo(periodo);
  const candidatos = CATALOGO_NORMATIVO.filter(
    (c) =>
      c.impuesto === impuesto &&
      c.regimen === regimen &&
      c.vigenteDesde <= desde &&
      (c.vigenteHasta === null || c.vigenteHasta >= hasta),
  );
  if (candidatos.length === 0) {
    const disponibles = CATALOGO_NORMATIVO.filter(
      (c) => c.impuesto === impuesto && c.regimen === regimen,
    )
      .map((c) => `${c.ejercicio} (v${c.version})`)
      .join(", ");
    throw new NormativaNoVigenteError(
      regimen,
      periodo,
      `No hay tabla normativa vigente para ${impuesto} · ${regimen} en el periodo ${periodo} (ejercicio ${ejercicio}). ` +
        `El cálculo se bloquea para no aplicar tarifas de otro ejercicio. ` +
        (disponibles
          ? `Ejercicios cargados: ${disponibles}. Carga el Anexo 8 correspondiente antes de continuar.`
          : `No hay ningún conjunto cargado para este régimen.`),
    );
  }
  // Si hay más de uno vigente, gana el de vigencia más reciente (reforma posterior).
  candidatos.sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? 1 : -1));
  return candidatos[0]!;
}

export function sello(c: ConjuntoNormativo): SelloNormativo {
  return {
    conjuntoId: c.id,
    hash: hashConjunto(c),
    calculadoEn: new Date().toISOString(),
    verificacion: c.verificacion.estado,
    ejercicio: c.ejercicio,
    version: c.version,
    vigencia: `${c.vigenteDesde} → ${c.vigenteHasta ?? "vigente"}`,
    fuente: c.fuente.nombre,
    url: c.fuente.url,
    publicacionDOF: c.fuente.publicacionDOF,
    entradaVigor: c.fuente.entradaVigor,
    actualizadoAl: c.actualizadoAl,
    ...(c.notas ? { notas: c.notas } : {}),
    naturaleza: "determinista",
    requiereRevisionProfesional: true,
  };
}

// ── Utilidades ───────────────────────────────────────────────────────────────

export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function validarMonto(nombre: string, v: number, permitirNegativo = false): number {
  if (!Number.isFinite(v)) throw new Error(`${nombre}: el valor no es un número válido.`);
  if (!permitirNegativo && v < 0) throw new Error(`${nombre}: no admite valores negativos.`);
  return v;
}

export function aplicarTarifa(base: number, tramos: TramoTarifa[]) {
  const b = Math.max(base, 0);
  const tramo =
    tramos.find(
      (x) => b >= x.limiteInferior && (x.limiteSuperior === null || b <= x.limiteSuperior),
    ) ?? tramos[0]!;
  const excedente = Math.max(b - tramo.limiteInferior, 0);
  const marginal = (excedente * tramo.porcentaje) / 100;
  return {
    tramo,
    excedente: round2(excedente),
    impuestoMarginal: round2(marginal),
    impuesto: round2(tramo.cuotaFija + marginal),
  };
}

// ── ISR Persona Física (pagos provisionales / actividad empresarial) ─────────

export type IsrPfInput = {
  /** AAAA-MM para pago provisional mensual, AAAA para el cálculo anual */
  periodo: string;
  /** Fuerza la tarifa anual (art. 152 LISR). Se infiere si el periodo es AAAA. */
  anual?: boolean;
  ingresos: number;
  deducciones?: number;
  retenciones?: number;
  pagosProvisionalesAnteriores?: number;
};

export function calcularIsrPf(input: IsrPfInput) {
  // La tarifa anual es un conjunto normativo INDEPENDIENTE publicado por el
  // Anexo 8; jamás se obtiene multiplicando la tarifa mensual por 12.
  const esAnual = input.anual === true || /^\d{4}$/.test(input.periodo);
  const conjunto = resolverNormativa(
    "ISR",
    esAnual ? "PF_GENERAL_ANUAL" : "PF_GENERAL_MENSUAL",
    input.periodo,
  );
  if (conjunto.cuerpo.tipo !== "tarifa") throw new Error("Conjunto normativo inválido para ISR PF.");

  const ingresos = validarMonto("Ingresos", input.ingresos);
  const deducciones = validarMonto("Deducciones", input.deducciones ?? 0);
  const retenciones = validarMonto("Retenciones", input.retenciones ?? 0);
  const pagosAnt = validarMonto("Pagos provisionales anteriores", input.pagosProvisionalesAnteriores ?? 0);

  const base = round2(Math.max(ingresos - deducciones, 0));
  const t = aplicarTarifa(base, conjunto.cuerpo.tramos);
  const isrCausado = t.impuesto;
  const aCargo = round2(Math.max(isrCausado - retenciones - pagosAnt, 0));
  const aFavor = round2(Math.max(retenciones + pagosAnt - isrCausado, 0));

  return {
    periodo: input.periodo,
    anual: esAnual,
    base,
    limiteInferior: t.tramo.limiteInferior,
    excedente: t.excedente,
    porcentaje: t.tramo.porcentaje,
    cuotaFija: t.tramo.cuotaFija,
    impuestoMarginal: t.impuestoMarginal,
    isrCausado,
    retenciones: round2(retenciones),
    pagosProvisionalesAnteriores: round2(pagosAnt),
    isrACargo: aCargo,
    isrAFavor: aFavor,
    tasaEfectiva: base > 0 ? round2((isrCausado / base) * 100) : 0,
    normativa: sello(conjunto),
  };
}

// ── ISR Persona Moral (pago provisional) ─────────────────────────────────────

export type IsrPmInput = {
  periodo: string; // AAAA-MM
  ingresosNominales: number;
  coeficienteUtilidad: number; // decimal, ej. 0.15
  perdidasPendientes?: number;
  pagosProvisionalesAnteriores?: number;
  retenciones?: number;
};

export function calcularIsrPm(input: IsrPmInput) {
  const conjunto = resolverNormativa("ISR", "PM_GENERAL", input.periodo);
  if (conjunto.cuerpo.tipo !== "tasa") throw new Error("Conjunto normativo inválido para ISR PM.");

  const ingresos = validarMonto("Ingresos nominales", input.ingresosNominales);
  const coef = validarMonto("Coeficiente de utilidad", input.coeficienteUtilidad);
  if (coef > 1) throw new Error("Coeficiente de utilidad: usa decimales (ej. 0.15 para 15%).");
  const perdidas = validarMonto("Pérdidas pendientes", input.perdidasPendientes ?? 0);
  const pagosAnt = validarMonto("Pagos provisionales anteriores", input.pagosProvisionalesAnteriores ?? 0);
  const retenciones = validarMonto("Retenciones", input.retenciones ?? 0);

  const utilidadFiscal = round2(ingresos * coef);
  const base = round2(Math.max(utilidadFiscal - perdidas, 0));
  const tasa = conjunto.cuerpo.tasa;
  const isrCausado = round2((base * tasa) / 100);
  const aCargo = round2(Math.max(isrCausado - pagosAnt - retenciones, 0));
  const aFavor = round2(Math.max(pagosAnt + retenciones - isrCausado, 0));

  return {
    periodo: input.periodo,
    utilidadFiscal,
    perdidasAplicadas: round2(Math.min(perdidas, utilidadFiscal)),
    base,
    tasa,
    isrCausado,
    pagosProvisionalesAnteriores: round2(pagosAnt),
    retenciones: round2(retenciones),
    isrACargo: aCargo,
    isrAFavor: aFavor,
    normativa: sello(conjunto),
  };
}

// ── RESICO Persona Física ────────────────────────────────────────────────────

export type ResicoInput = {
  periodo: string; // AAAA-MM
  ingresosCobrados: number;
  /** Acumulado del ejercicio ANTES de este mes, para control del tope anual */
  acumuladoAnualPrevio?: number;
  /** true si el receptor de las facturas es persona moral (retención 1.25%) */
  retencionPersonaMoral?: boolean;
  /** Monto retenido efectivamente por PM; si se omite se calcula al 1.25% */
  retencionesEfectuadas?: number;
};

export function calcularResicoPf(input: ResicoInput) {
  const conjunto = resolverNormativa("ISR", "PF_RESICO", input.periodo);
  if (conjunto.cuerpo.tipo !== "resico") throw new Error("Conjunto normativo inválido para RESICO.");
  const { tramos, limiteAnual, retencionPM } = conjunto.cuerpo;

  const ingresos = validarMonto("Ingresos cobrados", input.ingresosCobrados);
  const previo = validarMonto("Acumulado anual previo", input.acumuladoAnualPrevio ?? 0);
  const acumulado = round2(previo + ingresos);

  const tramo = tramos.find((x) => ingresos <= x.hasta) ?? null;
  const excedeTopeMensual = tramo === null;
  const excedeTopeAnual = acumulado > limiteAnual;

  const tasa = tramo?.tasa ?? null;
  const isrCausado = tasa != null ? round2((ingresos * tasa) / 100) : 0;
  const retencion =
    input.retencionesEfectuadas != null
      ? validarMonto("Retenciones", input.retencionesEfectuadas)
      : input.retencionPersonaMoral
        ? round2((ingresos * retencionPM) / 100)
        : 0;
  const aCargo = tasa != null ? round2(Math.max(isrCausado - retencion, 0)) : 0;

  return {
    periodo: input.periodo,
    ingresos: round2(ingresos),
    acumuladoAnual: acumulado,
    limiteAnual,
    tasa,
    isrCausado,
    retencion,
    isrACargo: aCargo,
    excedeTopeMensual,
    excedeTopeAnual,
    bloqueado: excedeTopeMensual || excedeTopeAnual,
    motivoBloqueo: excedeTopeMensual
      ? "El ingreso del mes rebasa el último tramo de la tabla del art. 113-E; el contribuyente sale de RESICO."
      : excedeTopeAnual
        ? `El acumulado del ejercicio ($${acumulado.toLocaleString("es-MX")}) rebasa el límite anual de $${limiteAnual.toLocaleString("es-MX")}.`
        : null,
    normativa: sello(conjunto),
  };
}

// ── IVA ──────────────────────────────────────────────────────────────────────

export type IvaInput = {
  periodo: string; // AAAA-MM
  ivaTrasladado: number;
  ivaAcreditable: number;
  ivaRetenido?: number;
  saldoAFavorAnterior?: number;
};

export function calcularIva(input: IvaInput) {
  const conjunto = resolverNormativa("IVA", "IVA_GENERAL", input.periodo);
  if (conjunto.cuerpo.tipo !== "tasa") throw new Error("Conjunto normativo inválido para IVA.");

  const trasladado = validarMonto("IVA trasladado", input.ivaTrasladado);
  const acreditable = validarMonto("IVA acreditable", input.ivaAcreditable);
  const retenido = validarMonto("IVA retenido", input.ivaRetenido ?? 0);
  const saldoPrevio = validarMonto("Saldo a favor anterior", input.saldoAFavorAnterior ?? 0);

  const neto = round2(trasladado - acreditable - retenido - saldoPrevio);
  return {
    periodo: input.periodo,
    tasaGeneral: conjunto.cuerpo.tasa,
    ivaTrasladado: round2(trasladado),
    ivaAcreditable: round2(acreditable),
    ivaRetenido: round2(retenido),
    saldoAFavorAnterior: round2(saldoPrevio),
    ivaACargo: neto > 0 ? neto : 0,
    ivaAFavor: neto < 0 ? round2(-neto) : 0,
    normativa: sello(conjunto),
  };
}

// ── Inventario público del catálogo (para pantallas de transparencia) ────────

export function inventarioNormativo() {
  return CATALOGO_NORMATIVO.map((c) => ({
    id: c.id,
    impuesto: c.impuesto,
    regimen: c.regimen,
    ejercicio: c.ejercicio,
    version: c.version,
    vigencia: `${c.vigenteDesde} → ${c.vigenteHasta ?? "vigente"}`,
    fuente: c.fuente.nombre,
    url: c.fuente.url,
    publicacionDOF: c.fuente.publicacionDOF,
    entradaVigor: c.fuente.entradaVigor,
    actualizadoAl: c.actualizadoAl,
    verificacion: c.verificacion,
    hash: hashConjunto(c),
  }));
}


// ── Subsidio para el empleo (Decreto DOF 31/12/2025) ─────────────────────────
// El subsidio NO proviene del Anexo 8 de la RMF: tiene conjunto normativo,
// fuente y versión propios. Enero 2026 = 15.59% de la UMA mensual 2025;
// febrero a diciembre 2026 = 15.02% de la UMA mensual 2026.

export type SubsidioInput = {
  /** Mes del pago, AAAA-MM. En pagos multi-mes, el primer mes cubierto. */
  periodo: string;
  ingresoGravable: number;
  /** Días pagados cuando el periodo es menor a un mes (prorrateo del decreto). */
  dias?: number;
  /** Número de meses completos que comprende el pago (>= 1). */
  mesesCubiertos?: number;
};

function siguienteMes(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m!, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function subsidioDeUnMes(periodo: string, ingresoDelMes: number) {
  const c = resolverNormativa("ISR", "PF_SUBSIDIO_MENSUAL", periodo);
  if (c.cuerpo.tipo !== "subsidio_porcentaje") {
    throw new Error("Conjunto normativo inválido para subsidio para el empleo.");
  }
  const sp = c.cuerpo.subsidio;
  const conDerecho = ingresoDelMes <= sp.limiteIngresoMensual;
  const monto = conDerecho ? round2((sp.umaMensual * sp.porcentaje) / 100) : 0;
  return { conjunto: c, sp, conDerecho, monto };
}

/**
 * Subsidio para el empleo del periodo. Devuelve el desglose por mes cubierto,
 * el sello normativo de cada conjunto aplicado y una advertencia cuando algún
 * parámetro (p. ej. la UMA 2026) aún está pendiente de cotejo oficial.
 */
export function calcularSubsidioEmpleo(input: SubsidioInput) {
  const ingreso = round2(validarMonto("Ingreso gravable", input.ingresoGravable));
  const meses = input.mesesCubiertos ?? 1;
  if (!Number.isInteger(meses) || meses < 1) {
    throw new Error("Meses cubiertos: debe ser un entero mayor o igual a 1.");
  }
  if (input.dias !== undefined) {
    if (meses > 1) throw new Error("Un pago no puede ser a la vez por días sueltos y por varios meses.");
    if (!(input.dias > 0)) throw new Error("Días: debe ser mayor a cero.");
  }

  const detalle: Array<{
    periodo: string;
    ingresoDelMes: number;
    porcentaje: number;
    umaMensual: number;
    umaEjercicio: number;
    limiteIngresoMensual: number;
    conDerecho: boolean;
    monto: number;
    normativa: SelloNormativo;
  }> = [];

  // Pago que comprende dos o más meses: el ingreso se distribuye entre los
  // meses cubiertos y el subsidio se determina mes por mes, con la norma de
  // cada mes (así el cruce enero→febrero 2026 aplica dos porcentajes).
  const ingresoPorMes = round2(ingreso / meses);
  let periodo = input.periodo;
  let total = 0;
  let pendienteCotejo = false;

  for (let k = 0; k < meses; k++) {
    const { conjunto, sp, conDerecho, monto } = subsidioDeUnMes(periodo, ingresoPorMes);
    if (conjunto.verificacion.estado !== "verificado") pendienteCotejo = true;
    let montoMes = monto;
    if (input.dias !== undefined) {
      // Periodos menores a un mes: proporción diaria del decreto.
      montoMes = round2((monto / sp.diasMesComercial) * input.dias);
    }
    total = round2(total + montoMes);
    detalle.push({
      periodo,
      ingresoDelMes: ingresoPorMes,
      porcentaje: sp.porcentaje,
      umaMensual: sp.umaMensual,
      umaEjercicio: sp.umaEjercicio,
      limiteIngresoMensual: sp.limiteIngresoMensual,
      conDerecho,
      monto: montoMes,
      normativa: sello(conjunto),
    });
    periodo = siguienteMes(periodo);
  }

  return {
    periodo: input.periodo,
    mesesCubiertos: meses,
    dias: input.dias ?? null,
    ingresoGravable: ingreso,
    subsidio: total,
    detalle,
    pendienteCotejo,
    advertencia: pendienteCotejo
      ? "Uno de los parámetros del subsidio (UMA 2026) está pendiente de cotejo contra el aviso oficial del INEGI publicado en el DOF. Verifica antes de timbrar la nómina."
      : null,
  };
}

// ── ISR de salarios con subsidio ─────────────────────────────────────────────

export type IsrSalariosInput = {
  periodo: string; // AAAA-MM
  ingresoGravable: number;
  /** El subsidio sólo procede con un solo patrón y para ingresos por salarios. */
  aplicaSubsidio?: boolean;
  dias?: number;
  mesesCubiertos?: number;
};

export function calcularIsrSalarios(input: IsrSalariosInput) {
  const conjunto = resolverNormativa("ISR", "PF_GENERAL_MENSUAL", input.periodo);
  if (conjunto.cuerpo.tipo !== "tarifa") throw new Error("Conjunto normativo inválido para ISR salarios.");
  const base = round2(validarMonto("Ingreso gravable", input.ingresoGravable));
  const t = aplicarTarifa(base, conjunto.cuerpo.tramos);
  const isrCausado = t.impuesto;

  const s = input.aplicaSubsidio
    ? calcularSubsidioEmpleo({
        periodo: input.periodo,
        ingresoGravable: base,
        ...(input.dias !== undefined ? { dias: input.dias } : {}),
        ...(input.mesesCubiertos !== undefined ? { mesesCubiertos: input.mesesCubiertos } : {}),
      })
    : null;
  const subsidio = s?.subsidio ?? 0;

  const neto = round2(isrCausado - subsidio);
  return {
    periodo: input.periodo,
    base,
    isrCausado,
    subsidioEmpleo: subsidio,
    isrARetener: neto > 0 ? neto : 0,
    subsidioEntregado: neto < 0 ? round2(-neto) : 0,
    normativa: sello(conjunto),
    subsidioDetalle: s,
    normativaSubsidio: s?.detalle[0]?.normativa ?? null,
  };
}

// ── Reproducibilidad histórica ───────────────────────────────────────────────

/** Recupera el conjunto exacto con el que se calculó un resultado archivado. */
export function conjuntoPorId(id: string): ConjuntoNormativo | null {
  return CATALOGO_NORMATIVO.find((c) => c.id === id) ?? null;
}

/**
 * Verifica que un resultado archivado siga siendo reproducible: el conjunto
 * existe y su contenido no cambió (hash idéntico al sellado en su momento).
 */
export function verificarSello(s: Pick<SelloNormativo, "conjuntoId" | "hash">) {
  const c = conjuntoPorId(s.conjuntoId);
  if (!c) return { reproducible: false as const, motivo: "El conjunto normativo ya no existe en el catálogo." };
  const actual = hashConjunto(c);
  if (actual !== s.hash) {
    return {
      reproducible: false as const,
      motivo: `El conjunto ${s.conjuntoId} fue modificado (hash ${s.hash} → ${actual}). Una corrección debe publicarse como versión nueva.`,
    };
  }
  return { reproducible: true as const, conjunto: c };
}
