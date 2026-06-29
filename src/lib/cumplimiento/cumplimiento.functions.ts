import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";

const AREAS = ["IMSS", "INFONAVIT", "SAT", "STPS", "Estatal", "Otro"] as const;
const FRECS = ["mensual", "bimestral", "trimestral", "semestral", "anual", "unica", "continuo"] as const;
const ESTADOS = ["pendiente", "cumplido", "vencido", "na"] as const;

async function getDespachoId(supabase: any, despacho_id?: string): Promise<string> {
  if (despacho_id) return despacho_id;
  const { data } = await supabase.from("user_memberships").select("despacho_id").eq("estado", "activo").limit(1);
  if (!data?.length) throw new Error("Sin despacho asignado");
  return data[0].despacho_id;
}

export const listarCumplimiento = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("cumplimiento_items").select("*").order("proximo_vencimiento", { ascending: true, nullsFirst: false });
    if (data.cliente_id) q = q.eq("cliente_id", data.cliente_id);
    const { data: rows, error } = await q;
    if (error) throw error;
    // Recalcular estado dinámico por fecha
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return (rows || []).map((r: any) => {
      if (r.estado === "cumplido" || r.estado === "na") return r;
      if (r.proximo_vencimiento) {
        const d = new Date(r.proximo_vencimiento);
        if (d < today) return { ...r, estado_calc: "vencido" };
        const diff = (d.getTime() - today.getTime()) / 86400000;
        if (diff <= 7) return { ...r, estado_calc: "por_vencer" };
      }
      return { ...r, estado_calc: r.estado };
    });
  });

export const upsertCumplimiento = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      cliente_id: z.string().uuid().nullable().optional(),
      area: z.enum(AREAS),
      item: z.string().min(1).max(200),
      descripcion: z.string().max(1000).optional(),
      frecuencia: z.enum(FRECS),
      proximo_vencimiento: z.string().nullable().optional(),
      ultimo_cumplido: z.string().nullable().optional(),
      evidencia_url: z.string().url().nullable().optional().or(z.literal("")),
      responsable: z.string().max(200).optional(),
      notas: z.string().max(2000).optional(),
      estado: z.enum(ESTADOS).default("pendiente"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const despacho_id = await getDespachoId(context.supabase);
    const payload: any = {
      despacho_id,
      cliente_id: data.cliente_id || null,
      area: data.area,
      item: data.item,
      descripcion: data.descripcion || null,
      frecuencia: data.frecuencia,
      proximo_vencimiento: data.proximo_vencimiento || null,
      ultimo_cumplido: data.ultimo_cumplido || null,
      evidencia_url: data.evidencia_url || null,
      responsable: data.responsable || null,
      notas: data.notas || null,
      estado: data.estado,
    };
    if (data.id) {
      const { error } = await context.supabase.from("cumplimiento_items").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    payload.created_by = context.userId;
    const { data: row, error } = await context.supabase.from("cumplimiento_items").insert(payload).select("id").single();
    if (error) throw error;
    return { id: row.id };
  });

export const marcarCumplido = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), evidencia_url: z.string().url().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const patch: any = { estado: "cumplido", ultimo_cumplido: today };
    if (data.evidencia_url) patch.evidencia_url = data.evidencia_url;
    const { error } = await context.supabase.from("cumplimiento_items").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const eliminarCumplimiento = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cumplimiento_items").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const sembrarCumplimientoBase = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cliente_id: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const despacho_id = await getDespachoId(context.supabase);
    const base = [
      { area: "IMSS", item: "Determinación mensual de cuotas (SUA)", frecuencia: "mensual" },
      { area: "IMSS", item: "Aviso de modificación de salario", frecuencia: "continuo" },
      { area: "IMSS", item: "Declaración anual de Riesgos de Trabajo (DACR-RT)", frecuencia: "anual" },
      { area: "INFONAVIT", item: "Pago bimestral de aportaciones", frecuencia: "bimestral" },
      { area: "INFONAVIT", item: "Movimientos afiliatorios", frecuencia: "continuo" },
      { area: "SAT", item: "Timbrado de CFDI de nómina", frecuencia: "continuo" },
      { area: "SAT", item: "Entero mensual de retenciones de ISR salarios", frecuencia: "mensual" },
      { area: "SAT", item: "DIM informativa anual", frecuencia: "anual" },
      { area: "STPS", item: "NOM-035 - evaluación factores de riesgo psicosocial", frecuencia: "anual" },
      { area: "STPS", item: "Comisión Mixta de Seguridad e Higiene", frecuencia: "continuo" },
      { area: "Estatal", item: "Impuesto sobre Nómina (ISN)", frecuencia: "mensual" },
    ];
    const payload = base.map((b) => ({
      despacho_id,
      cliente_id: data.cliente_id || null,
      area: b.area,
      item: b.item,
      frecuencia: b.frecuencia,
      estado: "pendiente",
      created_by: context.userId,
    }));
    const { error, count } = await context.supabase.from("cumplimiento_items").insert(payload, { count: "exact" });
    if (error) throw error;
    return { inserted: count ?? payload.length };
  });
