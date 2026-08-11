// ─────────────────────────────────────────────────────────────────────────────
// ETAPA 2 — funciones servidoras de decisiones fiscales por CFDI.
//
// El cliente ya NO escribe en `cfdi_decisiones_fiscales`: `authenticated` sólo
// tiene SELECT. Toda escritura pasa por el RPC de negocio
// `cierre_registrar_decision_fiscal`, que valida, versiona el historial
// inmutable, actualiza la proyección vigente y reabre en cascada dentro de una
// sola transacción. El evaluador de la etapa vive en la base
// (`cierre_evaluar_clasificacion`): "lista" no puede fabricarse desde la UI.
// ─────────────────────────────────────────────────────────────────────────────

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { assertClienteScope } from "@/lib/despacho/scope";
import {
  coberturaClasificacion,
  type CfdiClasificable,
  type DecisionRegistrada,
} from "./decisiones";
import { decisionesPermitidas, evaluarEvidencia } from "./evidencia";

const periodoSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periodo con formato AAAA-MM");

const CAMPOS_CFDI =
  "id, uuid, fecha, total, rfc_emisor, nombre_emisor, clase_documental, estatus_sat, estatus_sat_fuente, detalle_reconstruible, normalizacion_version";

/** Tamaño de página de la lectura exhaustiva. NO es un tope del universo. */
const PAGINA = 1000;


/**
 * Lectura exhaustiva y paginada del universo del periodo. Nunca trunca: la
 * cobertura debe calcularse sobre todos los comprobantes recibidos, no sobre
 * los primeros N. Cualquier error de lectura aborta (falla cerrada).
 */
async function cargarUniverso(supabase: any, clienteId: string, periodo: string) {
  const cfdis: CfdiClasificable[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from("cfdi_xml")
      .select(CAMPOS_CFDI)
      .eq("cliente_id", clienteId)
      .eq("periodo", periodo)
      .eq("direccion", "recibido")
      .order("id", { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`No se pudo leer el universo de comprobantes: ${error.message}`);
    const pagina = (data ?? []) as CfdiClasificable[];
    cfdis.push(...pagina);
    if (pagina.length < PAGINA) break;
  }

  const decisiones: (DecisionRegistrada & { decidida_at: string })[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from("cfdi_decisiones_fiscales")
      .select(
        "cfdi_id, decision, porcentaje_deducible, motivo, fundamento, origen, version, decidida_at, decidida_por",
      )
      .eq("cliente_id", clienteId)
      .eq("periodo", periodo)
      .order("cfdi_id", { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`No se pudieron leer las decisiones fiscales: ${error.message}`);
    const pagina = (data ?? []) as (DecisionRegistrada & { decidida_at: string })[];
    decisiones.push(...pagina);
    if (pagina.length < PAGINA) break;
  }

  return { cfdis, decisiones };
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
      evaluador: "evaluador-clasificacion@2",
      cobertura: coberturaClasificacion(cfdis, decisiones),
      comprobantes: cfdis.map((c) => ({ ...c, decision: porCfdi.get(c.id) ?? null })),
    };
  });

/** Historial inmutable y versionado de las decisiones de un comprobante. */
export const getHistorialDecision = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), cfdi_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: versiones, error } = await supabase
      .from("cfdi_decisiones_historial")
      .select(
        "id, version, decision, porcentaje_deducible, motivo, fundamento, origen, regla_id, regla_version, input_hash, decidida_por, decidida_at",
      )
      .eq("cliente_id", scope.cliente_id)
      .eq("cfdi_id", data.cfdi_id)
      .order("version", { ascending: false });
    if (error) throw new Error(`No se pudo leer el historial de decisiones: ${error.message}`);
    return { versiones: versiones ?? [] };
  });

/**
 * Registra (o corrige) la decisión fiscal de un CFDI a través del RPC de
 * negocio. La sugerencia de IA se conserva como evidencia adjunta; el `origen`
 * sólo puede ser `humano` o una `regla` determinista identificada y versionada.
 */
export const registrarDecisionFiscal = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cliente_id: z.string().uuid(),
        cfdi_id: z.string().uuid(),
        decision: z.enum(["deducible", "no_deducible", "parcial", "por_revisar"]),
        porcentaje_deducible: z.number().min(0).max(100).optional(),
        motivo: z.string().max(1000).optional(),
        fundamento: z.string().max(1000).optional(),
        sugerencia_ia: z.record(z.string(), z.unknown()).optional(),
        origen: z.enum(["humano", "regla"]).default("humano"),
        regla_id: z.string().max(120).optional(),
        regla_version: z.string().max(60).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);

    const { data: resultado, error } = await supabase.rpc("cierre_registrar_decision_fiscal", {
      _cliente_id: scope.cliente_id,
      _cfdi_id: data.cfdi_id,
      _decision: data.decision,
      _porcentaje: data.porcentaje_deducible ?? undefined,
      _motivo: data.motivo ?? undefined,
      _fundamento: data.fundamento ?? undefined,
      _sugerencia_ia: (data.sugerencia_ia ?? null) as never,
      _origen: data.origen,
      _regla_id: data.regla_id ?? undefined,
      _regla_version: data.regla_version ?? undefined,
    });
    if (error) throw new Error(error.message);
    return resultado as unknown as {
      ok: boolean;
      idempotente: boolean;
      decision: Record<string, string | number | boolean | null>;
      historial: Record<string, string | number | boolean | null>;
      reabiertas: { etapa: string; estado_anterior: string; version: number }[];
    };
  });

/**
 * Evalúa la etapa "clasificación" con la evidencia persistida. El cálculo y la
 * transición ocurren dentro de la base: no existe forma de declararla lista a
 * mano ni de enviar una cobertura inventada desde el navegador.
 */
export const evaluarEtapaClasificacion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), periodo: periodoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: resultado, error } = await supabase.rpc("cierre_evaluar_clasificacion", {
      _cliente_id: scope.cliente_id,
      _periodo: data.periodo,
    });
    if (error) throw new Error(error.message);
    return resultado as {
      estado: string;
      cobertura: number;
      listo: boolean;
      total: number;
      decididos: number;
      por_revisar: number;
      sin_decision: number;
      inconsistentes: number;
      monto_deducible: number;
      input_hash: string;
      criterios_cumplidos: string[];
      criterios_pendientes: string[];
    };
  });
