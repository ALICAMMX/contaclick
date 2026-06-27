import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { resolveActiveDespachoId } from "@/lib/despacho/resolve";
import { isValidPlan, isValidCycle } from "./plans";

const ValidateInput = z.object({
  codigo: z.string().trim().min(2).max(64),
  plan_id: z.string().refine(isValidPlan),
  billing_cycle: z.string().refine(isValidCycle),
});

export const validarCupon = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => ValidateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);
    const { data: row, error } = await supabase
      .rpc("validar_cupon", {
        _codigo: data.codigo,
        _plan_id: data.plan_id,
        _cycle: data.billing_cycle,
        _despacho: despachoId,
      })
      .maybeSingle();
    if (error) throw new Error(error.message);
    const r = row as { valido: boolean; motivo: string; cupon_id: string | null; porcentaje: number | null } | null;
    if (!r) return { valido: false, motivo: "Sin respuesta", porcentaje: 0 };
    return {
      valido: r.valido,
      motivo: r.motivo,
      cupon_id: r.cupon_id ?? undefined,
      porcentaje: Number(r.porcentaje ?? 0),
    };
  });
