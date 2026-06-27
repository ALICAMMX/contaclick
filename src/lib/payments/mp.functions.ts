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
    const { total } = computeTotal(plan, data.billing_cycle as "mensual" | "anual", data.include_iva);
    const cycle = data.billing_cycle as "mensual" | "anual";
    const payerEmail = data.payer_email || (claims as { email?: string })?.email || "cliente@contaclick.cloud";

    const origin = siteOrigin();
    const backUrl = `${origin}/app/configuracion?pago=ok`;

    const preApprovalData = {
      reason: `ContaClick ${plan.name} — ${cycle === "mensual" ? "Mensual" : "Anual"}${data.include_iva ? " (IVA incl.)" : ""}`,
      auto_recurring: {
        frequency: cycle === "mensual" ? 1 : 12,
        frequency_type: "months",
        transaction_amount: total,
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

    // Registrar la suscripción en pending
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("mp_subscriptions").insert({
      despacho_id: despachoId,
      user_id: userId,
      plan_id: data.plan_id,
      billing_cycle: cycle,
      iva_included: data.include_iva,
      amount_mxn: total,
      mp_preapproval_id: result.id ?? null,
      mp_init_point: result.init_point,
      status: "pending",
    });

    return {
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point ?? null,
      preapproval_id: result.id ?? null,
    };
  });
