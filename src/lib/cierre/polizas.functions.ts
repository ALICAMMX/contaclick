// ─────────────────────────────────────────────────────────────────────────────
// ETAPA 4 — funciones servidoras de pólizas del cierre mensual.
//
// La aplicación NO escribe en `polizas` ni en `poliza_renglones`: todo pasa por
// los RPC de negocio `poliza_generar_borrador`, `poliza_aprobar` y
// `poliza_rechazar` (SECURITY DEFINER), que validan partida doble al centavo,
// catálogo de cuentas, motivo humano y reabren la cascada del periodo.
//
// La generación es IDEMPOTENTE: la llave es `cierre:<cfdi_id>`, de modo que
// regenerar el periodo no duplica pólizas — versiona la existente cuando el
// `input_hash` de sus renglones cambió.
// ─────────────────────────────────────────────────────────────────────────────

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { assertClienteScope } from "@/lib/despacho/scope";
import {
  contabilizarCfdi,
  type CfdiParaContabilizar,
  type ReglaContable,
} from "@/lib/contabilidad-auto/engine";
import { rangoMensual } from "./periodo";

const periodoSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periodo con formato AAAA-MM");
const motivoSchema = z.string().min(10, "Se exige un motivo de al menos 10 caracteres.").max(1000);

const centavos = (n: number | null | undefined) => Math.round((Number(n) || 0) * 100);

/** Pólizas del periodo con sus renglones y el diagnóstico de la etapa. */
export const getPolizasPeriodo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), periodo: periodoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);

    const { data: polizas, error } = await supabase
      .from("polizas")
      .select("id, folio, tipo, fecha, concepto, estado, version, origen, input_hash, idempotency_key, rechazo_motivo, aprobada_at, created_at, poliza_renglones(id, orden, cuenta, cuenta_nombre, concepto, cargo_centavos, abono_centavos)")
      .eq("cliente_id", scope.cliente_id)
      .eq("periodo", data.periodo)
      .order("fecha", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);

    const { data: diagnostico, error: errDiag } = await supabase.rpc("cierre_diag_polizas", {
      _cliente_id: scope.cliente_id,
      _periodo: data.periodo,
    });
    if (errDiag) throw new Error(errDiag.message);

    return { polizas: polizas ?? [], diagnostico };
  });

/**
 * Genera (o regenera) los borradores del periodo desde los CFDI vigentes.
 * Devuelve el detalle por comprobante: nada se “omite en silencio”.
 */
export const generarBorradoresPeriodo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), periodo: periodoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const rango = rangoMensual(data.periodo);

    const { data: reglasRows } = await supabase
      .from("reglas_contables")
      .select("id, nombre, prioridad, activa, cuenta_cargo, cuenta_abono, condicion")
      .eq("cliente_id", scope.cliente_id)
      .eq("activa", true);
    const reglas = (reglasRows ?? []) as unknown as ReglaContable[];

    // Paginación exhaustiva: el periodo puede exceder el tope por página.
    const cfdis: any[] = [];
    const PAGINA = 500;
    for (let desde = 0; ; desde += PAGINA) {
      const { data: pagina, error } = await supabase
        .from("cfdi_xml")
        .select("id, uuid, tipo_cfdi, rfc_emisor, rfc_receptor, nombre_emisor, nombre_receptor, fecha, subtotal, descuento, iva_trasladado, ieps_trasladado, iva_retenido, isr_retenido, total, estatus_sat, clase_documental")
        .eq("cliente_id", scope.cliente_id)
        .eq("periodo", data.periodo)
        .order("fecha", { ascending: true })
        .range(desde, desde + PAGINA - 1);
      if (error) throw new Error(error.message);
      cfdis.push(...(pagina ?? []));
      if ((pagina ?? []).length < PAGINA) break;
    }

    const detalle: { uuid: string; accion: string; motivo?: string }[] = [];
    let generadas = 0;

    for (const c of cfdis) {
      if (c.estatus_sat !== "vigente") {
        detalle.push({ uuid: c.uuid, accion: "omitida", motivo: `Estatus SAT “${c.estatus_sat ?? "desconocido"}”: sólo se contabiliza evidencia vigente.` });
        continue;
      }
      const sugerida = contabilizarCfdi(
        { ...(c as unknown as CfdiParaContabilizar), rfc_cliente: scope.rfc },
        reglas,
      );
      if (sugerida.asientos.length === 0) {
        detalle.push({ uuid: c.uuid, accion: "omitida", motivo: sugerida.warnings[0] ?? "El motor no produjo asientos para este comprobante." });
        continue;
      }
      const renglones = sugerida.asientos.map((a) => ({
        cuenta: a.cuenta,
        cuenta_nombre: a.nombre,
        concepto: sugerida.concepto,
        cargo_centavos: centavos(a.debe),
        abono_centavos: centavos(a.haber),
        cfdi_id: c.id,
      }));
      const cargos = renglones.reduce((s, r) => s + r.cargo_centavos, 0);
      const abonos = renglones.reduce((s, r) => s + r.abono_centavos, 0);
      if (cargos !== abonos) {
        detalle.push({ uuid: c.uuid, accion: "bloqueada", motivo: `Partida doble rota al centavo (${cargos} ≠ ${abonos}); no se genera borrador.` });
        continue;
      }

      const argumentos = {
        _cliente_id: scope.cliente_id,
        _periodo: data.periodo,
        _idempotency_key: `cierre:${c.id}`,
        _tipo: sugerida.tipo,
        _fecha: String(c.fecha).slice(0, 10) < rango.desde.slice(0, 10) ? rango.desde.slice(0, 10) : String(c.fecha).slice(0, 10),
        _concepto: sugerida.concepto,
        _origen: "cierre_mensual",
        _renglones: renglones,
      } as never;
      const { data: res, error } = await supabase.rpc("poliza_generar_borrador", argumentos);
      if (error) {
        detalle.push({ uuid: c.uuid, accion: "error", motivo: error.message });
        continue;
      }
      generadas += 1;
      detalle.push({ uuid: c.uuid, accion: ((res as any)?.accion as string) ?? "creada" });
    }

    const { error: errEval } = await supabase.rpc("cierre_evaluar_polizas", {
      _cliente_id: scope.cliente_id,
      _periodo: data.periodo,
    });
    if (errEval) throw new Error(errEval.message);

    return { generadas, revisados: cfdis.length, detalle };
  });

/** Aprobación humana con motivo: cuadre al centavo y catálogo validados en SQL. */
export const aprobarPolizaCierre = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), poliza_id: z.string().uuid(), motivo: motivoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: res, error } = await supabase.rpc("poliza_aprobar", {
      _poliza_id: data.poliza_id,
      _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);
    return res;
  });

/** Rechazo humano: exige motivo y queda en la bitácora inmutable del periodo. */
export const rechazarPolizaCierre = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), poliza_id: z.string().uuid(), motivo: motivoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: res, error } = await supabase.rpc("poliza_rechazar", {
      _poliza_id: data.poliza_id,
      _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);
    return res;
  });

/** Tolerancia bancaria del expediente (etapa 3): explícita, con motivo. */
export const setToleranciaBancos = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cliente_id: z.string().uuid(),
        tolerancia_centavos: z.number().int().min(0).max(100000),
        motivo: motivoSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: res, error } = await supabase.rpc("cierre_set_tolerancia_bancos", {
      _cliente_id: scope.cliente_id,
      _tolerancia_centavos: data.tolerancia_centavos,
      _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);
    return res;
  });
