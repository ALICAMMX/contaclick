// ─────────────────────────────────────────────────────────────────────────────
// ETAPA 4 — funciones servidoras de decisiones fiscales por CFDI.
// Toda operación valida alcance y falla CERRADA.
// ─────────────────────────────────────────────────────────────────────────────

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { assertClienteScope } from "@/lib/despacho/scope";
import { EVALUADOR_VERSION } from "./flujo";
import {
  coberturaClasificacion,
  validarDecision,
  type CfdiClasificable,
  type DecisionRegistrada,
} from "./decisiones";

const periodoSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periodo con formato AAAA-MM");

const CAMPOS_CFDI =
  "id, uuid, fecha, total, rfc_emisor, nombre_emisor, clase_documental, estatus_sat";

async function cargarUniverso(supabase: any, clienteId: string, periodo: string) {
  const { data: cfdis, error } = await supabase
    .from("cfdi_xml")
    .select(CAMPOS_CFDI)
    .eq("cliente_id", clienteId)
    .eq("periodo", periodo)
    .eq("direccion", "recibido")
    .order("fecha", { ascending: true })
    .limit(5000);
  if (error) throw new Error(error.message);

  const { data: decisiones, error: dErr } = await supabase
    .from("cfdi_decisiones_fiscales")
    .select("cfdi_id, decision, porcentaje_deducible, motivo, fundamento, origen, decidida_at, decidida_por")
    .eq("cliente_id", clienteId)
    .eq("periodo", periodo);
  if (dErr) throw new Error(dErr.message);

  return {
    cfdis: (cfdis ?? []) as CfdiClasificable[],
    decisiones: (decisiones ?? []) as (DecisionRegistrada & { decidida_at: string })[],
  };
}

/** Universo de comprobantes recibidos del periodo + su decisión fiscal vigente. */
export const getClasificacionFiscal = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), periodo: periodoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const { cfdis, decisiones } = await cargarUniverso(supabase, scope.cliente_id, data.periodo);
    const porCfdi = new Map(decisiones.map((d) => [d.cfdi_id, d]));

    return {
      periodo: data.periodo,
      evaluador: EVALUADOR_VERSION,
      cobertura: coberturaClasificacion(cfdis, decisiones),
      comprobantes: cfdis.map((c) => ({ ...c, decision: porCfdi.get(c.id) ?? null })),
    };
  });

/**
 * Registra (o corrige) la decisión fiscal humana de un CFDI. La sugerencia de
 * IA se guarda como evidencia adjunta, nunca como origen de la decisión.
 */
export const registrarDecisionFiscal = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cliente_id: z.string().uuid(),
        periodo: periodoSchema,
        cfdi_id: z.string().uuid(),
        decision: z.enum(["deducible", "no_deducible", "parcial", "por_revisar"]),
        porcentaje_deducible: z.number().min(0).max(100).optional(),
        motivo: z.string().max(1000).optional(),
        fundamento: z.string().max(1000).optional(),
        sugerencia_ia: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);

    const validacion = validarDecision({
      decision: data.decision,
      porcentaje_deducible: data.porcentaje_deducible ?? null,
      motivo: data.motivo ?? null,
      fundamento: data.fundamento ?? null,
    });
    if (!validacion.ok) throw new Error(validacion.errores.join(" "));

    // El comprobante debe pertenecer al expediente y al periodo declarado.
    const { data: cfdi, error: cErr } = await supabase
      .from("cfdi_xml")
      .select("id, uuid, periodo, cliente_id, estatus_sat")
      .eq("id", data.cfdi_id)
      .eq("cliente_id", scope.cliente_id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cfdi) throw new Error("El comprobante no pertenece al expediente activo.");
    if (cfdi.periodo !== data.periodo) {
      throw new Error(`El comprobante pertenece al periodo ${cfdi.periodo ?? "sin periodo"}.`);
    }
    if ((cfdi.estatus_sat ?? "desconocido") !== "vigente" &&
        !["por_revisar", "no_deducible"].includes(data.decision)) {
      throw new Error(
        "Sin evidencia SAT vigente sólo puedes dejarlo “por revisar” o marcarlo no deducible.",
      );
    }

    const { data: fila, error } = await supabase
      .from("cfdi_decisiones_fiscales")
      .upsert(
        {
          despacho_id: scope.despacho_id,
          cliente_id: scope.cliente_id,
          cfdi_id: data.cfdi_id,
          periodo: data.periodo,
          decision: data.decision,
          porcentaje_deducible: validacion.porcentaje,
          motivo: data.motivo?.trim() || null,
          fundamento: data.fundamento?.trim() || null,
          sugerencia_ia: (data.sugerencia_ia ?? null) as never,
          origen: "humano",
          decidida_por: userId,
          decidida_at: new Date().toISOString(),
        },
        { onConflict: "cfdi_id" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Un cambio de clasificación reabre lo que dependa de ella.
    await supabase.rpc("cierre_reabrir_cascada", {
      _cliente_id: scope.cliente_id,
      _periodo: data.periodo,
      _disparador: "clasificacion",
      _motivo: `Decisión fiscal actualizada en el comprobante ${cfdi.uuid}`,
      _referencia_tipo: "cfdi",
      _referencia_id: cfdi.uuid,
    });

    return { ok: true, decision: fila };
  });

/**
 * Evalúa la etapa "clasificación" con datos reales y la declara lista sólo si
 * la cobertura es total. Nunca declara verde por ausencia de comprobantes.
 */
export const evaluarEtapaClasificacion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), periodo: periodoSchema, declarar: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const { cfdis, decisiones } = await cargarUniverso(supabase, scope.cliente_id, data.periodo);
    const cobertura = coberturaClasificacion(cfdis, decisiones);

    const estado = cobertura.listo ? "lista" : cobertura.decididos > 0 ? "en_proceso" : "no_iniciada";
    if (data.declarar && !cobertura.listo) {
      throw new Error(
        `No puedes declarar la clasificación: ${cobertura.criteriosPendientes.join("; ")}.`,
      );
    }

    const { error } = await supabase.rpc("cierre_etapa_transicion", {
      _cliente_id: scope.cliente_id,
      _periodo: data.periodo,
      _etapa: "clasificacion",
      _estado: estado,
      _cobertura: cobertura.cobertura,
      _criterios_cumplidos: cobertura.criteriosCumplidos as never,
      _criterios_pendientes: cobertura.criteriosPendientes as never,
      _evaluador_version: EVALUADOR_VERSION,
      _resultado: {
        total: cobertura.total,
        decididos: cobertura.decididos,
        monto_deducible: cobertura.montoDeducible,
      } as never,
      _fuente: "evaluador",
    });
    if (error) throw new Error(error.message);

    return { estado, cobertura };
  });
