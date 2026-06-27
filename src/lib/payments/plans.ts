// Catálogo de planes (espejo del que vive en /precios). Centralizado para checkout.
export type BillingCycle = "mensual" | "anual";
export type PlanId = "starter" | "pro" | "despacho";

export interface PlanDef {
  id: PlanId;
  name: string;
  mensual: number;
  anual: number; // total anual (2 meses gratis vs 12 x mensual)
  description: string;
}

export const PLANS: Record<PlanId, PlanDef> = {
  starter: {
    id: "starter",
    name: "Starter",
    mensual: 499,
    anual: 4990,
    description: "Para contadores independientes",
  },
  pro: {
    id: "pro",
    name: "Profesional",
    mensual: 1290,
    anual: 12900,
    description: "Despachos en crecimiento",
  },
  despacho: {
    id: "despacho",
    name: "Despacho",
    mensual: 2490,
    anual: 24900,
    description: "Despachos consolidados",
  },
};

export const IVA_RATE = 0.16;

export function computeTotal(plan: PlanDef, cycle: BillingCycle, includeIva: boolean) {
  const subtotal = cycle === "mensual" ? plan.mensual : plan.anual;
  const iva = includeIva ? Math.round(subtotal * IVA_RATE * 100) / 100 : 0;
  const total = subtotal + iva;
  return { subtotal, iva, total };
}

export function isValidPlan(id: string): id is PlanId {
  return id === "starter" || id === "pro" || id === "despacho";
}
export function isValidCycle(c: string): c is BillingCycle {
  return c === "mensual" || c === "anual";
}
