// Programa Fundador — lectura de elegibilidad (cliente) y administración
// (super-admin). La elegibilidad SIEMPRE se resuelve en servidor: el frontend
// no puede forzar el descuento cambiando la URL ni el estado local.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { resolveActiveDespachoId } from "@/lib/despacho/resolve";
import {
  PLANS,
  PROGRAMA_FUNDADOR,
  esElegibleFundador,
  isValidCycle,
  isValidPlan,
  precioFundadorAnualCents,
  type BillingCycle,
  type PlanId,
} from "./plans";

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .limit(1);
  if (!data?.length) throw new Error("Solo super-admin");
}

/** ¿El despacho está registrado como fundador y con beneficio vigente? */
export async function esFundadorRegistrado(
  supabase: any,
  despachoId: string,
): Promise<{ registrado: boolean; descuento_pct: number; registro: any | null }> {
  const { data } = await supabase
    .from("programa_fundador")
    .select("*")
    .eq("despacho_id", despachoId)
    .maybeSingle();
  const activo = !!data && data.estado === "activo";
  return {
    registrado: activo,
    descuento_pct: activo ? Number(data.descuento_pct ?? PROGRAMA_FUNDADOR.descuentoPct) : 0,
    registro: data ?? null,
  };
}

const ElegInput = z.object({
  plan_id: z.string().refine(isValidPlan),
  billing_cycle: z.string().refine(isValidCycle),
});

export const getElegibilidadFundador = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => ElegInput.parse(d))
  .handler(async ({ data, context }) => {
    const despachoId = await resolveActiveDespachoId(context.supabase, context.userId);
    const f = await esFundadorRegistrado(context.supabase, despachoId);
    const elegible = esElegibleFundador({
      planId: data.plan_id as PlanId,
      cycle: data.billing_cycle as BillingCycle,
      esFundadorRegistrado: f.registrado,
    });
    return {
      elegible,
      descuento_pct: elegible ? PROGRAMA_FUNDADOR.descuentoPct : 0,
      precio_fundador_centavos: elegible
        ? precioFundadorAnualCents(PLANS[data.plan_id as PlanId])
        : null,
      condiciones: PROGRAMA_FUNDADOR.condiciones,
    };
  });

// ── Administración (super-admin) ─────────────────────────────────────────────

export const listarFundadores = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("programa_fundador")
      .select("*, despachos(nombre)")
      .order("fecha_ingreso", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const UpsertInput = z.object({
  despacho_id: z.string().uuid(),
  plan_id: z.string().refine(isValidPlan).optional(),
  descuento_pct: z.number().int().min(0).max(100).default(PROGRAMA_FUNDADOR.descuentoPct),
  renovaciones_cubiertas: z.number().int().min(1).max(20).default(
    PROGRAMA_FUNDADOR.renovacionesCubiertasDefault,
  ),
  fecha_renovacion: z.string().optional(),
  responsable_onboarding: z.string().max(200).optional(),
  ultima_sesion_feedback: z.string().optional(),
  proxima_sesion_feedback: z.string().optional(),
  estado: z.enum(["activo", "pausado", "vencido", "cancelado"]).default("activo"),
  notas: z.string().max(2000).optional(),
});

export const guardarFundador = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const precio =
      data.plan_id && isValidPlan(data.plan_id)
        ? Math.round(
            ((PLANS[data.plan_id].anualCents ?? 0) * (100 - data.descuento_pct)) / 100,
          )
        : null;

    const { error } = await context.supabase.from("programa_fundador").upsert(
      {
        despacho_id: data.despacho_id,
        plan_id: data.plan_id ?? null,
        descuento_pct: data.descuento_pct,
        precio_anual_acordado_centavos: precio,
        renovaciones_cubiertas: data.renovaciones_cubiertas,
        fecha_renovacion: data.fecha_renovacion || null,
        responsable_onboarding: data.responsable_onboarding || null,
        ultima_sesion_feedback: data.ultima_sesion_feedback || null,
        proxima_sesion_feedback: data.proxima_sesion_feedback || null,
        estado: data.estado,
        notas: data.notas || null,
        creado_por: context.userId,
      },
      { onConflict: "despacho_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, precio_anual_acordado_centavos: precio };
  });
