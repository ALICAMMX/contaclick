import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

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
  tipo: z.enum(["cxc", "cxp"]),
  cliente_id: z.string().uuid().optional().nullable(),
  contraparte: z.string().min(1).max(200),
  concepto: z.string().max(500).optional().nullable(),
  monto: z.number().nonnegative(),
  moneda: z.string().default("MXN"),
  fecha_emision: z.string(),
  fecha_vencimiento: z.string(),
  estado: z.string().default("pendiente"),
  notas: z.string().optional().nullable(),
});

export const listTesoreria = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despacho_id = await getDespachoId(supabase, userId);
    const [{ data: cxc }, { data: cxp }] = await Promise.all([
      supabase.from("cxc").select("*").eq("despacho_id", despacho_id).order("fecha_vencimiento", { ascending: true }),
      supabase.from("cxp").select("*").eq("despacho_id", despacho_id).order("fecha_vencimiento", { ascending: true }),
    ]);
    return { cxc: cxc ?? [], cxp: cxp ?? [] };
  });

export const upsertCuenta = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despacho_id = await getDespachoId(supabase, userId);
    const table = data.tipo === "cxc" ? "cxc" : "cxp";
    const row = {
      despacho_id,
      cliente_id: data.cliente_id || null,
      contraparte: data.contraparte,
      concepto: data.concepto || null,
      monto: data.monto,
      moneda: data.moneda || "MXN",
      fecha_emision: data.fecha_emision,
      fecha_vencimiento: data.fecha_vencimiento,
      estado: data.estado,
      notas: data.notas || null,
      created_by: userId,
    };
    if (data.id) {
      const { error } = await supabase.from(table).update(row).eq("id", data.id).eq("despacho_id", despacho_id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    } else {
      const { data: ins, error } = await supabase.from(table).insert(row).select("id").single();
      if (error) throw new Error(error.message);
      return { id: ins.id as string };
    }
  });

export const deleteCuenta = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), tipo: z.enum(["cxc", "cxp"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despacho_id = await getDespachoId(supabase, userId);
    const table = data.tipo === "cxc" ? "cxc" : "cxp";
    const { error } = await supabase.from(table).delete().eq("id", data.id).eq("despacho_id", despacho_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
