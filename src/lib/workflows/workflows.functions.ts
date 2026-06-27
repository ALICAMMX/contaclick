// CRUD, listados, dashboard y sugerencias del Workflow Automático.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/client-auth-middleware";
import { resolveActiveDespachoId } from "@/lib/despacho/resolve";
import { TEMPLATES, nextRunFromFrecuencia } from "./catalogo";

export type WorkflowRow = {
  id: string;
  nombre: string;
  descripcion: string | null;
  status: string;
  trigger_type: string;
  trigger_config: any;
  nodes: any[];
  edges: any[];
  prioridad: string;
  cliente_id: string | null;
  total_runs: number;
  total_success: number;
  total_failed: number;
  last_run_at: string | null;
  next_run_at: string | null;
  template_key: string | null;
  created_at: string;
};

export type RunRow = {
  id: string;
  workflow_id: string;
  cliente_id: string | null;
  status: string;
  trigger_type: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  steps_ok: number;
  steps_failed: number;
  error_message: string | null;
  workflow_nombre?: string;
};

function buildRunErrorSummary(run: any, steps: any[]): string | null {
  const failed = steps.filter((s) => s.status === "fallido" && s.error_message);
  if (failed.length) {
    const first = failed[0];
    const label = `${first.kind}: ${first.error_message}`;
    return failed.length > 1 ? `${label} (+${failed.length - 1} más)` : label;
  }
  return run?.error_message ?? null;
}

async function enrichRunsWithNamesAndErrors(supabase: any, runs: any[]): Promise<RunRow[]> {
  const ids = Array.from(new Set(runs.map((r) => r.workflow_id).filter(Boolean)));
  const runIds = runs.map((r) => r.id).filter(Boolean);
  const nombreMap = new Map<string, string>();
  const stepsMap = new Map<string, any[]>();

  await Promise.all([
    ids.length
      ? supabase.from("workflows").select("id, nombre").in("id", ids).then(({ data }: any) => {
          for (const w of data ?? []) nombreMap.set(w.id, w.nombre);
        })
      : Promise.resolve(),
    runIds.length
      ? supabase
          .from("workflow_run_steps")
          .select("run_id, kind, status, error_message, position")
          .in("run_id", runIds)
          .order("position", { ascending: true })
          .then(({ data }: any) => {
            for (const s of data ?? []) {
              if (!stepsMap.has(s.run_id)) stepsMap.set(s.run_id, []);
              stepsMap.get(s.run_id)!.push(s);
            }
          })
      : Promise.resolve(),
  ]);

  return runs.map((r: any) => ({
    ...r,
    workflow_nombre: nombreMap.get(r.workflow_id),
    error_message: buildRunErrorSummary(r, stepsMap.get(r.id) ?? []),
  })) as RunRow[];
}

export const listWorkflows = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clienteId: z.string().uuid().optional() }).optional().parse(d) ?? {},
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);
    let q = supabase
      .from("workflows")
      .select("id, nombre, descripcion, status, trigger_type, trigger_config, nodes, edges, prioridad, cliente_id, total_runs, total_success, total_failed, last_run_at, next_run_at, template_key, created_at")
      .eq("despacho_id", despachoId)
      .order("created_at", { ascending: false });
    if (data?.clienteId) q = q.or(`cliente_id.eq.${data.clienteId},cliente_id.is.null`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as WorkflowRow[];
  });

export const getWorkflowsDashboard = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);
    const hoyISO = new Date().toISOString().slice(0, 10);

    const [wfs, runs, hoyRuns] = await Promise.all([
      supabase.from("workflows").select("id, status, total_runs").eq("despacho_id", despachoId),
      supabase
        .from("workflow_runs")
        .select("id, workflow_id, cliente_id, status, trigger_type, started_at, finished_at, duration_ms, steps_ok, steps_failed, error_message")
        .eq("despacho_id", despachoId)
        .order("started_at", { ascending: false })
        .limit(10),
      supabase
        .from("workflow_runs")
        .select("id, status, duration_ms")
        .eq("despacho_id", despachoId)
        .gte("started_at", `${hoyISO}T00:00:00Z`),
    ]);

    const allWfs = (wfs.data ?? []) as any[];
    const allRuns = (runs.data ?? []) as RunRow[];
    const today = (hoyRuns.data ?? []) as any[];

    const tiempoAhorradoMin = today.reduce((acc, r) => acc + Math.max(2, Math.round((r.duration_ms ?? 0) / 1000 / 60) + 5), 0);

    const runsConNombre = await enrichRunsWithNamesAndErrors(supabase, allRuns);

    const errores = runsConNombre.filter((r) => r.status === "fallido" || r.status === "parcial").slice(0, 5);

    return {
      kpis: {
        activos: allWfs.filter((w) => w.status === "activo").length,
        total: allWfs.length,
        ejecutados_hoy: today.length,
        exitosos_hoy: today.filter((r) => r.status === "exito").length,
        fallidos_hoy: today.filter((r) => r.status === "fallido" || r.status === "parcial").length,
        tiempo_ahorrado_min: tiempoAhorradoMin,
      },
      ultimos: runsConNombre,
      errores,
    };
  });

export const listRuns = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      workflowId: z.string().uuid().optional(),
      clienteId: z.string().uuid().optional(),
      status: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }).optional().parse(d) ?? {},
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);
    let q = supabase
      .from("workflow_runs")
      .select("id, workflow_id, cliente_id, status, trigger_type, started_at, finished_at, duration_ms, steps_ok, steps_failed, error_message")
      .eq("despacho_id", despachoId)
      .order("started_at", { ascending: false })
      .limit(data?.limit ?? 50);
    if (data?.workflowId) q = q.eq("workflow_id", data.workflowId);
    if (data?.clienteId) q = q.eq("cliente_id", data.clienteId);
    if (data?.status) q = q.eq("status", data.status as any);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return enrichRunsWithNamesAndErrors(supabase, rows ?? []);
  });

export const getRunDetalle = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);
    const { data: run, error: runError } = await supabase
      .from("workflow_runs")
      .select("*")
      .eq("id", data.runId)
      .eq("despacho_id", despachoId)
      .single();
    if (runError || !run) throw new Error(runError?.message ?? "Ejecución no encontrada");

    const { data: steps, error: stepsError } = await supabase
      .from("workflow_run_steps")
      .select("id, node_id, kind, step_type, status, input, output, error_message, started_at, finished_at, duration_ms, position")
      .eq("run_id", data.runId)
      .eq("despacho_id", despachoId)
      .order("position", { ascending: true });
    if (stepsError) throw new Error(`No se pudo leer la bitácora de pasos: ${stepsError.message}`);

    const safeSteps = steps ?? [];
    const resumenError = buildRunErrorSummary(run, safeSteps);
    let workflowNombre: string | null = null;
    if (run?.workflow_id) {
      const { data: w } = await supabase
        .from("workflows")
        .select("nombre")
        .eq("id", run.workflow_id)
        .eq("despacho_id", despachoId)
        .single();
      workflowNombre = (w as any)?.nombre ?? null;
    }
    return { run: { ...run, error_message: resumenError }, steps: safeSteps, workflowNombre };
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  nombre: z.string().trim().min(2).max(120),
  descripcion: z.string().max(500).optional().nullable(),
  status: z.enum(["activo", "pausado", "borrador", "archivado"]).optional(),
  trigger_type: z.string(),
  trigger_config: z.any().optional(),
  nodes: z.array(z.any()).min(1),
  edges: z.array(z.any()).optional(),
  cliente_id: z.string().uuid().nullable().optional(),
  prioridad: z.enum(["baja", "media", "alta", "critica"]).optional(),
  template_key: z.string().nullable().optional(),
});

export const upsertWorkflow = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);
    const payload: any = {
      despacho_id: despachoId,
      nombre: data.nombre,
      descripcion: data.descripcion ?? null,
      status: data.status ?? "activo",
      trigger_type: data.trigger_type,
      trigger_config: data.trigger_config ?? {},
      nodes: data.nodes,
      edges: data.edges ?? [],
      cliente_id: data.cliente_id ?? null,
      prioridad: data.prioridad ?? "media",
      template_key: data.template_key ?? null,
      responsable_user_id: userId,
    };
    if (data.trigger_type === "cron") {
      payload.next_run_at = nextRunFromFrecuencia(data.trigger_config?.frecuencia ?? "diario").toISOString();
    }
    if (data.id) {
      const { error } = await supabase.from("workflows").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    payload.created_by = userId;
    const { data: row, error } = await supabase.from("workflows").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id };
  });

export const setWorkflowStatus = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["activo", "pausado", "borrador", "archivado"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("workflows").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const eliminarWorkflow = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("workflows").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const aplicarTemplate = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ templateKey: z.string(), clienteId: z.string().uuid().nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);
    const tpl = TEMPLATES.find((t) => t.key === data.templateKey);
    if (!tpl) throw new Error("Template no encontrado");
    const payload: any = {
      despacho_id: despachoId,
      cliente_id: data.clienteId ?? null,
      template_key: tpl.key,
      nombre: tpl.nombre,
      descripcion: tpl.descripcion,
      status: "activo",
      trigger_type: tpl.trigger_type,
      trigger_config: tpl.trigger_config ?? {},
      nodes: tpl.nodes,
      edges: tpl.edges,
      prioridad: "alta",
      responsable_user_id: userId,
      created_by: userId,
    };
    if (tpl.trigger_type === "cron") {
      payload.next_run_at = nextRunFromFrecuencia(tpl.trigger_config?.frecuencia ?? "diario").toISOString();
    }
    const { data: row, error } = await supabase.from("workflows").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id };
  });

// ---------- Sugerencias IA supervisora ----------

export const listSugerencias = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);
    const { data, error } = await supabase
      .from("workflow_suggestions")
      .select("*")
      .eq("despacho_id", despachoId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const resolverSugerencia = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), estado: z.enum(["aceptada", "rechazada", "aplicada"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workflow_suggestions")
      .update({ estado: data.estado, resolved_at: new Date().toISOString(), resolved_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generarSugerencias = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const despachoId = await resolveActiveDespachoId(supabase, userId);

    // Heurísticas simples: detectar tareas manuales repetitivas y obligaciones recurrentes sin workflow.
    const [tareas, wfs] = await Promise.all([
      supabase
        .from("tareas")
        .select("titulo, cliente_id, origen, kanban_estado")
        .eq("despacho_id", despachoId)
        .eq("origen", "manual")
        .limit(500),
      supabase.from("workflows").select("template_key, trigger_type").eq("despacho_id", despachoId),
    ]);

    const conteo = new Map<string, number>();
    for (const t of (tareas.data ?? []) as any[]) {
      const k = (t.titulo ?? "").toLowerCase().split(/[\s-]/).slice(0, 4).join(" ");
      if (!k) continue;
      conteo.set(k, (conteo.get(k) ?? 0) + 1);
    }
    const repetitivas = Array.from(conteo.entries()).filter(([, n]) => n >= 3).slice(0, 5);

    const ya = new Set(((wfs.data ?? []) as any[]).map((w) => w.template_key));
    const sugerenciasNuevas: any[] = [];

    for (const [patron, n] of repetitivas) {
      sugerenciasNuevas.push({
        despacho_id: despachoId,
        titulo: `Automatizar "${patron}"`,
        descripcion: `Detectamos ${n} tareas manuales similares en los últimos meses. Podemos crear un workflow que las genere automáticamente.`,
        patron_detectado: `tareas_manuales_repetitivas:${patron}`,
        template_sugerido: null,
        trigger_sugerido: "cron",
        acciones_sugeridas: [{ kind: "generar_tarea", params: { titulo: patron, prioridad: "media", tipo: "otro" } }],
        confianza: 0.7,
        estado: "nueva",
        evidencia: { ocurrencias: n },
      });
    }

    for (const tpl of TEMPLATES) {
      if (!ya.has(tpl.key)) {
        sugerenciasNuevas.push({
          despacho_id: despachoId,
          titulo: `Activar template: ${tpl.nombre}`,
          descripcion: tpl.descripcion,
          patron_detectado: `template_no_aplicado:${tpl.key}`,
          template_sugerido: tpl.key,
          trigger_sugerido: tpl.trigger_type,
          acciones_sugeridas: tpl.nodes.filter((n) => n.type === "action").map((n) => ({ kind: n.kind, params: n.params ?? {} })),
          confianza: 0.85,
          estado: "nueva",
          evidencia: null,
        });
      }
    }

    if (sugerenciasNuevas.length === 0) return { creadas: 0 };

    // Evitar duplicados activos
    const { data: existentes } = await supabase
      .from("workflow_suggestions")
      .select("patron_detectado")
      .eq("despacho_id", despachoId)
      .eq("estado", "nueva");
    const ePatrones = new Set(((existentes ?? []) as any[]).map((e) => e.patron_detectado));
    const filtradas = sugerenciasNuevas.filter((s) => !ePatrones.has(s.patron_detectado));

    if (!filtradas.length) return { creadas: 0 };
    const { error } = await supabase.from("workflow_suggestions").insert(filtradas);
    if (error) throw new Error(error.message);
    return { creadas: filtradas.length };
  });
