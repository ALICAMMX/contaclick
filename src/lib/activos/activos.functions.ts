import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

const CATEGORIAS = [
  "edificio", "mobiliario", "equipo_computo", "equipo_oficina",
  "vehiculo_transporte", "equipo_comunicaciones", "maquinaria",
  "herramientas", "intangible", "otro",
] as const;
const ESTADOS = ["activo", "baja", "vendido", "siniestro"] as const;

async function getDespachoId(supabase: any): Promise<string> {
  const { data } = await supabase.from("user_memberships").select("despacho_id").eq("estado", "activo").limit(1);
  if (!data?.length) throw new Error("Sin despacho asignado");
  return data[0].despacho_id;
}

// Tasas LISR Art. 33-34 (% anual)
export const TASAS_SUGERIDAS: Record<string, { fiscal: number; contable: number; label: string }> = {
  edificio: { fiscal: 5, contable: 5, label: "Edificios (5%)" },
  mobiliario: { fiscal: 10, contable: 10, label: "Mobiliario y equipo de oficina (10%)" },
  equipo_computo: { fiscal: 30, contable: 25, label: "Equipo de cómputo (30%)" },
  equipo_oficina: { fiscal: 10, contable: 10, label: "Equipo de oficina (10%)" },
  vehiculo_transporte: { fiscal: 25, contable: 20, label: "Automóviles / transporte (25%)" },
  equipo_comunicaciones: { fiscal: 10, contable: 10, label: "Comunicaciones (10%)" },
  maquinaria: { fiscal: 10, contable: 10, label: "Maquinaria general (10%)" },
  herramientas: { fiscal: 35, contable: 25, label: "Herramientas, dados (35%)" },
  intangible: { fiscal: 15, contable: 15, label: "Intangibles (15%)" },
  otro: { fiscal: 10, contable: 10, label: "Otro (10%)" },
};

function diffMeses(desde: Date, hasta: Date): number {
  return Math.max(0, (hasta.getFullYear() - desde.getFullYear()) * 12 + (hasta.getMonth() - desde.getMonth()));
}

export function calcDepreciacion(row: any, hasta: Date = new Date()) {
  const moi = Number(row.moi || 0);
  const residual = Number(row.valor_residual || 0);
  const base = Math.max(0, moi - residual);
  const tasaF = Number(row.tasa_fiscal_anual || 0) / 100;
  const tasaC = Number(row.tasa_contable_anual ?? row.tasa_fiscal_anual ?? 0) / 100;
  const inicio = new Date(row.fecha_inicio_uso || row.fecha_adquisicion);
  const meses = diffMeses(inicio, hasta);
  const mensualF = (base * tasaF) / 12;
  const mensualC = (base * tasaC) / 12;
  const acumF = Math.min(base, mensualF * meses);
  const acumC = Math.min(base, mensualC * meses);
  return {
    meses_uso: meses,
    deprec_mensual_fiscal: Number(mensualF.toFixed(2)),
    deprec_mensual_contable: Number(mensualC.toFixed(2)),
    deprec_acum_fiscal: Number(acumF.toFixed(2)),
    deprec_acum_contable: Number(acumC.toFixed(2)),
    valor_libros_fiscal: Number((moi - acumF).toFixed(2)),
    valor_libros_contable: Number((moi - acumC).toFixed(2)),
    pct_depreciado_fiscal: base > 0 ? Number(((acumF / base) * 100).toFixed(1)) : 0,
  };
}

export const listarActivos = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("activos_fijos").select("*").order("fecha_adquisicion", { ascending: false }).limit(2000);
    if (data.cliente_id) q = q.eq("cliente_id", data.cliente_id);
    const { data: rows, error } = await q;
    if (error) throw error;
    const hoy = new Date();
    return (rows || []).map((r: any) => ({ ...r, ...calcDepreciacion(r, hoy) }));
  });

export const upsertActivo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      cliente_id: z.string().uuid().nullable().optional(),
      codigo: z.string().max(50).optional(),
      descripcion: z.string().min(1).max(300),
      categoria: z.enum(CATEGORIAS),
      fecha_adquisicion: z.string(),
      fecha_inicio_uso: z.string().nullable().optional(),
      moi: z.number().nonnegative(),
      tasa_fiscal_anual: z.number().positive().max(100),
      tasa_contable_anual: z.number().positive().max(100).nullable().optional(),
      valor_residual: z.number().nonnegative().default(0),
      metodo: z.string().default("linea_recta"),
      estado: z.enum(ESTADOS).default("activo"),
      ubicacion: z.string().max(200).optional(),
      responsable: z.string().max(200).optional(),
      proveedor: z.string().max(200).optional(),
      factura_uuid: z.string().max(100).optional(),
      notas: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const despacho_id = await getDespachoId(context.supabase);
    const payload: any = {
      despacho_id,
      cliente_id: data.cliente_id || null,
      codigo: data.codigo || null,
      descripcion: data.descripcion,
      categoria: data.categoria,
      fecha_adquisicion: data.fecha_adquisicion,
      fecha_inicio_uso: data.fecha_inicio_uso || data.fecha_adquisicion,
      moi: data.moi,
      tasa_fiscal_anual: data.tasa_fiscal_anual,
      tasa_contable_anual: data.tasa_contable_anual ?? data.tasa_fiscal_anual,
      valor_residual: data.valor_residual,
      metodo: data.metodo,
      estado: data.estado,
      ubicacion: data.ubicacion || null,
      responsable: data.responsable || null,
      proveedor: data.proveedor || null,
      factura_uuid: data.factura_uuid || null,
      notas: data.notas || null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("activos_fijos").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    payload.created_by = context.userId;
    const { data: row, error } = await context.supabase.from("activos_fijos").insert(payload).select("id").single();
    if (error) throw error;
    return { id: row.id };
  });

export const darBajaActivo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      baja_fecha: z.string(),
      baja_motivo: z.string().min(1).max(500),
      estado: z.enum(["baja", "vendido", "siniestro"]).default("baja"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("activos_fijos").update({
      estado: data.estado, baja_fecha: data.baja_fecha, baja_motivo: data.baja_motivo,
    }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const eliminarActivo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("activos_fijos").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
