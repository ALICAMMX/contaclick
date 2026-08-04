import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { resolveActiveDespachoId } from "@/lib/despacho/resolve";
import { getEntitlements, periodoActual } from "@/lib/entitlements/service";

export const getUsageSummary = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);

    // Fuente única de verdad: límites efectivos (plan + excepciones) y uso real,
    // que ya excluye los expedientes demo/showroom.
    const ent = await getEntitlements(supabase, despachoId);

    const next = new Date();
    next.setUTCMonth(next.getUTCMonth() + 1, 1);
    next.setUTCHours(0, 0, 0, 0);

    return {
      periodo: ent.periodo,
      reset_at: next.toISOString(),
      estado: ent.estado,
      acceso: ent.acceso,
      plan_nombre: ent.plan?.nombre ?? "Prueba gratuita",
      trial_dias: ent.trial?.dias_restantes ?? null,
      excepciones: ent.excepciones.map((e) => ({
        tipo: e.tipo,
        motivo: e.motivo,
        expira_at: e.expira_at,
      })),
      plan: {
        rfcs: ent.limites.rfcs,
        ia_msgs: ent.limites.ia_msgs,
        ia_tokens: ent.limites.ia_tokens ?? 0,
        sat_solicitudes_mes: ent.limites.sat_solicitudes_mes ?? 0,
        sat_frecuencia_max: ent.limites.sat_frecuencia_max ?? "diaria",
      },
      uso: {
        rfc_activos: ent.uso.rfcs,
        ia_requests: ent.uso.ia_requests,
        ia_tokens: ent.uso.ia_tokens,
        sat_solicitudes: ent.uso.sat_solicitudes,
        sat_costo_centavos: ent.uso.sat_costo_centavos,
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

