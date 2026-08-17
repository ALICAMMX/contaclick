// ─────────────────────────────────────────────────────────────────────────────
// Contabilidad automática · MIGRADO al contrato canónico del Bloque 2.
//
// Esta capa ya NO inserta en `polizas` ni escribe `metadata.asientos`.
// Generar, versionar, aprobar y rechazar pasan exclusivamente por los RPC
// `poliza_generar_borrador`, `poliza_aprobar` y `poliza_rechazar`.
// La lectura sale siempre de `poliza_renglones` (centavos enteros).
// ─────────────────────────────────────────────────────────────────────────────
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { assertClienteScope } from "@/lib/despacho/scope";
import { llaveIdempotencia } from "@/lib/polizas/motor";
import { asientosDesdeRenglones, montoDesdeRenglones, SELECT_RENGLONES_LEGADO } from "@/lib/polizas/adaptador";
import { contabilizarCfdi, type CfdiParaContabilizar, type Asiento, type ReglaContable } from "./engine";

const motivoSchema = z.string().min(10, "Se exige un motivo de al menos 10 caracteres.").max(1000);
const cent = (n: unknown) => Math.round((Number(n) || 0) * 100);

// ---------- Listar CFDI pendientes de contabilizar ----------
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
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    let q = supabase
      .from("cfdi_xml")
      .select("id, uuid, tipo_cfdi, rfc_emisor, rfc_receptor, nombre_emisor, nombre_receptor, fecha, subtotal, descuento, iva_trasladado, ieps_trasladado, iva_retenido, isr_retenido, total, estatus_sat")
      .eq("cliente_id", scope.cliente_id)
      .order("fecha", { ascending: false })
      .limit(data.limit);
    if (data.desde) q = q.gte("fecha", data.desde);
    if (data.hasta) q = q.lte("fecha", data.hasta);
    const { data: cfdis, error } = await q;
    if (error) throw new Error(error.message);

    // “Ya contabilizado” se decide por los renglones canónicos, no por metadata.
    const ids = (cfdis ?? []).map((c) => c.id);
    const contabilizados = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: rs } = await supabase
        .from("poliza_renglones")
        .select("cfdi_id")
        .in("cfdi_id", ids.slice(i, i + 200));
      for (const r of rs ?? []) if (r.cfdi_id) contabilizados.add(r.cfdi_id);
    }
    return (cfdis ?? []).filter((c) => !contabilizados.has(c.id));
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
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);

    const { data: cfdis, error } = await supabase
      .from("cfdi_xml")
      .select("id, uuid, tipo_cfdi, rfc_emisor, rfc_receptor, nombre_emisor, nombre_receptor, fecha, subtotal, descuento, iva_trasladado, ieps_trasladado, iva_retenido, isr_retenido, total, estatus_sat")
      .eq("cliente_id", scope.cliente_id)
      .in("id", data.cfdi_ids);
    if (error) throw new Error(error.message);

    const { data: reglasRows } = await supabase
      .from("reglas_contables")
      .select("id, nombre, prioridad, activa, cuenta_cargo, cuenta_abono, condicion")
      .eq("cliente_id", scope.cliente_id)
      .eq("activa", true);
    const reglas: ReglaContable[] = (reglasRows ?? []) as any;

    const detalle: Array<{ uuid: string; accion: string; motivo?: string }> = [];
    let generadas = 0;
    let omitidos = 0;

    for (const c of cfdis ?? []) {
      if (c.estatus_sat && c.estatus_sat !== "vigente") {
        omitidos++;
        detalle.push({ uuid: c.uuid, accion: "omitida", motivo: `Estatus SAT “${c.estatus_sat}”: sólo se contabiliza evidencia vigente.` });
        continue;
      }
      const sug = contabilizarCfdi({ ...(c as any), rfc_cliente: scope.rfc } as CfdiParaContabilizar, reglas);
      if (sug.asientos.length === 0) {
        omitidos++;
        detalle.push({ uuid: c.uuid, accion: "omitida", motivo: sug.warnings[0] ?? "El motor no produjo asientos." });
        continue;
      }
      const renglones = sug.asientos.map((a) => ({
        cuenta: a.cuenta,
        cuenta_nombre: a.nombre,
        concepto: sug.concepto,
        cargo_centavos: cent(a.debe),
        abono_centavos: cent(a.haber),
        cfdi_id: c.id,
      }));
      const cargos = renglones.reduce((s, r) => s + r.cargo_centavos, 0);
      const abonos = renglones.reduce((s, r) => s + r.abono_centavos, 0);
      if (cargos !== abonos) {
        detalle.push({ uuid: c.uuid, accion: "bloqueada", motivo: `Partida doble rota al centavo (${cargos} ≠ ${abonos}).` });
        continue;
      }
      const fecha = String(c.fecha).slice(0, 10);
      const { error: errRpc } = await supabase.rpc("poliza_generar_borrador", {
        _cliente_id: scope.cliente_id,
        _periodo: fecha.slice(0, 7),
        _idempotency_key: llaveIdempotencia("cfdi", c.id, "contabilidad-auto@1"),
        _tipo: sug.tipo,
        _fecha: fecha,
        _concepto: sug.concepto,
        _origen: "auto_sat",
        _renglones: renglones as never,
      } as never);
      if (errRpc) {
        detalle.push({ uuid: c.uuid, accion: "error", motivo: errRpc.message });
        continue;
      }
      generadas += 1;
      detalle.push({ uuid: c.uuid, accion: "creada" });
    }

    return { insertadas: generadas, omitidos, detalle };
  });

// ---------- Listar pólizas con sus renglones canónicos ----------
export const listarPolizasBorrador = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      estado: z.enum(["borrador", "aprobada", "rechazada", "confirmada"]).default("borrador"),
      limit: z.number().int().min(1).max(500).default(200),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: rows, error } = await supabase
      .from("polizas")
      .select(`id, fecha, periodo, tipo, concepto, uuid_cfdi, estado, version, origen, ${SELECT_RENGLONES_LEGADO}`)
      .eq("cliente_id", scope.cliente_id)
      .eq("estado", data.estado)
      .order("fecha", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((p: any) => ({
      ...p,
      monto: montoDesdeRenglones(p),
      // Compatibilidad de LECTURA para la vista histórica: derivado de los
      // renglones canónicos, nunca de `metadata`.
      metadata: { asientos: asientosDesdeRenglones(p) },
    }));
  });

// ---------- Aprobar / rechazar (con motivo obligatorio) ----------
export const cambiarEstadoPoliza = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      ids: z.array(z.string().uuid()).min(1).max(500),
      estado: z.enum(["aprobada", "rechazada"]),
      motivo: motivoSchema,
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClienteScope(supabase, userId, data.cliente_id);
    const rpc = data.estado === "aprobada" ? "poliza_aprobar" : "poliza_rechazar";
    const fallos: Array<{ id: string; motivo: string }> = [];
    let actualizadas = 0;
    for (const id of data.ids) {
      const { error } = await supabase.rpc(rpc, { _poliza_id: id, _motivo: data.motivo } as never);
      if (error) fallos.push({ id, motivo: error.message });
      else actualizadas += 1;
    }
    return { actualizadas, fallos };
  });

// ---------- Corregir una póliza borrador (genera nueva versión) ----------
export const editarAsientosPoliza = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      id: z.string().uuid(),
      asientos: z.array(z.object({
        cuenta: z.string().min(1).max(60),
        nombre: z.string().min(1).max(200),
        debe: z.number().nonnegative(),
        haber: z.number().nonnegative(),
      })).min(2).max(200),
      motivo: motivoSchema,
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);

    const { data: poliza, error: errSel } = await supabase
      .from("polizas")
      .select("id, periodo, fecha, tipo, concepto, estado, origen, idempotency_key")
      .eq("cliente_id", scope.cliente_id)
      .eq("id", data.id)
      .maybeSingle();
    if (errSel) throw new Error(errSel.message);
    if (!poliza) throw new Error("La póliza no existe en este expediente.");
    if (poliza.estado !== "borrador") {
      throw new Error("Sólo puede corregirse una póliza en borrador; reabre el periodo para modificar una aprobada.");
    }

    const renglones = data.asientos.map((a) => ({
      cuenta: a.cuenta,
      cuenta_nombre: a.nombre,
      concepto: data.motivo.slice(0, 300),
      cargo_centavos: cent(a.debe),
      abono_centavos: cent(a.haber),
    }));
    const cargos = renglones.reduce((s, r) => s + r.cargo_centavos, 0);
    const abonos = renglones.reduce((s, r) => s + r.abono_centavos, 0);
    if (cargos !== abonos) {
      throw new Error(`La póliza no cuadra: cargos ${cargos} vs abonos ${abonos} (centavos).`);
    }

    const { data: res, error } = await supabase.rpc("poliza_generar_borrador", {
      _cliente_id: scope.cliente_id,
      _periodo: poliza.periodo,
      _idempotency_key: poliza.idempotency_key ?? llaveIdempotencia("manual", poliza.id, "correccion@1"),
      _tipo: poliza.tipo,
      _fecha: String(poliza.fecha).slice(0, 10),
      _concepto: poliza.concepto,
      _origen: poliza.origen ?? "manual",
      _renglones: renglones as never,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true, resultado: res };
  });

export type AsientoEditable = Asiento;
