// =====================================================================
// EJECUTOR DEL PROCESAMIENTO POSTERIOR DE UNA CORRIDA SAT.
//
// Reglas duras:
//   - Cada módulo deja SIEMPRE un evento propio en `sat_procesamiento_eventos`
//     (iniciado → completado | omitido | fallido). Si el evento no puede
//     persistirse, el módulo se revierte y la acción global FALLA: nunca se
//     responde "completado" sin evidencia.
//   - La llave de idempotencia impide repetir un módulo ya terminado y
//     protege contra el doble clic (dos intentos concurrentes chocan en la
//     restricción única, y el segundo no ejecuta nada).
//   - No se contacta al SAT, no se descarga, no se ingiere XML y no se
//     consume cuota ni saldo PAC.
//   - El estado y la cobertura de la corrida se derivan SIEMPRE de releer los
//     eventos; jamás de lo que "creyó" la ejecución en memoria.
// =====================================================================

import { computeSaludFiscal } from "@/lib/salud/salud.functions";
import { computeRiesgoSAT } from "@/lib/riesgo/riesgo.functions";
import { runExpressAudit } from "@/lib/auditor/auditor.functions";
import { scanClienteEfos } from "@/lib/efos/efos.functions";
import { MODULOS_RECALCULO } from "./linaje";
import {
  VERSION_PROCESAMIENTO,
  evaluarProcesamiento,
  llaveModulo,
  type EventoModulo,
} from "./procesamiento";

export type ResultadoModulo = {
  module_id: string;
  estado: "completado" | "omitido" | "fallido" | "omitido_por_idempotencia";
  motivo?: string | null;
};

/** Ejecutores por módulo. Devuelven un resumen SANEADO (sin datos sensibles). */
const EJECUTORES: Record<
  string,
  (clienteId: string) => Promise<{ resultado: Record<string, unknown>; omitido?: string | null }>
> = {
  salud_fiscal: async (clienteId) => {
    const r: any = await computeSaludFiscal({ data: { cliente_id: clienteId } });
    if (r?.notFound) return { resultado: {}, omitido: "El expediente no está disponible." };
    return {
      resultado: {
        score: r?.score ?? null,
        semaforo: r?.semaforo ?? null,
        cobertura: r?.cobertura ?? null,
      },
    };
  },
  riesgo_sat: async (clienteId) => {
    const r: any = await computeRiesgoSAT({ data: { cliente_id: clienteId } });
    return {
      resultado: {
        score: r?.score ?? null,
        nivel: r?.nivel ?? null,
        hallazgos: Array.isArray(r?.hallazgos) ? r.hallazgos.length : null,
      },
    };
  },
  auditor_cfdi: async (clienteId) => {
    const r: any = await runExpressAudit({ data: { cliente_id: clienteId } });
    return {
      resultado: {
        hallazgos: Array.isArray(r?.findings) ? r.findings.length : 0,
        comprobantes: r?.stats?.total ?? 0,
      },
    };
  },
  efos: async (clienteId) => {
    const r: any = await scanClienteEfos({ data: { cliente_id: clienteId } });
    const proveedores = Number(r?.total_proveedores ?? r?.proveedores?.length ?? 0);
    if (!proveedores) {
      return { resultado: { proveedores: 0 }, omitido: "El expediente no tiene proveedores que contrastar contra la lista 69-B." };
    }
    return {
      resultado: {
        proveedores,
        coincidencias: Number(r?.total_coincidencias ?? r?.coincidencias?.length ?? 0),
      },
    };
  },
};

async function leerEventos(supabase: any, runId: string): Promise<EventoModulo[]> {
  const { data, error } = await supabase
    .from("sat_procesamiento_eventos")
    .select("module_id, estado, iniciado_at, finalizado_at, motivo, resultado, version")
    .eq("run_id", runId)
    .order("iniciado_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`No se pudo leer la bitácora de procesamiento: ${error.message}`);
  return (data ?? []) as EventoModulo[];
}

/** Lectura pública usada por el detalle de corrida. Misma tabla que la escritura. */
export async function leerEventosProcesamiento(supabase: any, runId: string) {
  return leerEventos(supabase, runId);
}

/**
 * Ejecuta los módulos faltantes de una corrida dejando un evento por módulo.
 * Devuelve la evaluación releída desde la base, nunca un estado en memoria.
 */
export async function ejecutarProcesamientoPosterior(args: {
  supabase: any;
  runId: string;
  clienteId: string;
  despachoId: string;
  nuevos: number;
  cobertura?: string | null;
  /** Restringe la ejecución a estos módulos (por omisión: los faltantes). */
  soloModulos?: string[];
}) {
  const { supabase, runId, clienteId, despachoId } = args;

  const previos = await leerEventos(supabase, runId);
  const antes = evaluarProcesamiento({
    cobertura: args.cobertura ?? null,
    nuevos: args.nuevos,
    eventos: previos,
  });

  const objetivo = (args.soloModulos ?? antes.faltantes).filter((m) =>
    MODULOS_RECALCULO.includes(m as any),
  );

  const resultados: ResultadoModulo[] = [];

  for (const module_id of objetivo) {
    const idempotency_key = llaveModulo(runId, module_id);
    const iniciado_at = new Date().toISOString();

    // 1) Candado + evidencia de inicio. El choque de llave significa que otro
    //    intento ya lo tomó (doble clic) o que el módulo ya terminó.
    const { data: abierto, error: errIni } = await supabase
      .from("sat_procesamiento_eventos")
      .insert({
        run_id: runId,
        cliente_id: clienteId,
        despacho_id: despachoId,
        module_id,
        estado: "iniciado",
        iniciado_at,
        version: VERSION_PROCESAMIENTO,
        idempotency_key,
      })
      .select("id")
      .maybeSingle();

    if (errIni || !abierto?.id) {
      resultados.push({
        module_id,
        estado: "omitido_por_idempotencia",
        motivo: errIni?.message ?? "Ya existe un intento registrado para este módulo.",
      });
      continue;
    }

    const eventoId = abierto.id as string;
    let estadoFinal: "completado" | "omitido" | "fallido" = "completado";
    let motivo: string | null = null;
    let resultado: Record<string, unknown> = {};

    try {
      const r = await EJECUTORES[module_id]!(clienteId);
      resultado = r.resultado ?? {};
      if (r.omitido) {
        estadoFinal = "omitido";
        motivo = r.omitido;
      }
    } catch (e: any) {
      estadoFinal = "fallido";
      motivo = String(e?.message ?? e).slice(0, 250);
    }

    // 2) Cierre del evento. Si no puede persistirse, se revierte el intento y
    //    la acción global falla: sin evidencia no hay "completado".
    const { error: errFin } = await supabase
      .from("sat_procesamiento_eventos")
      .update({
        estado: estadoFinal,
        finalizado_at: new Date().toISOString(),
        motivo,
        resultado,
        derivados: { modulo: module_id, aplicado: estadoFinal === "completado" },
      })
      .eq("id", eventoId);

    if (errFin) {
      await supabase.from("sat_procesamiento_eventos").delete().eq("id", eventoId);
      throw new Error(
        `No se pudo registrar la evidencia del módulo ${module_id}: ${errFin.message}. No se declara ningún procesamiento como completado.`,
      );
    }

    resultados.push({ module_id, estado: estadoFinal, motivo });
  }

  // 3) Releer SIEMPRE: el estado se deriva de la bitácora, no de la memoria.
  const eventos = await leerEventos(supabase, runId);
  const despues = evaluarProcesamiento({
    cobertura: args.cobertura ?? null,
    nuevos: args.nuevos,
    eventos,
  });

  return { antes, despues, eventos, resultados };
}
