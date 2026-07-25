import type { SupabaseClient } from "@supabase/supabase-js";

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function ensureDespacho(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data: m } = await supabase.from("user_memberships").select("despacho_id").eq("user_id", userId).limit(1).maybeSingle();
  if (m?.despacho_id) return m.despacho_id as string;
  const { data: d, error } = await supabase.from("despachos").insert({ nombre: "Mi despacho", owner_user_id: userId }).select("id").single();
  if (error || !d) throw new Error(`No se pudo crear despacho: ${error?.message}`);
  await supabase.from("user_memberships").insert({ user_id: userId, despacho_id: d.id });
  await supabase.from("user_roles").insert({ user_id: userId, role: "despacho", despacho_id: d.id });
  return d.id as string;
}

export async function ensureCuenta(
  supabase: SupabaseClient,
  args: { despachoId: string; clienteId: string; banco: string; alias?: string | null; mask?: string | null },
): Promise<string> {
  const { data: existing } = await supabase
    .from("cuentas_bancarias")
    .select("id")
    .eq("despacho_id", args.despachoId)
    .eq("cliente_id", args.clienteId)
    .eq("banco", args.banco)
    .eq("alias", args.alias ?? "Principal")
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await supabase
    .from("cuentas_bancarias")
    .insert({
      despacho_id: args.despachoId,
      cliente_id: args.clienteId,
      banco: args.banco,
      alias: args.alias ?? "Principal",
      numero_cuenta_mask: args.mask ?? null,
      moneda: "MXN",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`No se pudo crear cuenta: ${error?.message}`);
  return data.id as string;
}
