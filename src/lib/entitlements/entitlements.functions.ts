// Server functions del servicio de entitlements. El frontend SOLO lee de aquí:
// no recalcula planes, trials ni límites por su cuenta.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { z } from "zod";
import {
  cuotaAgotada,
  getEntitlements,
  limiteDe,
  usadoDe,
  type Entitlements,
  type Recurso,
} from "@/lib/entitlements/service";

async function despachoDelUsuario(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("user_memberships")
    .select("despacho_id")
    .eq("user_id", userId)
    .eq("estado", "activo")
    .limit(1)
    .maybeSingle();
  if (!data?.despacho_id) throw new Error("No perteneces a ningún despacho activo.");
  return data.despacho_id as string;
}

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .limit(1);
  if (!data?.length) throw new Error("Solo super-admin");
}

/** Entitlement completo de la cuenta del usuario en sesión. */
export const getMisEntitlements = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const despachoId = await despachoDelUsuario(context.supabase, context.userId);
    const ent = await getEntitlements(context.supabase, despachoId);
    return {
      ...ent,
      // Vista lista para pintar medidores sin lógica en el cliente.
      medidores: (["rfcs", "ia_requests", "ia_tokens", "sat_solicitudes"] as Recurso[]).map(
        (r) => ({
          recurso: r,
          usado: usadoDe(ent, r),
          limite: limiteDe(ent, r),
          agotado: cuotaAgotada(ent, r, 1),
          ilimitado: limiteDe(ent, r) < 0,
        }),
      ),
    } satisfies Entitlements & { medidores: unknown[] };
  });

/** ¿Puedo crear un expediente más? Alimenta el bloqueo del botón. */
export const puedeCrearExpediente = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const despachoId = await despachoDelUsuario(context.supabase, context.userId);
    const ent = await getEntitlements(context.supabase, despachoId);
    const limite = limiteDe(ent, "rfcs");
    const usado = usadoDe(ent, "rfcs");
    const bloqueado = !ent.acceso || cuotaAgotada(ent, "rfcs", 1);
    return {
      permitido: !bloqueado,
      usado,
      limite,
      ilimitado: limite < 0,
      motivo: !ent.acceso
        ? ent.motivo_bloqueo
        : bloqueado
          ? `Usas ${usado} de ${limite} RFC incluidos en tu plan ${ent.plan?.nombre ?? "de prueba"}.`
          : null,
    };
  });

// ---------------------------------------------------------------------
// Excepciones comerciales (cortesías) — sólo super-admin, siempre auditadas
// ---------------------------------------------------------------------

export const listarExcepciones = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("entitlement_excepciones")
      .select("*, despachos(nombre)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const crearExcepcion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        despacho_id: z.string().uuid(),
        tipo: z.enum([
          "limite_rfcs",
          "limite_ia_msgs",
          "limite_ia_tokens",
          "limite_sat_solicitudes",
          "frecuencia_sat",
          "trial_extension",
          "acceso_cortesia",
        ]),
        valor_num: z.number().int().nullable().optional(),
        valor_texto: z.string().max(60).nullable().optional(),
        motivo: z.string().min(10).max(500),
        dias_vigencia: z.number().int().min(1).max(365),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const expira = new Date(Date.now() + data.dias_vigencia * 86400000).toISOString();
    const { data: row, error } = await context.supabase
      .from("entitlement_excepciones")
      .insert({
        despacho_id: data.despacho_id,
        tipo: data.tipo,
        valor_num: data.valor_num ?? null,
        valor_texto: data.valor_texto ?? null,
        motivo: data.motivo,
        creado_por: context.userId,
        expira_at: expira,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // Extender el trial también mueve la fecha, para que no queden estados mixtos.
    if (data.tipo === "trial_extension") {
      await context.supabase
        .from("despachos")
        .update({ estado: "trial", trial_ends_at: expira })
        .eq("id", data.despacho_id)
        .is("plan_id", null);
    }
    return row;
  });

export const revocarExcepcion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), motivo: z.string().max(300).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("entitlement_excepciones")
      .update({
        revocada_at: new Date().toISOString(),
        revocada_por: context.userId,
        motivo: data.motivo ? `${data.motivo} (revocada)` : undefined,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Proceso idempotente de expiración de trials (ejecutable a demanda o por cron). */
export const expirarTrialsVencidos = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("expirar_trials");
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      vencidos: row?.vencidas ?? 0,
      normalizados: row?.normalizadas ?? 0,
    };
  });
