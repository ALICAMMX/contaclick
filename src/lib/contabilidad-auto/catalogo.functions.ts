import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { PLANTILLA_IMCP_PM } from "./imcp-catalog";


// Catálogo SAT base (Anexo 24) — sembrado inicial editable por cliente
const SEED: Array<{ codigo: string; nombre: string; naturaleza: "deudora" | "acreedora"; tipo_sat: string }> = [
  { codigo: "102-01", nombre: "Bancos", naturaleza: "deudora", tipo_sat: "102.01" },
  { codigo: "105-01", nombre: "Clientes", naturaleza: "deudora", tipo_sat: "105.01" },
  { codigo: "113-01", nombre: "IVA acreditable pagado", naturaleza: "deudora", tipo_sat: "113.01" },
  { codigo: "115-01", nombre: "Inventarios / Compras", naturaleza: "deudora", tipo_sat: "115.01" },
  { codigo: "118-01", nombre: "IVA acreditable pendiente", naturaleza: "deudora", tipo_sat: "118.01" },
  { codigo: "118-02", nombre: "IVA retenido por terceros", naturaleza: "deudora", tipo_sat: "118.02" },
  { codigo: "120-01", nombre: "ISR retenido por terceros", naturaleza: "deudora", tipo_sat: "120.01" },
  { codigo: "201-01", nombre: "Proveedores", naturaleza: "acreedora", tipo_sat: "201.01" },
  { codigo: "208-01", nombre: "IVA trasladado pendiente", naturaleza: "acreedora", tipo_sat: "208.01" },
  { codigo: "208-02", nombre: "IEPS trasladado pendiente", naturaleza: "acreedora", tipo_sat: "208.02" },
  { codigo: "209-01", nombre: "IVA trasladado cobrado", naturaleza: "acreedora", tipo_sat: "209.01" },
  { codigo: "213-01", nombre: "IMSS / Provisiones sociales", naturaleza: "acreedora", tipo_sat: "213.01" },
  { codigo: "216-01", nombre: "ISR retenciones por enterar", naturaleza: "acreedora", tipo_sat: "216.01" },
  { codigo: "216-02", nombre: "IVA retenciones por enterar", naturaleza: "acreedora", tipo_sat: "216.02" },
  { codigo: "216-03", nombre: "ISR nómina por enterar", naturaleza: "acreedora", tipo_sat: "216.03" },
  { codigo: "401-01", nombre: "Ingresos", naturaleza: "acreedora", tipo_sat: "401.01" },
  { codigo: "402-01", nombre: "Devoluciones sobre ventas", naturaleza: "deudora", tipo_sat: "402.01" },
  { codigo: "601-01", nombre: "Gastos generales", naturaleza: "deudora", tipo_sat: "601.01" },
  { codigo: "601-02", nombre: "Sueldos y salarios", naturaleza: "deudora", tipo_sat: "601.02" },
];

async function getClienteDespacho(supabase: any, cliente_id: string) {
  const { data, error } = await supabase.from("clientes").select("id, despacho_id").eq("id", cliente_id).maybeSingle();
  if (error || !data) throw new Error("Cliente no encontrado");
  return data as { id: string; despacho_id: string };
}

// ===== Catálogo =====
export const listarCatalogo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("catalogo_cuentas")
      .select("*")
      .eq("cliente_id", data.cliente_id)
      .order("codigo");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const sembrarCatalogo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cli = await getClienteDespacho(supabase, data.cliente_id);
    const rows = SEED.map((s) => ({
      id: crypto.randomUUID(),
      cliente_id: data.cliente_id,
      despacho_id: cli.despacho_id,
      activa: true,
      created_by: userId,
      ...s,
    }));
    // upsert por (cliente_id, codigo)
    const { error } = await supabase.from("catalogo_cuentas").upsert(rows, { onConflict: "cliente_id,codigo", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { sembradas: rows.length };
  });

// Plantilla IMCP (PM régimen general) — usa códigos agrupadores oficiales SAT Anexo 24.
export const sembrarCatalogoIMCP = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cli = await getClienteDespacho(supabase, data.cliente_id);
    const rows = PLANTILLA_IMCP_PM.map((c) => ({
      id: crypto.randomUUID(),
      cliente_id: data.cliente_id,
      despacho_id: cli.despacho_id,
      codigo: c.codigo,
      nombre: c.nombre,
      naturaleza: c.naturaleza === "D" ? "deudora" : "acreedora",
      tipo_sat: c.agrupador_sat,
      activa: true,
      created_by: userId,
    }));
    const { error } = await supabase
      .from("catalogo_cuentas")
      .upsert(rows, { onConflict: "cliente_id,codigo", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { sembradas: rows.length, plantilla: "IMCP PM Régimen General" };
  });


export const upsertCuenta = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      cliente_id: z.string().uuid(),
      codigo: z.string().min(1).max(40),
      nombre: z.string().min(1).max(200),
      naturaleza: z.enum(["deudora", "acreedora"]),
      tipo_sat: z.string().max(20).optional().nullable(),
      activa: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cli = await getClienteDespacho(supabase, data.cliente_id);
    const payload: any = {
      id: data.id ?? crypto.randomUUID(),
      cliente_id: data.cliente_id,
      despacho_id: cli.despacho_id,
      codigo: data.codigo,
      nombre: data.nombre,
      naturaleza: data.naturaleza,
      tipo_sat: data.tipo_sat ?? null,
      activa: data.activa,
      created_by: userId,
    };
    const { error } = await supabase.from("catalogo_cuentas").upsert(payload, { onConflict: "cliente_id,codigo" });
    if (error) throw new Error(error.message);
    return { id: payload.id };
  });

export const eliminarCuenta = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("catalogo_cuentas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Reglas =====
export const listarReglas = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("reglas_contables")
      .select("*")
      .eq("cliente_id", data.cliente_id)
      .order("prioridad", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertRegla = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      cliente_id: z.string().uuid(),
      nombre: z.string().min(1).max(200),
      prioridad: z.number().int().min(0).max(1000).default(100),
      condicion: z.object({
        tipo_cfdi: z.string().optional().nullable(),
        rfc_emisor: z.string().optional().nullable(),
        rfc_receptor: z.string().optional().nullable(),
        keyword: z.string().optional().nullable(),
        min_monto: z.number().optional().nullable(),
        max_monto: z.number().optional().nullable(),
      }),
      cuenta_cargo: z.string().min(1).max(40),
      cuenta_abono: z.string().min(1).max(40),
      activa: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cli = await getClienteDespacho(supabase, data.cliente_id);
    const payload: any = {
      id: data.id ?? crypto.randomUUID(),
      cliente_id: data.cliente_id,
      despacho_id: cli.despacho_id,
      nombre: data.nombre,
      prioridad: data.prioridad,
      condicion: data.condicion,
      cuenta_cargo: data.cuenta_cargo,
      cuenta_abono: data.cuenta_abono,
      activa: data.activa,
      origen: "manual",
      created_by: userId,
    };
    const { error } = await supabase.from("reglas_contables").upsert(payload);
    if (error) throw new Error(error.message);
    return { id: payload.id };
  });

export const eliminarRegla = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("reglas_contables").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
