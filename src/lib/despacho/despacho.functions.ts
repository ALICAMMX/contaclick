import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

// Returns the active despacho for the signed-in user.
// If none exists (legacy user), creates one on demand and returns it.
export const getMyDespacho = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Try membership first
    const { data: mem } = await supabase
      .from("user_memberships")
      .select("despacho_id")
      .eq("user_id", userId)
      .eq("estado", "activo")
      .limit(1)
      .maybeSingle();

    if (mem?.despacho_id) {
      const { data: d } = await supabase
        .from("despachos")
        .select("id, nombre, rfc_despacho, estado, trial_ends_at, plan_id")
        .eq("id", mem.despacho_id)
        .maybeSingle();
      if (d) {
        return {
          despacho: {
            id: d.id as string,
            nombre: d.nombre as string,
            rfc_despacho: (d.rfc_despacho ?? null) as string | null,
            estado: d.estado as string,
            trial_ends_at: (d.trial_ends_at ?? null) as string | null,
            plan_id: (d.plan_id ?? null) as string | null,
          },
        };
      }
    }

    // Fallback: owner row (legacy)
    const { data: owned } = await supabase
      .from("despachos")
      .select("id, nombre, rfc_despacho, estado, trial_ends_at, plan_id")
      .eq("owner_user_id", userId)
      .limit(1)
      .maybeSingle();

    if (owned) {
      // Heal membership + role
      await supabase.from("user_memberships").upsert({ user_id: userId, despacho_id: owned.id, estado: "activo" });
      return {
        despacho: {
          id: owned.id as string,
          nombre: owned.nombre as string,
          rfc_despacho: (owned.rfc_despacho ?? null) as string | null,
          estado: owned.estado as string,
          trial_ends_at: (owned.trial_ends_at ?? null) as string | null,
          plan_id: (owned.plan_id ?? null) as string | null,
        },
      };
    }

    return { despacho: null as null };
  });

const CreateSchema = z.object({
  nombre: z.string().min(2).max(160),
  rfc_despacho: z.string().max(13).optional().nullable(),
});

export const createDespacho = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("despachos")
      .insert({
        nombre: data.nombre,
        rfc_despacho: data.rfc_despacho || null,
        owner_user_id: userId,
        estado: "trial",
        trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("user_memberships").insert({ user_id: userId, despacho_id: row.id, estado: "activo" });
    await supabase.from("user_roles").insert({ user_id: userId, despacho_id: row.id, role: "despacho" });
    return { id: row.id as string };
  });

export const updateDespacho = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      nombre: z.string().min(2).max(160),
      rfc_despacho: z.string().max(13).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("despachos")
      .update({ nombre: data.nombre, rfc_despacho: data.rfc_despacho || null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
