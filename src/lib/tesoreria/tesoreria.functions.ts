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

const BulkSchema = z.object({
  tipo: z.enum(["cxc", "cxp"]),
  rows: z.array(z.object({
    contraparte: z.string().min(1).max(200),
    concepto: z.string().max(500).optional().nullable(),
    monto: z.number().nonnegative(),
    moneda: z.string().default("MXN"),
    fecha_emision: z.string(),
    fecha_vencimiento: z.string(),
    estado: z.string().default("pendiente"),
  })).min(1).max(500),
});

export const bulkInsertCuentas = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => BulkSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despacho_id = await getDespachoId(supabase, userId);
    const table = data.tipo === "cxc" ? "cxc" : "cxp";
    const rows = data.rows.map((r) => ({
      despacho_id,
      contraparte: r.contraparte,
      concepto: r.concepto || null,
      monto: r.monto,
      moneda: r.moneda || "MXN",
      fecha_emision: r.fecha_emision,
      fecha_vencimiento: r.fecha_vencimiento,
      estado: r.estado,
      created_by: userId,
    }));
    const { error } = await supabase.from(table).insert(rows);
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });

export const seedDemoTesoreria = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despacho_id = await getDespachoId(supabase, userId);
    const today = new Date();
    const d = (offset: number) => {
      const x = new Date(today); x.setDate(x.getDate() + offset);
      return x.toISOString().slice(0, 10);
    };
    const cxc = [
      { contraparte: "Constructora Vega SA", concepto: "Factura A-1042", monto: 184200, fecha_emision: d(-15), fecha_vencimiento: d(3) },
      { contraparte: "Servicios Olmeca", concepto: "Honorarios septiembre", monto: 96800, fecha_emision: d(-5), fecha_vencimiento: d(12) },
      { contraparte: "Distribuidora Norte", concepto: "Factura B-209", monto: 62400, fecha_emision: d(-30), fecha_vencimiento: d(-4) },
      { contraparte: "Grupo Maya", concepto: "Proyecto Q3", monto: 240000, fecha_emision: d(-2), fecha_vencimiento: d(22) },
      { contraparte: "TecnoIndustrial SA", concepto: "Mantenimiento", monto: 38500, fecha_emision: d(-1), fecha_vencimiento: d(8) },
    ];
    const cxp = [
      { contraparte: "Insumos del Bajío", concepto: "Materia prima", monto: 78400, fecha_emision: d(-10), fecha_vencimiento: d(5) },
      { contraparte: "Renta oficina CDMX", concepto: "Mensualidad", monto: 42000, fecha_emision: d(-1), fecha_vencimiento: d(10) },
      { contraparte: "CFE", concepto: "Luz industrial", monto: 18900, fecha_emision: d(-3), fecha_vencimiento: d(15) },
      { contraparte: "Telmex Empresarial", concepto: "Internet + voz", monto: 6800, fecha_emision: d(-2), fecha_vencimiento: d(-1) },
      { contraparte: "Nómina quincenal", concepto: "1ra quincena", monto: 195000, fecha_emision: d(0), fecha_vencimiento: d(14) },
    ];
    const mk = (rows: any[]) => rows.map((r) => ({
      despacho_id, ...r, moneda: "MXN", estado: "pendiente", created_by: userId,
    }));
    await supabase.from("cxc").insert(mk(cxc));
    await supabase.from("cxp").insert(mk(cxp));
    return { cxc: cxc.length, cxp: cxp.length };
  });
