import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

export type AlertaItem = {
  id: string;
  nivel: "bajo" | "medio" | "alto";
  tipo: string;
  titulo: string;
  descripcion: string | null;
  cliente_id: string | null;
  cliente_nombre: string | null;
  created_at: string;
};

export const listAlertas = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: mem } = await supabase
      .from("user_memberships")
      .select("despacho_id")
      .eq("user_id", userId)
      .eq("estado", "activo")
      .limit(1)
      .maybeSingle();

    if (!mem?.despacho_id) return { alertas: [] as AlertaItem[], total: 0 };

    const { data, error } = await supabase
      .from("alertas")
      .select("id, nivel, tipo, titulo, descripcion, cliente_id, created_at, clientes(razon_social)")
      .eq("despacho_id", mem.despacho_id)
      .eq("estatus", "abierta")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw new Error(error.message);

    const alertas: AlertaItem[] = (data ?? []).map((r: any) => ({
      id: r.id,
      nivel: r.nivel,
      tipo: r.tipo,
      titulo: r.titulo,
      descripcion: r.descripcion ?? null,
      cliente_id: r.cliente_id ?? null,
      cliente_nombre: r.clientes?.razon_social ?? null,
      created_at: r.created_at,
    }));

    return { alertas, total: alertas.length };
  });

export const marcarAlertaLeida = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("alertas")
      .update({ estatus: "leida", resuelta_por: userId, resuelta_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const marcarTodasLeidas = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: mem } = await supabase
      .from("user_memberships")
      .select("despacho_id")
      .eq("user_id", userId)
      .eq("estado", "activo")
      .limit(1)
      .maybeSingle();
    if (!mem?.despacho_id) return { ok: true };
    const { error } = await supabase
      .from("alertas")
      .update({ estatus: "leida", resuelta_por: userId, resuelta_at: new Date().toISOString() })
      .eq("despacho_id", mem.despacho_id)
      .eq("estatus", "abierta");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
