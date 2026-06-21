// Helper to resolve the active despacho_id for a user, used by server functions
// that need to scope writes by tenant. Reuses membership-first, owner-fallback logic.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveActiveDespachoId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: mem } = await supabase
    .from("user_memberships")
    .select("despacho_id")
    .eq("user_id", userId)
    .eq("estado", "activo")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (mem?.despacho_id) return mem.despacho_id as string;

  const { data: owned } = await supabase
    .from("despachos")
    .select("id")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (owned?.id) return owned.id as string;

  throw new Error("No tienes un despacho activo. Crea o únete a un despacho primero.");
}
