import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function resolveAdminDespacho(supabase: any, userId: string) {
  const { data: role } = await supabase
    .from("user_roles")
    .select("despacho_id")
    .eq("user_id", userId)
    .eq("role", "despacho")
    .limit(1)
    .maybeSingle();
  if (role?.despacho_id) return role.despacho_id as string;

  const { data: owned } = await supabase
    .from("despachos")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .maybeSingle();
  return (owned?.id as string | undefined) ?? null;
}

async function getMembersLimit(despachoId: string): Promise<number | null> {
  // Read plan from despacho. If no plan, default to trial=2.
  const { data: d } = await supabaseAdmin
    .from("despachos")
    .select("plan_id, estado")
    .eq("id", despachoId)
    .maybeSingle();
  if (d?.plan_id) {
    const { data: p } = await supabaseAdmin
      .from("planes")
      .select("limites")
      .eq("id", d.plan_id)
      .maybeSingle();
    const lim = (p?.limites as any)?.max_miembros;
    if (lim === null) return null;
    if (typeof lim === "number") return lim;
  }
  // Default by estado
  return d?.estado === "trial" ? 2 : 5;
}

export const listTeam = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveAdminDespacho(supabase, userId);
    if (!despachoId) return { members: [], invitations: [], limit: 0, isAdmin: false };

    // Members
    const { data: mems } = await supabaseAdmin
      .from("user_memberships")
      .select("user_id, estado, created_at, invited_by")
      .eq("despacho_id", despachoId)
      .eq("estado", "activo");

    const userIds = (mems ?? []).map((m) => m.user_id as string);
    const { data: profiles } = userIds.length
      ? await supabaseAdmin.from("profiles").select("id, email, full_name").in("id", userIds)
      : { data: [] as any[] };
    const { data: roles } = userIds.length
      ? await supabaseAdmin.from("user_roles").select("user_id, role").eq("despacho_id", despachoId).in("user_id", userIds)
      : { data: [] as any[] };

    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const roleMap = new Map((roles ?? []).map((r: any) => [r.user_id, r.role]));

    const members = (mems ?? []).map((m) => {
      const p = profileMap.get(m.user_id) as any;
      return {
        user_id: m.user_id as string,
        email: p?.email ?? null,
        full_name: p?.full_name ?? null,
        role: (roleMap.get(m.user_id) as string) ?? "colaborador",
        created_at: m.created_at as string,
        is_self: m.user_id === userId,
      };
    });

    // Invitations
    const { data: invs } = await supabase
      .from("invitaciones")
      .select("id, token, role, created_at, expires_at, used_at, revoked_at")
      .eq("despacho_id", despachoId)
      .order("created_at", { ascending: false });

    const limit = await getMembersLimit(despachoId);

    return {
      members,
      invitations: (invs ?? []) as any[],
      limit,
      despachoId,
      isAdmin: true,
    };
  });

export const createInvitation = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ role: z.enum(["colaborador"]).default("colaborador") }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveAdminDespacho(supabase, userId);
    if (!despachoId) throw new Error("No tienes un despacho administrado");

    // Check limit
    const limit = await getMembersLimit(despachoId);
    if (limit !== null) {
      const { count: memberCount } = await supabaseAdmin
        .from("user_memberships")
        .select("user_id", { count: "exact", head: true })
        .eq("despacho_id", despachoId)
        .eq("estado", "activo");
      const { count: pendingCount } = await supabaseAdmin
        .from("invitaciones")
        .select("id", { count: "exact", head: true })
        .eq("despacho_id", despachoId)
        .is("used_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString());
      const total = (memberCount ?? 0) + (pendingCount ?? 0);
      if (total >= limit) {
        throw new Error(`Tu plan permite máximo ${limit} miembros (incluye invitaciones pendientes). Mejora tu plan para invitar a más.`);
      }
    }

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const { data: row, error } = await supabase
      .from("invitaciones")
      .insert({ despacho_id: despachoId, token, role: data.role, created_by: userId })
      .select("id, token, expires_at")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string, token: row.token as string, expires_at: row.expires_at as string };
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("invitaciones")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.user_id === userId) throw new Error("No puedes removerte a ti mismo");
    const despachoId = await resolveAdminDespacho(supabase, userId);
    if (!despachoId) throw new Error("Sin despacho");

    // Don't allow removing the owner
    const { data: d } = await supabase.from("despachos").select("owner_user_id").eq("id", despachoId).single();
    if (d?.owner_user_id === data.user_id) throw new Error("No puedes remover al propietario");

    await supabase.from("user_memberships").delete().eq("despacho_id", despachoId).eq("user_id", data.user_id);
    await supabase.from("user_roles").delete().eq("despacho_id", despachoId).eq("user_id", data.user_id);
    return { ok: true };
  });

// Public-ish: read invitation by token (must be authenticated)
export const getInvitationByToken = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().min(8) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: inv } = await supabase
      .from("invitaciones")
      .select("id, despacho_id, role, expires_at, used_at, revoked_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) return { invitation: null };

    const { data: d } = await supabaseAdmin
      .from("despachos")
      .select("nombre")
      .eq("id", inv.despacho_id)
      .maybeSingle();

    return {
      invitation: {
        id: inv.id as string,
        despacho_id: inv.despacho_id as string,
        despacho_nombre: (d?.nombre as string | undefined) ?? "Despacho",
        role: inv.role as string,
        expires_at: inv.expires_at as string,
        used: !!inv.used_at,
        revoked: !!inv.revoked_at,
        expired: new Date(inv.expires_at as string) < new Date(),
      },
    };
  });

export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().min(8) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("accept_invitation", { _token: data.token });
    if (error) throw new Error(error.message);
    return { despacho_id: result as unknown as string };
  });
