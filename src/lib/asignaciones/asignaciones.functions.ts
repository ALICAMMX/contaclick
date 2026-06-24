import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Candado #10 — Permisos por expediente.
 * Cuando `despachos.acceso_restringido = true`, los colaboradores SOLO ven los
 * expedientes que se les asignan explícitamente en `cliente_asignaciones`.
 * El propietario y los miembros con rol "despacho" (admin) siempre ven todo.
 */

async function resolveAdminDespacho(supabase: any, userId: string) {
  const { data: role } = await supabase
    .from("user_roles").select("despacho_id")
    .eq("user_id", userId).eq("role", "despacho").limit(1).maybeSingle();
  if (role?.despacho_id) return role.despacho_id as string;
  const { data: owned } = await supabase
    .from("despachos").select("id").eq("owner_user_id", userId).limit(1).maybeSingle();
  return (owned?.id as string | undefined) ?? null;
}

export const getAccesoConfig = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveAdminDespacho(supabase, userId);
    if (!despachoId) return { despachoId: null, accesoRestringido: false, isAdmin: false };
    const { data } = await supabase.from("despachos").select("acceso_restringido").eq("id", despachoId).maybeSingle();
    return {
      despachoId,
      accesoRestringido: !!data?.acceso_restringido,
      isAdmin: true,
    };
  });

export const toggleAccesoRestringido = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveAdminDespacho(supabase, userId);
    if (!despachoId) throw new Error("Sin despacho administrado");
    const { error } = await supabase
      .from("despachos").update({ acceso_restringido: data.enabled }).eq("id", despachoId);
    if (error) throw new Error(error.message);
    return { ok: true, accesoRestringido: data.enabled };
  });

export const listAsignaciones = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveAdminDespacho(supabase, userId);
    if (!despachoId) return { asignaciones: [], clientes: [], miembros: [] };

    const [{ data: asig }, { data: cli }, { data: mems }] = await Promise.all([
      supabase.from("cliente_asignaciones").select("id, cliente_id, user_id").eq("despacho_id", despachoId),
      supabase.from("clientes").select("id, rfc, razon_social").eq("despacho_id", despachoId)
        .eq("tipo_relacion", "cliente").is("cliente_padre_id", null).order("razon_social"),
      supabaseAdmin.from("user_memberships").select("user_id").eq("despacho_id", despachoId).eq("estado", "activo"),
    ]);
    const userIds = (mems ?? []).map((m: any) => m.user_id as string);
    const { data: profiles } = userIds.length
      ? await supabaseAdmin.from("profiles").select("id, email, full_name").in("id", userIds)
      : { data: [] as any[] };
    const { data: roles } = userIds.length
      ? await supabaseAdmin.from("user_roles").select("user_id, role").eq("despacho_id", despachoId).in("user_id", userIds)
      : { data: [] as any[] };
    const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const roleMap = new Map((roles ?? []).map((r: any) => [r.user_id, r.role]));
    const miembros = (mems ?? []).map((m: any) => ({
      user_id: m.user_id as string,
      email: (profMap.get(m.user_id) as any)?.email ?? null,
      full_name: (profMap.get(m.user_id) as any)?.full_name ?? null,
      role: (roleMap.get(m.user_id) as string) ?? "colaborador",
    }));

    return {
      asignaciones: (asig ?? []) as { id: string; cliente_id: string; user_id: string }[],
      clientes: (cli ?? []) as { id: string; rfc: string; razon_social: string }[],
      miembros,
    };
  });

export const setAsignacion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      cliente_id: z.string().uuid(),
      assigned: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveAdminDespacho(supabase, userId);
    if (!despachoId) throw new Error("Sin despacho administrado");

    // Verificar que el cliente pertenece al despacho del admin
    const { data: cli } = await supabase.from("clientes")
      .select("id, despacho_id").eq("id", data.cliente_id).maybeSingle();
    if (!cli || cli.despacho_id !== despachoId) throw new Error("El expediente no pertenece a tu despacho");

    if (data.assigned) {
      const { error } = await supabase.from("cliente_asignaciones").insert({
        despacho_id: despachoId,
        cliente_id: data.cliente_id,
        user_id: data.user_id,
        created_by: userId,
      });
      if (error && !String(error.message).includes("duplicate")) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("cliente_asignaciones")
        .delete().eq("cliente_id", data.cliente_id).eq("user_id", data.user_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
