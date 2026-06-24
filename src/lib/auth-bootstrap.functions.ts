import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BootstrapSchema = z.object({
  fullName: z.string().max(220).optional().nullable(),
  despachoNombre: z.string().max(180).optional().nullable(),
});

function normalizeInvitedRole(role: string | null | undefined) {
  if (
    role === "contador" ||
    role === "auxiliar" ||
    role === "colaborador" ||
    role === "cliente_final"
  )
    return role;
  return "colaborador";
}

export const ensureUserWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => BootstrapSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const { data: authUser, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userError || !authUser.user) throw new Error("No se pudo validar tu usuario.");

    const metadata = authUser.user.user_metadata ?? {};
    const email = authUser.user.email ?? null;
    const fullName =
      data.fullName?.trim() ||
      (typeof metadata.full_name === "string" ? metadata.full_name : "") ||
      (typeof metadata.name === "string" ? metadata.name : "") ||
      email?.split("@")[0] ||
      "Usuario";
    const despachoNombre =
      data.despachoNombre?.trim() ||
      (typeof metadata.despacho_nombre === "string" ? metadata.despacho_nombre : "") ||
      fullName ||
      "Mi Despacho";

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email,
      full_name: fullName,
      despacho_nombre: despachoNombre,
    });
    if (profileError) throw new Error(profileError.message);

    // Vinculación automática por invitación pendiente: si el correo fue invitado,
    // primero lo unimos al despacho del administrador y NO lo promovemos a admin.
    if (email) {
      const { data: pendingInvites, error: inviteError } = await supabaseAdmin
        .from("invitaciones")
        .select("id, despacho_id, role, created_by, cliente_id")
        .ilike("email", email)
        .is("used_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString());
      if (inviteError) throw new Error(inviteError.message);

      for (const inv of pendingInvites ?? []) {
        const { error: membershipError } = await supabaseAdmin.from("user_memberships").upsert(
          {
            user_id: userId,
            despacho_id: inv.despacho_id,
            estado: "activo",
            invited_by: inv.created_by,
          },
          { onConflict: "user_id,despacho_id" },
        );
        if (membershipError) throw new Error(membershipError.message);

        const normalizedRole = normalizeInvitedRole(inv.role);
        const isClienteFinal = normalizedRole === "cliente_final";

        const { error: roleError } = await supabaseAdmin.from("user_roles").upsert(
          {
            user_id: userId,
            despacho_id: inv.despacho_id,
            role: normalizedRole,
            cliente_id: isClienteFinal ? inv.cliente_id : null,
          },
          { onConflict: "user_id,role,despacho_id,cliente_id" },
        );
        if (roleError) throw new Error(roleError.message);

        if (isClienteFinal && inv.cliente_id) {
          const { error: asigError } = await supabaseAdmin
            .from("cliente_asignaciones")
            .upsert(
              {
                despacho_id: inv.despacho_id,
                cliente_id: inv.cliente_id,
                user_id: userId,
                created_by: inv.created_by,
              },
              { onConflict: "cliente_id,user_id" },
            );
          if (asigError) throw new Error(asigError.message);

          const { error: portalCfgError } = await supabaseAdmin
            .from("cliente_portal_config")
            .upsert(
              { cliente_id: inv.cliente_id, despacho_id: inv.despacho_id },
              { onConflict: "cliente_id" },
            );
          if (portalCfgError) throw new Error(portalCfgError.message);
        }

        const { error: usedError } = await supabaseAdmin
          .from("invitaciones")
          .update({ used_at: new Date().toISOString(), used_by: userId })
          .eq("id", inv.id);
        if (usedError) throw new Error(usedError.message);
      }
    }

    const { data: invitedMembership } = await supabaseAdmin
      .from("user_memberships")
      .select("despacho_id")
      .eq("user_id", userId)
      .eq("estado", "activo")
      .not("invited_by", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (invitedMembership?.despacho_id) {
      return { ok: true, despachoId: invitedMembership.despacho_id };
    }

    const { data: membership } = await supabaseAdmin
      .from("user_memberships")
      .select("despacho_id")
      .eq("user_id", userId)
      .eq("estado", "activo")
      .limit(1)
      .maybeSingle();

    let despachoId = membership?.despacho_id ?? null;
    let shouldEnsureAdminRole = false;

    if (!despachoId) {
      const { data: owned } = await supabaseAdmin
        .from("despachos")
        .select("id")
        .eq("owner_user_id", userId)
        .limit(1)
        .maybeSingle();

      despachoId = owned?.id ?? null;
      shouldEnsureAdminRole = !!despachoId;
    }

    if (!despachoId) {
      const { data: despacho, error: despachoError } = await supabaseAdmin
        .from("despachos")
        .insert({
          nombre: despachoNombre,
          owner_user_id: userId,
          estado: "trial",
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select("id")
        .single();

      if (despachoError) throw new Error(despachoError.message);
      despachoId = despacho.id;
      shouldEnsureAdminRole = true;
    }

    const { error: membershipError } = await supabaseAdmin.from("user_memberships").upsert(
      {
        user_id: userId,
        despacho_id: despachoId,
        estado: "activo",
      },
      { onConflict: "user_id,despacho_id" },
    );
    if (membershipError) throw new Error(membershipError.message);

    if (!shouldEnsureAdminRole) {
      const { data: ownedCheck } = await supabaseAdmin
        .from("despachos")
        .select("id")
        .eq("id", despachoId)
        .eq("owner_user_id", userId)
        .maybeSingle();
      shouldEnsureAdminRole = !!ownedCheck;
    }

    if (!shouldEnsureAdminRole) {
      return { ok: true, despachoId };
    }

    const { data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("despacho_id", despachoId)
      .eq("role", "despacho")
      .limit(1)
      .maybeSingle();

    if (!existingRole) {
      const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
        user_id: userId,
        despacho_id: despachoId,
        role: "despacho",
      });
      if (roleError) throw new Error(roleError.message);
    }

    return { ok: true, despachoId };
  });