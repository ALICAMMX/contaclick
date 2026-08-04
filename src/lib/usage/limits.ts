// Capa de compatibilidad. Las reglas viven en @/lib/entitlements/service.
// Se conserva la firma histórica para no duplicar candados en los llamadores.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertPuedeConsumir,
  getEntitlements,
  getUso,
  periodoActual,
  type Limites,
  type Recurso,
} from "@/lib/entitlements/service";

export {
  UsageLimitError,
  AccesoBloqueadoError,
  labelRecurso,
  periodoActual,
  type Limites,
  type Recurso,
} from "@/lib/entitlements/service";

/** @deprecated Usa getEntitlements(): incluye estado, trial y excepciones. */
export async function getPlanLimites(
  supabase: SupabaseClient,
  despachoId: string,
): Promise<Limites> {
  return (await getEntitlements(supabase, despachoId)).limites;
}

export async function getUsoPeriodo(
  supabase: SupabaseClient,
  despachoId: string,
  periodo = periodoActual(),
) {
  const u = await getUso(supabase, despachoId, periodo);
  return { ...u, rfc_activos: u.rfcs };
}

/** Verifica acceso de la cuenta + cuota del recurso antes de ejecutar. */
export async function assertWithinLimit(
  supabase: SupabaseClient,
  despachoId: string,
  recurso: Recurso,
  incrementoPrevisto = 1,
) {
  await assertPuedeConsumir(supabase, despachoId, recurso, incrementoPrevisto);
}

/** Registra consumo de IA después de la llamada al gateway. */
export async function recordIaUsage(
  supabase: SupabaseClient,
  despachoId: string,
  userId: string,
  args: { tool: string; model: string; tokens_in: number; tokens_out: number },
) {
  const periodo = periodoActual();
  const totalTokens = (args.tokens_in || 0) + (args.tokens_out || 0);
  await supabase.rpc("incrementar_uso_ia", {
    _despacho: despachoId,
    _periodo: periodo,
    _requests: 1,
    _tokens: totalTokens,
  });
  await supabase.from("uso_eventos").insert({
    despacho_id: despachoId,
    user_id: userId,
    tipo: "ia_request",
    tool: args.tool,
    model: args.model,
    tokens_in: args.tokens_in,
    tokens_out: args.tokens_out,
  });
}
