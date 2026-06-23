import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { resolveActiveDespachoId } from "@/lib/despacho/resolve";
import { getPlanLimites, getUsoPeriodo, periodoActual } from "./limits";

export const getUsageSummary = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);
    const periodo = periodoActual();
    const [limites, uso, rfcs] = await Promise.all([
      getPlanLimites(supabase, despachoId),
      getUsoPeriodo(supabase, despachoId, periodo),
      supabase
        .from("rfcs")
        .select("id", { count: "exact", head: true })
        .eq("despacho_id", despachoId)
        .eq("vigente", true),
    ]);

    const next = new Date();
    next.setUTCMonth(next.getUTCMonth() + 1, 1);
    next.setUTCHours(0, 0, 0, 0);

    return {
      periodo,
      reset_at: next.toISOString(),
      plan: {
        rfcs: limites.rfcs,
        ia_msgs: limites.ia_msgs,
        ia_tokens: limites.ia_tokens ?? 0,
      },
      uso: {
        rfc_activos: rfcs.count ?? 0,
        ia_requests: uso.ia_requests,
        ia_tokens: uso.ia_tokens,
      },
    };
  });

export type UsageSummary = Awaited<ReturnType<typeof getUsageSummary>>;
