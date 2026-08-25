// Motor de ejecución del Workflow Automático.
// - emitTrigger: punto de entrada cuando otros módulos disparan eventos
// - runWorkflow: corre la cadena de nodos, registra bitácora
// - procesarCron: invocado por el endpoint público /api/public/hooks/workflow-cron

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { resolveActiveDespachoId } from "@/lib/despacho/resolve";
import { accionImplementada, condicionImplementada, catalogEntry, nextRunFromFrecuencia, sanitizarGrafo, type WorkflowNode, type WorkflowEdge } from "./catalogo";

type WorkflowRow = {
  id: string;
  despacho_id: string;
  cliente_id: string | null;
  nombre: string;
  status: string;
  trigger_type: string;
  trigger_config: any;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  total_runs: number;
  total_success: number;
  total_failed: number;
};

// -------- Acciones ejecutables --------
// Sólo se ejecuta lo que realmente hace algo en la base. Cualquier acción sin
// implementación falla CERRADO: no se inventa un resultado ni se marca éxito.

async function ejecutarAccion(
  supabase: any,
  kind: string,
  params: Record<string, any>,
  ctx: { despachoId: string; clienteId: string | null; payload: any; userId?: string | null },
): Promise<{ output: any; error?: string; skipped?: boolean }> {
  if (!accionImplementada(kind)) {
    const entrada = catalogEntry("action", kind);
    return {
      output: null,
      error: `La acción "${entrada?.label ?? kind}" no tiene implementación automática y no puede ejecutarse. Retírala del workflow y ejecuta esa herramienta manualmente.`,
    };
  }
  try {
    switch (kind) {


      case "generar_tarea": {
        if (!ctx.clienteId) {
          return {
            output: { skipped: true, motivo: "Sin cliente asociado al evento. Asocia este workflow a un cliente o dispara el trigger con cliente_id." },
            skipped: true,
          };
        }
        const ins = {
          despacho_id: ctx.despachoId,
          cliente_id: ctx.clienteId,
          titulo: params.titulo || "Tarea automática",
          descripcion: params.descripcion || "Generada por Workflow Automático.",
          prioridad: params.prioridad || "media",
          tipo: params.tipo || "otro",
          origen: "workflow",
          kanban_estado: "pendiente",
          estatus: "pendiente",
        };
        const { data, error } = await supabase.from("tareas").insert(ins).select("id").single();
        if (error) return { output: null, error: error.message };
        return { output: { tarea_id: data.id } };
      }


      case "crear_alerta": {
        const ins: any = {
          despacho_id: ctx.despachoId,
          cliente_id: ctx.clienteId,
          titulo: params.titulo || "Alerta automática",
          descripcion: params.descripcion || "Generada por Workflow Automático.",
          nivel: params.nivel || "advertencia",
          estatus: "abierta",
          origen: "workflow",
        };
        const { data, error } = await supabase.from("alertas").insert(ins).select("id").single();
        if (error) return { output: null, error: error.message };
        return { output: { alerta_id: data.id } };
      }

      case "solicitar_documento_cliente": {
        if (!ctx.clienteId) {
          return {
            output: { skipped: true, motivo: "Sin cliente asociado. Asocia el workflow a un cliente para enviar solicitudes." },
            skipped: true,
          };
        }

        const ins: any = {
          despacho_id: ctx.despachoId,
          cliente_id: ctx.clienteId,
          asunto: "Solicitud de documento",
          contenido: `Por favor sube: ${params.documento || "documento solicitado"}`,
          remitente: "despacho",
          canal: "portal",
          estatus: "enviado",
        };
        const { error } = await supabase.from("mensajes").insert(ins);
        if (error) return { output: null, error: error.message };
        return { output: { mensaje_enviado: true, documento: params.documento } };
      }

      case "notificar_responsable": {
        const ins: any = {
          despacho_id: ctx.despachoId,
          cliente_id: ctx.clienteId,
          titulo: params.asunto || "Notificación automática",
          descripcion: "Workflow Automático notificó al responsable.",
          nivel: "info",
          estatus: "abierta",
          origen: "workflow",
        };
        const { error } = await supabase.from("alertas").insert(ins);
        if (error) return { output: null, error: error.message };
        return { output: { notificado: true } };
      }

      default:
        return { output: null, error: `Acción desconocida: ${kind}` };
    }
  } catch (e: any) {
    return { output: null, error: e?.message ?? "Error inesperado" };
  }
}

/**
 * Evaluación de condiciones con FALLO CERRADO.
 *
 * Una condición sin evaluador real, o sin el dato verificable que necesita,
 * NO devuelve verdadero: queda "no evaluable" y detiene el workflow. Ningún
 * paso posterior puede ejecutarse por información ausente o simulada.
 */
export type ResultadoCondicion =
  | { evaluable: true; pasa: boolean }
  | { evaluable: false; motivo: string };

export function evaluarCondicion(
  kind: string,
  params: Record<string, any>,
  payload: any,
): ResultadoCondicion {
  if (!condicionImplementada(kind)) {
    return { evaluable: false, motivo: `La condición "${kind}" no tiene evaluador real: el workflow se detiene.` };
  }
  switch (kind) {
    case "riesgo_mayor":
      return typeof payload?.score === "number"
        ? { evaluable: true, pasa: payload.score > (params.umbral ?? 70) }
        : { evaluable: false, motivo: "No hay un score de riesgo numérico verificable en el contexto." };
    case "monto_mayor":
      return typeof payload?.monto === "number"
        ? { evaluable: true, pasa: payload.monto > (params.monto ?? 0) }
        : { evaluable: false, motivo: "No hay un monto numérico verificable en el contexto." };
    case "tiene_tag":
      return Array.isArray(payload?.tags)
        ? { evaluable: true, pasa: payload.tags.includes(params.tag) }
        : { evaluable: false, motivo: "El contexto no trae etiquetas verificables." };
    default:
      return { evaluable: false, motivo: `Condición desconocida: ${kind}.` };
  }
}

// Topología: BFS desde nodos trigger siguiendo edges.
function orderNodes(wf: WorkflowRow): WorkflowNode[] {
  const byId = new Map(wf.nodes.map((n) => [n.id, n]));
  const adj = new Map<string, string[]>();
  for (const e of wf.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  const seen = new Set<string>();
  const out: WorkflowNode[] = [];
  const starts = wf.nodes.filter((n) => n.type === "trigger");
  const queue = [...starts.map((n) => n.id)];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = byId.get(id);
    if (n) out.push(n);
    for (const next of adj.get(id) ?? []) queue.push(next);
  }
  // Agrega nodos huérfanos al final por si los hay
  for (const n of wf.nodes) if (!seen.has(n.id)) out.push(n);
  return out;
}

async function runWorkflowInternal(
  supabase: any,
  wfOriginal: WorkflowRow,
  payload: any,
  userId: string | null,
): Promise<{ runId: string; status: "exito" | "fallido" | "parcial" }> {
  const startedAt = new Date();

  // Los workflows guardados antes del catálogo actual pueden contener acciones
  // sin implementación. Se depuran del grafo (y se persiste la limpieza) en vez
  // de hacer fallar cada ejecución.
  const limpio = sanitizarGrafo({ nodes: wfOriginal.nodes ?? [], edges: wfOriginal.edges ?? [] });
  const wf: WorkflowRow = { ...wfOriginal, nodes: limpio.nodes, edges: limpio.edges };
  if (limpio.omitidos.length) {
    await supabase
      .from("workflows")
      .update({ nodes: limpio.nodes, edges: limpio.edges })
      .eq("id", wf.id);
  }

  const { data: runRow, error: runErr } = await supabase
    .from("workflow_runs")
    .insert({
      despacho_id: wf.despacho_id,
      workflow_id: wf.id,
      cliente_id: wf.cliente_id ?? payload?.cliente_id ?? null,
      status: "corriendo",
      trigger_type: wf.trigger_type,
      trigger_payload: payload ?? {},
      total_steps: wf.nodes.length,
      triggered_by: userId,
    })
    .select("id, cliente_id")
    .single();
  if (runErr) throw new Error(runErr.message);
  const runId: string = runRow.id;
  const clienteId: string | null = runRow.cliente_id;

  const ordered = orderNodes(wf);

  let okCount = 0;
  let failCount = 0;
  let stoppedByCondition = false;
  const stepRows: any[] = [];
  let lastOutput: any = payload ?? {};

  for (let i = 0; i < ordered.length; i++) {
    const node = ordered[i];
    const stepStart = new Date();
    let status: "exito" | "fallido" | "omitido" = "exito";
    let output: any = null;
    let err: string | undefined;

    if (stoppedByCondition) status = "omitido";
    else if (node.type === "trigger") output = { ok: true, source: wf.trigger_type };
    else if (node.type === "action") {
      const r = await ejecutarAccion(supabase, node.kind, node.params ?? {}, {
        despachoId: wf.despacho_id,
        clienteId,
        payload: lastOutput,
        userId,
      });
      output = r.output;
      err = r.error;
      if (r.skipped) {
        status = "omitido";
      } else if (err) {
        status = "fallido";
        failCount++;
      } else {
        okCount++;
        lastOutput = { ...lastOutput, ...(typeof output === "object" ? output : {}) };
      }

    } else if (node.type === "condition") {
      const r = evaluarCondicion(node.kind, node.params ?? {}, lastOutput);
      if (!r.evaluable) {
        // Fallo cerrado: no se declara resultado y nada continúa después.
        output = { evaluacion: null, bloqueada: true, motivo: r.motivo };
        err = r.motivo;
        status = "fallido";
        failCount++;
        stoppedByCondition = true;
      } else {
        output = { evaluacion: r.pasa };
        if (!r.pasa) stoppedByCondition = true;
        okCount++;
      }
    }

    const finishedAt = new Date();
    stepRows.push({
      run_id: runId,
      despacho_id: wf.despacho_id,
      node_id: node.id,
      kind: node.kind,
      step_type: node.type,
      status,
      input: node.params ?? null,
      output,
      error_message: err ?? null,
      started_at: stepStart.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - stepStart.getTime(),
      position: i,
    });
  }

  if (stepRows.length) {
    await supabase.from("workflow_run_steps").insert(stepRows);
  }

  const finishedAt = new Date();
  const finalStatus: "exito" | "fallido" | "parcial" =
    failCount === 0 ? "exito" : okCount === 0 ? "fallido" : "parcial";

  await supabase.from("workflow_runs").update({
    status: finalStatus,
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    steps_ok: okCount,
    steps_failed: failCount,
    error_message: failCount
      ? (() => {
          const first = stepRows.find((s) => s.status === "fallido");
          const label = first ? `${first.kind}: ${first.error_message ?? "error"}` : "error";
          return failCount > 1 ? `${label} (+${failCount - 1} más)` : label;
        })()
      : null,

  }).eq("id", runId);

  await supabase.from("workflows").update({
    total_runs: (wf.total_runs ?? 0) + 1,
    total_success: (wf.total_success ?? 0) + (finalStatus === "exito" ? 1 : 0),
    total_failed: (wf.total_failed ?? 0) + (finalStatus === "fallido" ? 1 : 0),
    last_run_at: finishedAt.toISOString(),
    next_run_at:
      wf.trigger_type === "cron"
        ? nextRunFromFrecuencia(wf.trigger_config?.frecuencia ?? "diario", finishedAt).toISOString()
        : null,
  }).eq("id", wf.id);

  if (finalStatus === "fallido") {
    await supabase.from("alertas").insert({
      despacho_id: wf.despacho_id,
      cliente_id: clienteId,
      titulo: `Workflow "${wf.nombre}" falló`,
      descripcion: `Se registraron ${failCount} fallos durante la ejecución.`,
      nivel: "critico",
      estatus: "abierta",
      origen: "workflow",
    });
  }

  return { runId, status: finalStatus };
}


// Núcleo reutilizable: procesa un trigger contra los workflows activos del despacho.
// Lo usan tanto la server fn emitTrigger como otros módulos (CFDI, Buzón, Riesgo).
export async function processTrigger(
  supabase: any,
  despachoId: string,
  triggerType: string,
  clienteId: string | null,
  payload: any,
  userId: string | null,
): Promise<{ ejecutados: { workflow_id: string; run_id: string; status: string }[] }> {
  await supabase.from("workflow_events").insert({
    despacho_id: despachoId,
    cliente_id: clienteId,
    trigger_type: triggerType,
    payload: payload ?? {},
    procesado: false,
  });
  const { data: wfs } = await supabase
    .from("workflows")
    .select("id, despacho_id, cliente_id, nombre, status, trigger_type, trigger_config, nodes, edges, total_runs, total_success, total_failed")
    .eq("despacho_id", despachoId)
    .eq("status", "activo")
    .eq("trigger_type", triggerType);
  const matches = ((wfs ?? []) as unknown as WorkflowRow[]).filter(
    (wf) => !wf.cliente_id || wf.cliente_id === clienteId,
  );
  const ejecutados: { workflow_id: string; run_id: string; status: string }[] = [];
  for (const wf of matches) {
    const r = await runWorkflowInternal(supabase, wf, { ...(payload ?? {}), cliente_id: clienteId }, userId);
    ejecutados.push({ workflow_id: wf.id, run_id: r.runId, status: r.status });
  }
  await supabase.from("workflow_events").update({ procesado: true, procesado_at: new Date().toISOString() })
    .eq("despacho_id", despachoId)
    .eq("trigger_type", triggerType)
    .eq("procesado", false);
  return { ejecutados };
}

// -------- Server functions --------

export const emitTrigger = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      triggerType: z.string(),
      clienteId: z.string().uuid().nullable().optional(),
      payload: z.any().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);
    const r = await processTrigger(supabase, despachoId, data.triggerType, data.clienteId ?? null, data.payload, userId);
    return { ejecutados: r.ejecutados, total: r.ejecutados.length };
  });

export const runWorkflowAhora = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workflowId: z.string().uuid(), payload: z.any().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: wf, error } = await supabase
      .from("workflows")
      .select("id, despacho_id, cliente_id, nombre, status, trigger_type, trigger_config, nodes, edges, total_runs, total_success, total_failed")
      .eq("id", data.workflowId)
      .single();
    if (error || !wf) throw new Error(error?.message ?? "Workflow no encontrado");
    const r = await runWorkflowInternal(supabase, wf as unknown as WorkflowRow, data.payload ?? {}, userId);
    return r;
  });

// Llamado por el endpoint público de cron interno
export async function procesarCronInterno(supabase: any): Promise<{ ejecutados: number }> {
  const nowISO = new Date().toISOString();
  const { data: wfs } = await supabase
    .from("workflows")
    .select("id, despacho_id, cliente_id, nombre, status, trigger_type, trigger_config, nodes, edges, total_runs, total_success, total_failed, next_run_at")
    .eq("status", "activo")
    .eq("trigger_type", "cron")
    .or(`next_run_at.is.null,next_run_at.lte.${nowISO}`);

  let count = 0;
  for (const wf of (wfs ?? []) as any[]) {
    await runWorkflowInternal(supabase, wf as WorkflowRow, { cron: true }, null);
    count++;
  }
  return { ejecutados: count };
}
