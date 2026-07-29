// Helpers de límites de consumo (RFC + IA) por despacho.
// Se llaman desde server functions (sendChat, createCliente, etc.).
// No son serverFns: reciben el cliente Supabase autenticado del caller.

import type { SupabaseClient } from "@supabase/supabase-js";

export type Recurso = "ia_requests" | "ia_tokens" | "rfcs" | "sat_solicitudes";

export interface Limites {
  rfcs: number;
  ia_msgs: number;
  ia_tokens?: number;
  xml_mes?: number;
  clientes?: number;
  sat_solicitudes_mes?: number;
  sat_frecuencia_max?: "manual" | "mensual" | "semanal" | "diaria";
}


export class UsageLimitError extends Error {
  recurso: Recurso;
  limite: number;
  usado: number;
  constructor(recurso: Recurso, usado: number, limite: number) {
    super(
      `Alcanzaste el límite de tu plan (${labelRecurso(recurso)}: ${usado}/${limite}). ` +
        `Mejora tu plan o espera al siguiente ciclo.`,
    );
    this.recurso = recurso;
    this.limite = limite;
    this.usado = usado;
  }
}

export function labelRecurso(r: Recurso): string {
  if (r === "ia_requests") return "Solicitudes IA";
  if (r === "ia_tokens") return "Tokens IA";
  if (r === "sat_solicitudes") return "Descargas SAT";
  return "RFCs activos";
}


export function periodoActual(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// Default = plan Profesional (lo que se otorga durante el trial de 14 días,
// alineado con la página /precios y los candados conservadores de PAC SAT).
const DEFAULT_LIMITS: Limites = { rfcs: 25, ia_msgs: 1500, ia_tokens: 5_000_000, sat_solicitudes_mes: 1000, sat_frecuencia_max: "diaria" };

export async function getPlanLimites(
  supabase: SupabaseClient,
  despachoId: string,
): Promise<Limites> {
  const { data } = await supabase
    .from("despachos")
    .select("plan_id, limites_override, planes(limites)")
    .eq("id", despachoId)
    .maybeSingle();
  const lim = (data as any)?.planes?.limites as Limites | undefined;
  const override = (data as any)?.limites_override as Partial<Limites> | null | undefined;
  return { ...DEFAULT_LIMITS, ...(lim ?? {}), ...(override ?? {}) };
}

export async function getUsoPeriodo(
  supabase: SupabaseClient,
  despachoId: string,
  periodo = periodoActual(),
) {
  const { data } = await supabase
    .from("uso_periodo")
    .select("ia_requests, ia_tokens, rfc_activos, sat_solicitudes, sat_costo_centavos")
    .eq("despacho_id", despachoId)
    .eq("periodo", periodo)
    .maybeSingle();
  return {
    ia_requests: data?.ia_requests ?? 0,
    ia_tokens: Number(data?.ia_tokens ?? 0),
    rfc_activos: data?.rfc_activos ?? 0,
    sat_solicitudes: (data as any)?.sat_solicitudes ?? 0,
    sat_costo_centavos: Number((data as any)?.sat_costo_centavos ?? 0),
  };
}


/**
 * Verifica límite ANTES de ejecutar la operación.
 * Crea aviso al cruzar 80% y al cruzar 100%; bloquea al 100%.
 */
export async function assertWithinLimit(
  supabase: SupabaseClient,
  despachoId: string,
  recurso: Recurso,
  incrementoPrevisto = 1,
) {
  const limites = await getPlanLimites(supabase, despachoId);
  let limite = 0;
  let usado = 0;
  const periodo = periodoActual();

  if (recurso === "ia_requests") {
    limite = limites.ia_msgs;
    const uso = await getUsoPeriodo(supabase, despachoId, periodo);
    usado = uso.ia_requests;
  } else if (recurso === "ia_tokens") {
    limite = limites.ia_tokens ?? 0;
    if (!limite) return; // sin límite configurado
    const uso = await getUsoPeriodo(supabase, despachoId, periodo);
    usado = uso.ia_tokens;
  } else if (recurso === "rfcs") {
    limite = limites.rfcs;
    const { count } = await supabase
      .from("clientes")
      .select("id", { count: "exact", head: true })
      .eq("despacho_id", despachoId)
      .eq("tipo_relacion", "cliente");
    usado = count ?? 0;
  } else if (recurso === "sat_solicitudes") {
    limite = limites.sat_solicitudes_mes ?? 0;
    if (limite < 0) return; // -1 = ilimitado (Enterprise)
    if (limite === 0) return;
    const uso = await getUsoPeriodo(supabase, despachoId, periodo);
    usado = uso.sat_solicitudes;
  }


  if (limite <= 0) return;

  const proyectado = usado + incrementoPrevisto;
  const pct = (proyectado / limite) * 100;

  if (pct >= 80 && pct < 100) {
    await emitirAvisoUso(supabase, despachoId, recurso, periodo, "80", usado, limite);
  }

  if (proyectado > limite) {
    await emitirAvisoUso(supabase, despachoId, recurso, periodo, "100", usado, limite);
    throw new UsageLimitError(recurso, usado, limite);
  }
}

async function emitirAvisoUso(
  supabase: SupabaseClient,
  despachoId: string,
  recurso: Recurso,
  periodo: string,
  umbral: "80" | "100",
  usado: number,
  limite: number,
) {
  const nivel = umbral === "100" ? "alto" : "medio";
  const titulo =
    umbral === "100"
      ? `Límite alcanzado: ${labelRecurso(recurso)}`
      : `Estás cerca del límite: ${labelRecurso(recurso)}`;
  const descripcion =
    umbral === "100"
      ? `Tu plan permite ${limite} ${labelRecurso(recurso)} y ya usaste ${usado}. ` +
        `Mejora tu plan o espera al siguiente ciclo.`
      : `Has usado ${usado} de ${limite} ${labelRecurso(recurso)} este mes (${Math.round(
          (usado / limite) * 100,
        )}%).`;

  // Upsert idempotente vía índice único parcial sobre (despacho, tipo, recurso, periodo, umbral)
  await supabase.from("alertas").insert({
    despacho_id: despachoId,
    tipo: "uso_limite",
    nivel,
    titulo,
    descripcion,
    recomendacion: "Mejora tu plan en /precios o ajusta el uso del mes.",
    accion_sugerida: "Ver planes",
    evidencia: { recurso, periodo, umbral, usado, limite },
  });
  // ignoramos error de unique violation (ya existe el aviso de este umbral)
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
