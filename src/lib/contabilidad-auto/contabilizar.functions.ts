import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { contabilizarCfdi, type CfdiParaContabilizar, type Asiento, type ReglaContable } from "./engine";

// ---------- Listar CFDI pendientes de contabilizar (sin póliza vinculada) ----------
export const listarCfdiPendientes = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      desde: z.string().optional(),
      hasta: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("cfdi_xml")
      .select("id, uuid, tipo_cfdi, rfc_emisor, rfc_receptor, nombre_emisor, nombre_receptor, fecha, subtotal, descuento, iva_trasladado, ieps_trasladado, iva_retenido, isr_retenido, total, estatus_sat")
      .eq("cliente_id", data.cliente_id)
      .order("fecha", { ascending: false })
      .limit(data.limit);
    if (data.desde) q = q.gte("fecha", data.desde);
    if (data.hasta) q = q.lte("fecha", data.hasta);
    const { data: cfdis, error } = await q;
    if (error) throw new Error(error.message);

    // Excluir UUIDs ya contabilizados
    const uuids = (cfdis ?? []).map((c) => c.uuid.toUpperCase());
    let yaContabilizados = new Set<string>();
    if (uuids.length) {
      const { data: existentes } = await supabase
        .from("polizas")
        .select("uuid_cfdi")
        .eq("cliente_id", data.cliente_id)
        .in("uuid_cfdi", uuids);
      yaContabilizados = new Set((existentes ?? []).map((p: any) => p.uuid_cfdi));
    }
    return (cfdis ?? []).filter((c) => !yaContabilizados.has(c.uuid.toUpperCase()));
  });

// ---------- Generar pólizas borrador desde CFDI seleccionados ----------
export const generarPolizasDesdeCfdi = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      cfdi_ids: z.array(z.string().uuid()).min(1).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cli, error: errCli } = await supabase
      .from("clientes")
      .select("id, despacho_id, rfc")
      .eq("id", data.cliente_id)
      .maybeSingle();
    if (errCli || !cli) throw new Error("Cliente no encontrado");
    if (!cli.rfc) throw new Error("El cliente no tiene RFC configurado");

    const { data: cfdis, error } = await supabase
      .from("cfdi_xml")
      .select("id, uuid, tipo_cfdi, rfc_emisor, rfc_receptor, nombre_emisor, nombre_receptor, fecha, subtotal, descuento, iva_trasladado, ieps_trasladado, iva_retenido, isr_retenido, total")
      .eq("cliente_id", data.cliente_id)
      .in("id", data.cfdi_ids);
    if (error) throw new Error(error.message);

    const rfcCliente = cli.rfc as string;
    const filas: any[] = [];
    let omitidos = 0;
    for (const c of cfdis ?? []) {
      const input: CfdiParaContabilizar = { ...(c as any), rfc_cliente: rfcCliente };
      const sug = contabilizarCfdi(input);
      if (sug.asientos.length === 0) { omitidos++; continue; }
      filas.push({
        id: crypto.randomUUID(),
        cliente_id: data.cliente_id,
        despacho_id: cli.despacho_id as string,
        cfdi_id: c.id,
        uuid_cfdi: c.uuid.toUpperCase(),
        tipo: sug.tipo,
        fecha: String(c.fecha).slice(0, 10),
        monto: sug.monto,
        concepto: sug.concepto,
        cuenta: sug.asientos[0]?.cuenta ?? null,
        referencia: c.uuid.slice(0, 8),
        origen: "auto_sat",
        estado: "borrador",
        metadata: { asientos: sug.asientos, warnings: sug.warnings, tipo_cfdi: c.tipo_cfdi },
        created_by: userId,
      });
    }

    let insertadas = 0;
    for (let i = 0; i < filas.length; i += 200) {
      const chunk = filas.slice(i, i + 200);
      const { error: errIns } = await supabase.from("polizas").insert(chunk);
      if (errIns) throw new Error(`Lote ${i / 200 + 1}: ${errIns.message}`);
      insertadas += chunk.length;
    }
    return { insertadas, omitidos };
  });

// ---------- Listar pólizas borrador (auto_sat) ----------
export const listarPolizasBorrador = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      estado: z.enum(["borrador", "confirmada", "rechazada"]).default("borrador"),
      limit: z.number().int().min(1).max(500).default(200),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("polizas")
      .select("id, fecha, tipo, monto, concepto, uuid_cfdi, estado, origen, metadata, cfdi_id")
      .eq("cliente_id", data.cliente_id)
      .eq("estado", data.estado)
      .order("fecha", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- Aprobar / rechazar ----------
export const cambiarEstadoPoliza = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      ids: z.array(z.string().uuid()).min(1).max(500),
      estado: z.enum(["confirmada", "rechazada", "borrador"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("polizas")
      .update({ estado: data.estado })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { actualizadas: data.ids.length };
  });

// ---------- Editar asientos de una póliza borrador ----------
export const editarAsientosPoliza = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      asientos: z.array(z.object({
        cuenta: z.string().min(1),
        nombre: z.string().min(1),
        debe: z.number().nonnegative(),
        haber: z.number().nonnegative(),
      })).min(2),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const td = data.asientos.reduce((s, a) => s + a.debe, 0);
    const th = data.asientos.reduce((s, a) => s + a.haber, 0);
    if (Math.abs(td - th) > 0.05) throw new Error(`Asiento descuadrado: cargos ${td.toFixed(2)} vs abonos ${th.toFixed(2)}`);

    const { data: row, error: errSel } = await context.supabase
      .from("polizas")
      .select("metadata")
      .eq("id", data.id)
      .maybeSingle();
    if (errSel) throw new Error(errSel.message);
    const meta = (row?.metadata ?? {}) as any;
    meta.asientos = data.asientos;
    meta.warnings = [];

    const { error } = await context.supabase
      .from("polizas")
      .update({ metadata: meta, monto: Math.max(td, th), cuenta: data.asientos[0].cuenta })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type AsientoEditable = Asiento;
