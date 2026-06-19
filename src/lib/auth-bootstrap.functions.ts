import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BootstrapSchema = z.object({
  fullName: z.string().max(220).optional().nullable(),
  despachoNombre: z.string().max(180).optional().nullable(),
});

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

    const { data: membership } = await supabaseAdmin
      .from("user_memberships")
      .select("despacho_id")
      .eq("user_id", userId)
      .eq("estado", "activo")
      .limit(1)
      .maybeSingle();

    let despachoId = membership?.despacho_id ?? null;

    if (!despachoId) {
      const { data: owned } = await supabaseAdmin
        .from("despachos")
        .select("id")
        .eq("owner_user_id", userId)
        .limit(1)
        .maybeSingle();

      despachoId = owned?.id ?? null;
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