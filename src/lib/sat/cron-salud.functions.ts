// Panel super-admin: salud del proceso automático (cron) de Descarga Masiva SAT.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { evaluarSaludCron } from "@/lib/sat/cron-salud";
import { CRON_SAT_VERSION } from "@/lib/sat/cron-version";

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .limit(1);
  if (!data?.length) throw new Error("Solo super-admin");
}

export const getSatCronSalud = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const supabase = context.supabase;

    const { data: ultimas } = await supabase
      .from("sat_cron_heartbeat")
      .select(
        "id, inicio_at, fin_at, duracion_ms, http_status, version, runs_revisados, runs_saneados, runs_reencauzados, solicitudes_consultadas, paquetes_descargados, corridas_iniciadas, ok, error",
      )
      .order("inicio_at", { ascending: false })
      .limit(12);

    const lista = ultimas ?? [];
    const ultimoExito = lista.find((h: any) => h.ok)?.inicio_at ?? null;
    const salud = evaluarSaludCron(ultimoExito);
    const ultimoError = lista.find((h: any) => !h.ok && h.error)?.error ?? null;
    const versionDesplegada = lista[0]?.version ?? null;

    return {
      salud,
      ultimo_exito: ultimoExito,
      ultimo_error: ultimoError,
      version_esperada: CRON_SAT_VERSION,
      version_desplegada: versionDesplegada,
      version_al_dia: versionDesplegada === null ? null : versionDesplegada === CRON_SAT_VERSION,
      ejecuciones: lista,
    };
  });
