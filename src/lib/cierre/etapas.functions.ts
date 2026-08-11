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
  dependenciasSatisfechas,
  siguienteAccion,
  type EstadoEtapa,
  type EtapaId,
} from "./flujo";

const periodoSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periodo con formato AAAA-MM");
const etapaSchema = z.enum(["documentos", "clasificacion", "bancos", "polizas", "impuestos", "cierre"]);
const estadoSchema = z.enum([
  "no_iniciada", "en_proceso", "bloqueada", "lista", "aprobada", "reabierta", "no_aplica",
]);

/** Estado completo de las seis etapas del periodo + siguiente acción. */
export const getFlujoMensual = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cliente_id: z.string().uuid(), periodo: periodoSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);

    const { data: filas, error } = await supabase
      .from("cierre_etapas")
      .select("etapa, estado, cobertura, criterios_cumplidos, criterios_pendientes, motivo, version, lista_at, aprobada_at, aprobada_por, updated_at")
      .eq("cliente_id", scope.cliente_id)
      .eq("periodo", data.periodo);
    if (error) throw new Error(error.message);

    const porEtapa = new Map((filas ?? []).map((f: any) => [f.etapa as EtapaId, f]));
    const estados: Partial<Record<EtapaId, EstadoEtapa>> = {};
    for (const id of ORDEN_ETAPAS) estados[id] = (porEtapa.get(id)?.estado as EstadoEtapa) ?? "no_iniciada";

    const etapas = ETAPAS.map((e) => {
      const fila = porEtapa.get(e.id);
      const dep = dependenciasSatisfechas(e.id, estados);
      return {
        ...e,
        estado: estados[e.id]!,
        cobertura: fila?.cobertura != null ? Number(fila.cobertura) : null,
        criteriosCumplidos: (fila?.criterios_cumplidos as string[]) ?? [],
        criteriosPendientes: (fila?.criterios_pendientes as string[]) ?? [],
        motivo: fila?.motivo ?? null,
        version: fila?.version ?? 1,
        lista_at: fila?.lista_at ?? null,
        aprobada_at: fila?.aprobada_at ?? null,
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
      siguiente: sig ? { id: sig.id, nombre: sig.nombre, ruta: sig.ruta, acciones: sig.acciones } : null,
    };
  });

/**
 * Cambia el estado de una etapa. Falla cerrada:
 * - no permite declarar `lista`/`aprobada` con dependencias sin satisfacer;
 * - `no_aplica` exige motivo y sólo en etapas que lo admiten;
 * - la transición y su evento se escriben dentro del RPC transaccional.
 */
export const declararEtapa = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cliente_id: z.string().uuid(),
        periodo: periodoSchema,
        etapa: etapaSchema,
        estado: estadoSchema,
        motivo: z.string().max(1000).optional(),
        idempotency_key: z.string().max(120).optional(),
      })
      .refine((v) => !["no_aplica", "reabierta"].includes(v.estado) || (v.motivo?.trim().length ?? 0) >= 10, {
        message: "Este cambio exige un motivo de al menos 10 caracteres.",
        path: ["motivo"],
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scope = await assertClienteScope(supabase, userId, data.cliente_id);

    const definicion = ETAPAS.find((e) => e.id === data.etapa)!;
    if (data.estado === "no_aplica" && !definicion.permiteNoAplica) {
      throw new Error(`La etapa “${definicion.nombre}” no admite “no aplica”.`);
    }

    const { data: filas } = await supabase
      .from("cierre_etapas")
      .select("etapa, estado")
      .eq("cliente_id", scope.cliente_id)
      .eq("periodo", data.periodo);
    const estados: Partial<Record<EtapaId, EstadoEtapa>> = {};
    for (const f of filas ?? []) estados[f.etapa as EtapaId] = f.estado as EstadoEtapa;

    if (["lista", "aprobada"].includes(data.estado)) {
      const dep = dependenciasSatisfechas(data.etapa, estados);
      if (!dep.ok) {
        const nombres = dep.faltantes.map((id) => ETAPAS.find((e) => e.id === id)!.nombre).join(", ");
        throw new Error(`No puedes declarar “${definicion.nombre}”: falta cerrar ${nombres}.`);
      }
    }

    const { data: fila, error } = await supabase.rpc("cierre_etapa_transicion", {
      _cliente_id: scope.cliente_id,
      _periodo: data.periodo,
      _etapa: data.etapa,
      _estado: data.estado,
      _motivo: data.motivo ?? null,
      _evaluador_version: EVALUADOR_VERSION,
      _idempotency_key: data.idempotency_key ?? `${data.etapa}:${data.estado}:${data.periodo}`,
      _fuente: "ui",
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
    const { data: reabiertas, error } = await supabase.rpc("cierre_reabrir_cascada", {
      _cliente_id: scope.cliente_id,
      _periodo: data.periodo,
      _disparador: data.disparador,
      _motivo: data.motivo,
      _referencia_tipo: data.referencia_tipo ?? null,
      _referencia_id: data.referencia_id ?? null,
      _idempotency_key: data.idempotency_key ?? null,
    });
    if (error) throw new Error(error.message);
    return { reabiertas: reabiertas ?? [] };
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
