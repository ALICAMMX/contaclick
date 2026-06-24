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
        .from("clientes")
        .select("id", { count: "exact", head: true })
        .eq("despacho_id", despachoId)
        .eq("tipo_relacion", "cliente"),
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

export const getUsageHistory = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);
    // Construye lista de los últimos 6 periodos (YYYY-MM)
    const periodos: string[] = [];
    const d = new Date();
    d.setUTCDate(1);
    for (let i = 0; i < 6; i++) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      periodos.push(`${y}-${m}`);
      d.setUTCMonth(d.getUTCMonth() - 1);
    }
    const { data } = await supabase
      .from("uso_periodo")
      .select("periodo, ia_requests, ia_tokens, rfc_activos")
      .eq("despacho_id", despachoId)
      .in("periodo", periodos);
    const map = new Map<string, any>();
    (data ?? []).forEach((r: any) => map.set(r.periodo, r));
    const limites = await getPlanLimites(supabase, despachoId);
    return {
      plan: { rfcs: limites.rfcs, ia_msgs: limites.ia_msgs, ia_tokens: limites.ia_tokens ?? 0 },
      historial: periodos.map((p) => ({
        periodo: p,
        ia_requests: map.get(p)?.ia_requests ?? 0,
        ia_tokens: Number(map.get(p)?.ia_tokens ?? 0),
        rfc_activos: map.get(p)?.rfc_activos ?? 0,
      })),
    };
  });

