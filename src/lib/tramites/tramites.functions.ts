import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

const ESTADOS = ["pendiente", "en_proceso", "esperando_autoridad", "resuelto"] as const;

async function getDespachoId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("user_memberships")
    .select("despacho_id")
    .eq("user_id", userId)
    .eq("estado", "activo")
    .limit(1)
    .maybeSingle();
  if (!data?.despacho_id) throw new Error("No tienes un despacho activo");
  return data.despacho_id as string;
}

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  cliente_id: z.string().uuid().optional().nullable(),
  titulo: z.string().min(1).max(200),
  descripcion: z.string().max(1000).optional().nullable(),
  autoridad: z.string().max(80).optional().nullable(),
  estado: z.enum(ESTADOS).default("pendiente"),
  fecha_vencimiento: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
});

export const listTramites = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despacho_id = await getDespachoId(supabase, userId);
    const { data, error } = await supabase
      .from("tramites")
      .select("id, cliente_id, titulo, descripcion, autoridad, estado, fecha_vencimiento, notas, orden, created_at")
      .eq("despacho_id", despacho_id)
      .order("estado")
      .order("orden");
    if (error) throw new Error(error.message);

    // Join cliente nombres
    const ids = Array.from(new Set((data ?? []).map((t: any) => t.cliente_id).filter(Boolean)));
    let clientes: Record<string, string> = {};
    if (ids.length) {
      const { data: cs } = await supabase.from("clientes").select("id, razon_social, rfc").in("id", ids);
      clientes = Object.fromEntries((cs ?? []).map((c: any) => [c.id, c.razon_social || c.rfc]));
    }
    return {
      tramites: (data ?? []).map((t: any) => ({ ...t, cliente_nombre: t.cliente_id ? clientes[t.cliente_id] ?? null : null })),
    };
  });

export const upsertTramite = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despacho_id = await getDespachoId(supabase, userId);
    const row = {
      despacho_id,
      cliente_id: data.cliente_id || null,
      titulo: data.titulo,
      descripcion: data.descripcion || null,
      autoridad: data.autoridad || null,
      estado: data.estado,
      fecha_vencimiento: data.fecha_vencimiento || null,
      notas: data.notas || null,
      created_by: userId,
    };
    if (data.id) {
      const { error } = await supabase.from("tramites").update(row).eq("id", data.id).eq("despacho_id", despacho_id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabase.from("tramites").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id as string };
  });

export const moveTramite = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), estado: z.enum(ESTADOS) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despacho_id = await getDespachoId(supabase, userId);
    const { error } = await supabase.from("tramites").update({ estado: data.estado }).eq("id", data.id).eq("despacho_id", despacho_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTramite = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despacho_id = await getDespachoId(supabase, userId);
    const { error } = await supabase.from("tramites").delete().eq("id", data.id).eq("despacho_id", despacho_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listClientesLite = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despacho_id = await getDespachoId(supabase, userId);
    const { data } = await supabase
      .from("clientes")
      .select("id, rfc, razon_social")
      .eq("despacho_id", despacho_id)
      .order("razon_social");
    return { clientes: data ?? [] };
  });
