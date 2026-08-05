// ─────────────────────────────────────────────────────────────────────────────
// FUENTE ÚNICA DE VERDAD COMERCIAL DE CONTACLICK
//
// Planes, capacidad de RFC, precios de lista, programa fundador e IVA.
// Backend (checkout, Mercado Pago, administración), frontend (/precios,
// /app/checkout) y pruebas DEBEN leer de aquí. Está prohibido mantener
// listas de precios o de capacidades paralelas.
//
// REGLA COMERCIAL: todos los planes incluyen exactamente las mismas
// herramientas. Lo único que cambia entre planes es la cantidad máxima de
// RFC/expedientes activos y las cuotas operativas proporcionales (SAT, PAC,
// IA, almacenamiento) que cubren costo variable real.
//
// Dinero: se declara SIEMPRE en centavos enteros. Nunca punto flotante.
// ─────────────────────────────────────────────────────────────────────────────

export type BillingCycle = "mensual" | "anual";
export type PlanId = "starter" | "pro" | "despacho" | "enterprise";
/** Planes contratables en línea (Enterprise se cotiza con ventas). */
export type PlanComprableId = Exclude<PlanId, "enterprise">;

export const MONEDA = "MXN" as const;
/** Los precios de lista se publican SIN IVA; el IVA se suma en checkout. */
export const PRECIOS_INCLUYEN_IVA = false;
export const IVA_RATE = 0.16;

export interface PlanDef {
  id: PlanId;
  name: string;
  description: string;
  /** Máximo de RFC/expedientes activos reales (los demo no cuentan). -1 = a medida. */
  maxRfcs: number;
  /** Precio de lista mensual en centavos. null = a cotizar. */
  mensualCents: number | null;
  /** Precio de lista anual en centavos. null = a cotizar. */
  anualCents: number | null;
  /** Cuotas operativas proporcionales al número de RFC (costo variable). */
  capacidadOperativa: {
    ia_msgs: number;
    ia_tokens: number;
    sat_solicitudes_mes: number;
    sat_frecuencia_max: "manual" | "mensual" | "semanal" | "diaria";
    almacenamiento_gb: number;
    max_miembros: number;
  };
}

export const PLANS: Record<PlanId, PlanDef> = {
  starter: {
    id: "starter",
    name: "Starter",
    description: "Para contadores independientes",
    maxRfcs: 5,
    mensualCents: 49_900,
    anualCents: 499_000,
    capacidadOperativa: {
      ia_msgs: 200,
      ia_tokens: 1_000_000,
      sat_solicitudes_mes: 200,
      sat_frecuencia_max: "semanal",
      almacenamiento_gb: 5,
      max_miembros: 1,
    },
  },
  pro: {
    id: "pro",
    name: "Profesional",
    description: "Despachos en crecimiento",
    maxRfcs: 25,
    mensualCents: 129_000,
    anualCents: 1_290_000,
    capacidadOperativa: {
      ia_msgs: 1500,
      ia_tokens: 5_000_000,
      sat_solicitudes_mes: 1000,
      sat_frecuencia_max: "diaria",
      almacenamiento_gb: 25,
      max_miembros: 3,
    },
  },
  despacho: {
    id: "despacho",
    name: "Despacho",
    description: "Despachos consolidados",
    maxRfcs: 100,
    mensualCents: 249_000,
    anualCents: 2_490_000,
    capacidadOperativa: {
      ia_msgs: 5000,
      ia_tokens: 20_000_000,
      sat_solicitudes_mes: 4000,
      sat_frecuencia_max: "diaria",
      almacenamiento_gb: 100,
      max_miembros: 10,
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    description: "Firmas multi-oficina y corporativos",
    maxRfcs: -1,
    mensualCents: null,
    anualCents: null,
    capacidadOperativa: {
      ia_msgs: -1,
      ia_tokens: -1,
      sat_solicitudes_mes: -1,
      sat_frecuencia_max: "diaria",
      almacenamiento_gb: -1,
      max_miembros: -1,
    },
  },
};

export const PLANES_COMPRABLES: PlanComprableId[] = ["starter", "pro", "despacho"];
export const PLANES_ORDEN: PlanId[] = ["starter", "pro", "despacho", "enterprise"];

// ─────────────────────────────────────────────────────────────────────────────
// PROGRAMA FUNDADOR
// El descuento NO es vitalicio: su duración es configurable y se documenta
// por cuenta en la tabla `programa_fundador` (renovaciones_cubiertas).
// ─────────────────────────────────────────────────────────────────────────────

export const PROGRAMA_FUNDADOR = {
  activo: true,
  /** 40% exacto sobre la anualidad de lista. */
  descuentoPct: 40,
  /** Sólo aplica a contratación anual. */
  ciclosElegibles: ["anual"] as BillingCycle[],
  planesElegibles: PLANES_COMPRABLES,
  /** Ventana de alta del programa (ISO). */
  vigenciaDesde: "2026-01-01",
  vigenciaHasta: "2026-12-31",
  /** Cuántas anualidades cubre el precio fundador, contando la primera. */
  renovacionesCubiertasDefault: 1,
  condiciones:
    "Precio fundador aplicable a la contratación anual durante la vigencia del programa. " +
    "Cubre el número de anualidades registrado en la cuenta (por omisión, la primera). " +
    "Al terminar el beneficio, la renovación vuelve al precio de lista vigente. " +
    "Requiere que la cuenta esté registrada como fundadora por el equipo de ContaClick.",
} as const;

/** Precio fundador anual en centavos (redondeo a centavo entero, sin flotantes). */
export function precioFundadorAnualCents(plan: PlanDef): number | null {
  if (plan.anualCents === null) return null;
  return Math.round((plan.anualCents * (100 - PROGRAMA_FUNDADOR.descuentoPct)) / 100);
}

export function programaFundadorVigente(hoy: Date = new Date()): boolean {
  if (!PROGRAMA_FUNDADOR.activo) return false;
  const d = hoy.toISOString().slice(0, 10);
  return d >= PROGRAMA_FUNDADOR.vigenciaDesde && d <= PROGRAMA_FUNDADOR.vigenciaHasta;
}

/** Elegibilidad determinista. `esFundadorRegistrado` viene SIEMPRE del backend. */
export function esElegibleFundador(input: {
  planId: PlanId;
  cycle: BillingCycle;
  esFundadorRegistrado: boolean;
  hoy?: Date;
}): boolean {
  if (!input.esFundadorRegistrado) return false;
  if (!programaFundadorVigente(input.hoy)) return false;
  if (!(PROGRAMA_FUNDADOR.ciclosElegibles as readonly BillingCycle[]).includes(input.cycle)) return false;
  return (PROGRAMA_FUNDADOR.planesElegibles as readonly PlanId[]).includes(input.planId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cálculo de importes (todo en centavos enteros)
// ─────────────────────────────────────────────────────────────────────────────

export function precioListaCents(plan: PlanDef, cycle: BillingCycle): number | null {
  return cycle === "mensual" ? plan.mensualCents : plan.anualCents;
}

export interface Importes {
  baseCents: number;
  descuentoCents: number;
  subtotalCents: number;
  ivaCents: number;
  totalCents: number;
  /** Espejo en pesos con 2 decimales exactos, derivado de los centavos. */
  base: number;
  descuento: number;
  subtotal: number;
  iva: number;
  total: number;
  descuentoPct: number;
  fundadorAplicado: boolean;
  moneda: typeof MONEDA;
  ivaIncluidoEnLista: boolean;
}

const pesos = (cents: number) => Math.round(cents) / 100;

/**
 * Calcula importes. `descuentoPct` (cupón) y `fundador` no se acumulan:
 * se aplica el beneficio mayor, para no regalar margen por accidente.
 */
export function calcularImportes(input: {
  plan: PlanDef;
  cycle: BillingCycle;
  includeIva: boolean;
  cuponPct?: number;
  fundadorAplicable?: boolean;
}): Importes {
  const baseCents = precioListaCents(input.plan, input.cycle);
  if (baseCents === null) throw new Error("Este plan se cotiza con ventas.");

  const cuponPct = Math.max(0, Math.min(100, input.cuponPct ?? 0));
  const fundadorPct = input.fundadorAplicable ? PROGRAMA_FUNDADOR.descuentoPct : 0;
  const fundadorGana = fundadorPct >= cuponPct && fundadorPct > 0;
  const pct = Math.max(cuponPct, fundadorPct);

  const descuentoCents = Math.round((baseCents * pct) / 100);
  const subtotalCents = baseCents - descuentoCents;
  const ivaCents = input.includeIva ? Math.round(subtotalCents * IVA_RATE) : 0;
  const totalCents = subtotalCents + ivaCents;

  return {
    baseCents,
    descuentoCents,
    subtotalCents,
    ivaCents,
    totalCents,
    base: pesos(baseCents),
    descuento: pesos(descuentoCents),
    subtotal: pesos(subtotalCents),
    iva: pesos(ivaCents),
    total: pesos(totalCents),
    descuentoPct: pct,
    fundadorAplicado: fundadorGana,
    moneda: MONEDA,
    ivaIncluidoEnLista: PRECIOS_INCLUYEN_IVA,
  };
}

/** @deprecated Usa calcularImportes(). Se conserva por compatibilidad de firma. */
export function computeTotal(
  plan: PlanDef,
  cycle: BillingCycle,
  includeIva: boolean,
  discountPct: number = 0,
) {
  const r = calcularImportes({ plan, cycle, includeIva, cuponPct: discountPct });
  return { base: r.base, descuento: r.descuento, subtotal: r.subtotal, iva: r.iva, total: r.total };
}

export function equivalenteMensualCents(anualCents: number): number {
  return Math.round(anualCents / 12);
}

export function ahorroAnualCents(plan: PlanDef): number | null {
  if (plan.anualCents === null || plan.mensualCents === null) return null;
  return plan.mensualCents * 12 - plan.anualCents;
}

export function isValidPlan(id: string): id is PlanComprableId {
  return id === "starter" || id === "pro" || id === "despacho";
}
export function isValidCycle(c: string): c is BillingCycle {
  return c === "mensual" || c === "anual";
}

export const mxnDesdeCents = (cents: number, decimales = 0) =>
  `$${(cents / 100).toLocaleString("es-MX", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })}`;
