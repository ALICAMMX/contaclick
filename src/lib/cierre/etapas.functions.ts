// ─────────────────────────────────────────────────────────────────────────────
// FLUJO CONTABLE MENSUAL — funciones servidoras de etapas.
//
// Toda operación valida alcance (`assertClienteScope`) y falla CERRADA. Los
// cambios de etapa y su bitácora se escriben de forma transaccional dentro de
// los RPC `cierre_etapa_transicion` y `cierre_reabrir_cascada`.
// ─────────────────────────────────────────────────────────────────────────────

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { assertClienteScope } from "@/lib/despacho/scope";
import {
  ETAPAS,
  ORDEN_ETAPAS,
  EVALUADOR_VERSION,
  aplicarFallaCerrada,
  dependenciasSatisfechas,
  siguienteAccion,
  type EstadoEtapa,
  type EtapaId,
} from "./flujo";

const periodoSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periodo con formato AAAA-MM");
const etapaSchema = z.enum(["documentos", "clasificacion", "bancos", "polizas", "impuestos", "cierre"]);

/** Disparador de cascada que corresponde a reabrir manualmente cada etapa. */
const DISPARADOR_POR_ETAPA: Record<EtapaId, "cfdi" | "clasificacion" | "banco" | "poliza" | "parametro_fiscal"> = {
  documentos: "cfdi",
  clasificacion: "clasificacion",
  bancos: "banco",
  polizas: "poliza",
  impuestos: "parametro_fiscal",
  cierre: "parametro_fiscal",
};

/** Etapas cuyo estado lo produce un evaluador determinista sobre la evidencia. */
const EVALUADORES: { fn: string; etapa: EtapaId }[] = [
  { fn: "cierre_evaluar_clasificacion", etapa: "clasificacion" },
  { fn: "cierre_evaluar_bancos", etapa: "bancos" },
  { fn: "cierre_evaluar_polizas", etapa: "polizas" },
  { fn: "cierre_evaluar_impuestos", etapa: "impuestos" },
];

export type FalloEvaluacion = { evaluador: string; etapa: EtapaId; error: string };

/**
 * Reevalúa las etapas evaluables desde la evidencia persistida. Es idempotente:
 * misma evidencia ⇒ mismo `input_hash` ⇒ ninguna transición nueva. Se ejecuta
 * antes de leer, para que la pantalla nunca muestre un estado más viejo que los
 * documentos que ya están en la base.
 *
 * FALLA CERRADA: si un evaluador no corre —error de red, permiso o excepción no
 * capturada dentro del RPC— se intenta persistir `no_comprobada` para su etapa y
 * el fallo se devuelve para que la proyección de lectura lo imponga igual aunque
 * la persistencia también falle.
 */
async function reevaluar(supabase: any, clienteId: string, periodo: string) {
  const fallos: FalloEvaluacion[] = [];
  for (const { fn, etapa } of EVALUADORES) {
    const { error } = await supabase.rpc(fn, { _cliente_id: clienteId, _periodo: periodo });
    if (!error) continue;
    fallos.push({ evaluador: fn, etapa, error: error.message });
    await supabase.rpc("cierre_marcar_no_comprobada", {
      _cliente_id: clienteId,
      _periodo: periodo,
      _etapa: etapa,
      _detalle: `El evaluador ${fn} no pudo ejecutarse: ${error.message}`,
    });
  }
  return fallos;
}


/** Reevaluación explícita, para el botón “Reevaluar” de la pantalla de cierre. */
export const evaluarEtapas = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), periodo: periodoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const fallos = await reevaluar(supabase, scope.cliente_id, data.periodo);
    if (fallos.length > 0) {
      throw new Error(`No se pudo evaluar: ${fallos.map((f) => f.error).join(" · ")}`);
    }
    return { ok: true };
  });

/** Estado completo de las seis etapas del periodo + siguiente acción. */
export const getFlujoMensual = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), periodo: periodoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);

    // FALLA CERRADA: un evaluador que no corre deja su etapa en “no comprobada”.
    const fallosEvaluacion = await reevaluar(supabase, scope.cliente_id, data.periodo);
    const etapasFallidas = fallosEvaluacion.map((f) => f.etapa);

    const { data: filas, error } = await supabase
      .from("cierre_etapas")
      .select("etapa, estado, cobertura, criterios_cumplidos, criterios_pendientes, motivo, version, lista_at, aprobada_at, aprobada_por, updated_at, evaluador_version, resultado")
      .eq("cliente_id", scope.cliente_id)
      .eq("periodo", data.periodo);
    if (error) throw new Error(error.message);

    const porEtapa = new Map((filas ?? []).map((f: any) => [f.etapa as EtapaId, f]));
    const guardados: Partial<Record<EtapaId, EstadoEtapa>> = {};
    for (const id of ORDEN_ETAPAS) guardados[id] = (porEtapa.get(id)?.estado as EstadoEtapa) ?? "no_iniciada";
    const estados = aplicarFallaCerrada(guardados, etapasFallidas);

    const etapas = ETAPAS.map((e) => {
      const fila = porEtapa.get(e.id);
      const dep = dependenciasSatisfechas(e.id, estados);
      const fallo = fallosEvaluacion.find((f) => f.etapa === e.id);
      return {
        ...e,
        estado: estados[e.id]!,
        cobertura: fallo ? null : fila?.cobertura != null ? Number(fila.cobertura) : null,
        criteriosCumplidos: fallo
          ? []
          : ((fila?.criterios_cumplidos as { codigo: string; detalle: string }[]) ?? []),
        criteriosPendientes: fallo
          ? [{ codigo: "diagnostico_fallido", detalle: fallo.error }]
          : ((fila?.criterios_pendientes as { codigo: string; detalle: string }[]) ?? []),
        motivo: fallo ? "El diagnóstico de esta etapa no pudo ejecutarse." : (fila?.motivo ?? null),
        version: fila?.version ?? 1,
        lista_at: fila?.lista_at ?? null,
        aprobada_at: fila?.aprobada_at ?? null,
        evaluadorVersion: fila?.evaluador_version ?? null,
        resultado: fallo ? null : (fila?.resultado ?? null),
        habilitada: dep.ok,
        dependenciasFaltantes: dep.faltantes,
      };
    });


    const { data: eventos } = await supabase
      .from("cierre_eventos")
      .select("id, etapa, evento, estado_anterior, estado_nuevo, motivo, fuente, version, created_at")
      .eq("cliente_id", scope.cliente_id)
      .eq("periodo", data.periodo)
      .order("created_at", { ascending: false })
      .limit(50);

    const sig = siguienteAccion(estados);
    return {
      periodo: data.periodo,
      evaluador: EVALUADOR_VERSION,
      etapas,
      eventos: eventos ?? [],
      fallosEvaluacion,
      siguiente: sig ? { id: sig.id, nombre: sig.nombre, ruta: sig.ruta, acciones: sig.acciones } : null,
    };

  });

/**
 * Declaración MANUAL de etapa. Ya no puede producir `lista` ni `aprobada`: esos
 * estados sólo los emite el evaluador correspondiente a partir de evidencia
 * persistida. Aquí sólo caben dos gestos humanos:
 *  - `no_aplica`, en las etapas autorizadas por `flujo.ts` y con motivo;
 *  - `reabierta`, que se enruta a la reapertura en cascada.
 * Ambos pasan por RPC de negocio SECURITY DEFINER; `authenticated` no conserva
 * escritura directa sobre `cierre_etapas` ni `cierre_eventos`.
 */
export const declararEtapa = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cliente_id: z.string().uuid(),
        periodo: periodoSchema,
        etapa: etapaSchema,
        estado: z.enum(["no_aplica", "reabierta"]),
        motivo: z.string().min(10, "Este cambio exige un motivo de al menos 10 caracteres.").max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const definicion = ETAPAS.find((e) => e.id === data.etapa)!;

    if (data.estado === "reabierta") {
      const { data: reabiertas, error } = await supabase.rpc("cierre_reabrir", {
        _cliente_id: scope.cliente_id,
        _periodo: data.periodo,
        _disparador: DISPARADOR_POR_ETAPA[data.etapa],
        _motivo: data.motivo,
        _referencia_tipo: "manual",
        _referencia_id: data.etapa,
      });
      if (error) throw new Error(error.message);
      return { ok: true, reabiertas: reabiertas ?? [] };
    }

    if (!definicion.permiteNoAplica) {
      throw new Error(`La etapa “${definicion.nombre}” no admite “no aplica”.`);
    }
    const { data: fila, error } = await supabase.rpc("cierre_marcar_no_aplica", {
      _cliente_id: scope.cliente_id,
      _periodo: data.periodo,
      _etapa: data.etapa,
      _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);
    return { ok: true, etapa: fila };
  });

/** Reapertura en cascada por un cambio real (CFDI, banco, póliza, parámetro). */
export const reabrirCascada = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cliente_id: z.string().uuid(),
        periodo: periodoSchema,
        disparador: z.enum(["cfdi", "clasificacion", "banco", "poliza", "parametro_fiscal"]),
        motivo: z.string().min(10).max(1000),
        referencia_tipo: z.string().max(60).optional(),
        referencia_id: z.string().max(120).optional(),
        idempotency_key: z.string().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: reabiertas, error } = await supabase.rpc("cierre_reabrir", {
      _cliente_id: scope.cliente_id,
      _periodo: data.periodo,
      _disparador: data.disparador,
      _motivo: data.motivo,
      _referencia_tipo: data.referencia_tipo ?? undefined,
      _referencia_id: data.referencia_id ?? undefined,
      _idempotency_key: data.idempotency_key ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { reabiertas: (reabiertas ?? []) as unknown as { etapa: string; version: number }[] };
  });

/** Bitácora completa del periodo (inmutable). */
export const getEventosPeriodo = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), periodo: periodoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);
    const { data: eventos, error } = await supabase
      .from("cierre_eventos")
      .select("id, etapa, evento, estado_anterior, estado_nuevo, motivo, fuente, referencia_tipo, referencia_id, version, created_at")
      .eq("cliente_id", scope.cliente_id)
      .eq("periodo", data.periodo)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { eventos: eventos ?? [] };
  });
