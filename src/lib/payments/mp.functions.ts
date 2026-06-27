import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { resolveActiveDespachoId } from "@/lib/despacho/resolve";
import { PLANS, computeTotal, isValidPlan, isValidCycle } from "./plans";

const Input = z.object({
  plan_id: z.string().refine(isValidPlan, { message: "plan inválido" }),
  billing_cycle: z.string().refine(isValidCycle, { message: "ciclo inválido" }),
  include_iva: z.boolean().default(true),
  payer_email: z.string().email().optional(),
  cupon_codigo: z.string().trim().min(2).max(64).optional(),
});

function siteOrigin(): string {
  return process.env.PUBLIC_SITE_URL || "https://contaclick.cloud";
}

export const createMpCheckout = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error("Mercado Pago no está configurado. Falta MERCADOPAGO_ACCESS_TOKEN.");
    }

    const despachoId = await resolveActiveDespachoId(supabase, userId);
    const plan = PLANS[data.plan_id as keyof typeof PLANS];
    const cycle = data.billing_cycle as "mensual" | "anual";

    // Revalidar cupón en servidor (autoridad)
    let cuponId: string | null = null;
    let porcentaje = 0;
    if (data.cupon_codigo) {
      const { data: row, error } = await supabase
        .rpc("validar_cupon", {
          _codigo: data.cupon_codigo,
          _plan_id: data.plan_id,
          _cycle: cycle,
          _despacho: despachoId,
        })
        .maybeSingle();
      if (error) throw new Error(error.message);
      const r = row as { valido: boolean; motivo: string; cupon_id: string | null; porcentaje: number | null } | null;
      if (!r || !r.valido) throw new Error(r?.motivo || "Cupón inválido");
      cuponId = r.cupon_id;
      porcentaje = Number(r.porcentaje ?? 0);
    }

    const totals = computeTotal(plan, cycle, data.include_iva, porcentaje);
    const payerEmail = data.payer_email || (claims as { email?: string })?.email || "cliente@contaclick.cloud";

    const origin = siteOrigin();
    const backUrl = `${origin}/app/configuracion?pago=ok`;

    const reasonExtra = porcentaje > 0 ? ` (-${porcentaje}% cupón)` : "";
    const preApprovalData = {
      reason: `ContaClick ${plan.name} — ${cycle === "mensual" ? "Mensual" : "Anual"}${data.include_iva ? " (IVA incl.)" : ""}${reasonExtra}`,
      auto_recurring: {
        frequency: cycle === "mensual" ? 1 : 12,
        frequency_type: "months",
        transaction_amount: totals.total,
        currency_id: "MXN",
      },
      payer_email: payerEmail,
      back_url: backUrl,
      external_reference: JSON.stringify({
        despacho_id: despachoId,
        user_id: userId,
        plan_id: data.plan_id,
        billing_cycle: cycle,
        include_iva: data.include_iva,
        cupon_id: cuponId,
        descuento_pct: porcentaje,
      }),
    };

    const resp = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preApprovalData),
    });
    const result = (await resp.json()) as {
      id?: string;
      init_point?: string;
      sandbox_init_point?: string;
      message?: string;
    };
    if (!resp.ok || !result.init_point) {
      console.error("MP preapproval error", result);
      throw new Error(result.message || "No se pudo iniciar el pago con Mercado Pago.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subRow } = await supabaseAdmin
      .from("mp_subscriptions")
      .insert({
        despacho_id: despachoId,
        user_id: userId,
        plan_id: data.plan_id,
        billing_cycle: cycle,
        iva_included: data.include_iva,
        amount_mxn: totals.total,
        mp_preapproval_id: result.id ?? null,
        mp_init_point: result.init_point,
        status: "pending",
      })
      .select("id")
      .maybeSingle();

    // Registrar redención del cupón (única por despacho gracias al unique constraint)
    if (cuponId) {
      const { error: redErr } = await supabaseAdmin.from("cupon_redenciones").insert({
        cupon_id: cuponId,
        despacho_id: despachoId,
        user_id: userId,
        mp_subscription_id: subRow?.id ?? null,
        plan_id: data.plan_id,
        billing_cycle: cycle,
        subtotal_original: totals.base,
        descuento: totals.descuento,
        total_final: totals.total,
      });
      if (!redErr) {
        const { data: cur } = await supabaseAdmin
          .from("cupones")
          .select("usos_actuales")
          .eq("id", cuponId)
          .maybeSingle();
        await supabaseAdmin
          .from("cupones")
          .update({ usos_actuales: (cur?.usos_actuales ?? 0) + 1 })
          .eq("id", cuponId);
      }
    }

    return {
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point ?? null,
      preapproval_id: result.id ?? null,
    };
  });
