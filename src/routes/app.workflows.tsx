import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Workflow as WorkflowIcon,
  Plus,
  Play,
  Pause,
  Trash2,
  Sparkles,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
  TimerReset,
  Activity,
  GitBranch,
  History,
  Lightbulb,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  listWorkflows,
  getWorkflowsDashboard,
  listRuns,
  getRunDetalle,
  upsertWorkflow,
  setWorkflowStatus,
  eliminarWorkflow,
  aplicarTemplate,
  listSugerencias,
  resolverSugerencia,
  generarSugerencias,
  type WorkflowRow,
  type RunRow,
} from "@/lib/workflows/workflows.functions";
import { runWorkflowAhora } from "@/lib/workflows/engine.functions";
import { TRIGGERS, ACTIONS, CONDITIONS, TEMPLATES, catalogEntry, type WorkflowNode } from "@/lib/workflows/catalogo";

export const Route = createFileRoute("/app/workflows")({
  component: WorkflowsPage,
});

const STATUS_COLOR: Record<string, string> = {
  activo: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  pausado: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  borrador: "bg-slate-500/10 text-slate-700 border-slate-500/30 dark:text-slate-300",
  archivado: "bg-zinc-500/10 text-zinc-600 border-zinc-500/30 dark:text-zinc-300",
};

const RUN_STATUS: Record<string, { label: string; cls: string; icon: typeof Activity }> = {
  pendiente: { label: "Pendiente", cls: "bg-slate-500/10 text-slate-700 border-slate-500/30", icon: Clock },
  corriendo: { label: "Corriendo", cls: "bg-blue-500/10 text-blue-700 border-blue-500/30", icon: Activity },
  exito: { label: "Éxito", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30", icon: CheckCircle2 },
  fallido: { label: "Fallido", cls: "bg-red-500/10 text-red-700 border-red-500/30", icon: XCircle },
  parcial: { label: "Parcial", cls: "bg-amber-500/10 text-amber-700 border-amber-500/30", icon: AlertTriangle },
  cancelado: { label: "Cancelado", cls: "bg-zinc-500/10 text-zinc-600 border-zinc-500/30", icon: XCircle },
};

function WorkflowsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"dashboard" | "workflows" | "builder" | "templates" | "historial" | "logs" | "ia">("dashboard");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openDetalleRun, setOpenDetalleRun] = useState<string | null>(null);

  const _list = useServerFn(listWorkflows);
  const _dash = useServerFn(getWorkflowsDashboard);
  const _runs = useServerFn(listRuns);
  const _del = useServerFn(eliminarWorkflow);
  const _setStatus = useServerFn(setWorkflowStatus);
  const _run = useServerFn(runWorkflowAhora);
  const _aplicar = useServerFn(aplicarTemplate);
  const _sugs = useServerFn(listSugerencias);
  const _genSug = useServerFn(generarSugerencias);
  const _resolveSug = useServerFn(resolverSugerencia);

  const wfsQ = useQuery({ queryKey: ["wfs"], queryFn: () => _list({}) });
  const dashQ = useQuery({ queryKey: ["wfs-dash"], queryFn: () => _dash({}) });
  const runsQ = useQuery({ queryKey: ["wfs-runs"], queryFn: () => _runs({ data: { limit: 100 } }) });
  const sugQ = useQuery({ queryKey: ["wfs-sug"], queryFn: () => _sugs({}) });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["wfs"] });
    qc.invalidateQueries({ queryKey: ["wfs-dash"] });
    qc.invalidateQueries({ queryKey: ["wfs-runs"] });
  };

  const eliminar = useMutation({
    mutationFn: (id: string) => _del({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Workflow eliminado"); },
  });
  const cambiarStatus = useMutation({
    mutationFn: (v: { id: string; status: "activo" | "pausado" }) => _setStatus({ data: v }),
    onSuccess: () => { invalidate(); toast.success("Estado actualizado"); },
  });
  const correr = useMutation({
    mutationFn: (id: string) => _run({ data: { workflowId: id } }),
    onSuccess: (r: any) => { invalidate(); toast.success(`Ejecutado: ${r.status}`); },
    onError: (e: any) => toast.error(e?.message ?? "Error al ejecutar"),
  });
  const aplicar = useMutation({
    mutationFn: (key: string) => _aplicar({ data: { templateKey: key } }),
    onSuccess: () => { invalidate(); toast.success("Template aplicado y workflow activado"); setTab("workflows"); },
  });
  const generar = useMutation({
    mutationFn: () => _genSug({}),
    onSuccess: (r: any) => { qc.invalidateQueries({ queryKey: ["wfs-sug"] }); toast.success(`${r.creadas} sugerencia(s) generadas`); },
  });
  const resolver = useMutation({
    mutationFn: (v: { id: string; estado: "aceptada" | "rechazada" | "aplicada" }) => _resolveSug({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wfs-sug"] }),
  });

  const wfs = (wfsQ.data ?? []) as WorkflowRow[];
  const kpis = dashQ.data?.kpis;
  const ultimos = dashQ.data?.ultimos ?? [];
  const errores = dashQ.data?.errores ?? [];

  const editingWf = useMemo(() => wfs.find((w) => w.id === editingId) ?? null, [wfs, editingId]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4 min-w-0">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--gradient-primary)" }}>
            <WorkflowIcon className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Workflow Automático del Expediente</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Convierte ContaClick en un sistema que trabaja solo. Conecta CFDI, Calendario, Riesgo SAT, Tareas y Portal en flujos automáticos.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HerramientaHelp slug="workflows" />
          <Button variant="outline" size="sm" onClick={() => { setEditingId(null); setTab("builder"); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Nuevo workflow
          </Button>
          <Button size="sm" onClick={() => setTab("templates")}>
            <Sparkles className="h-4 w-4 mr-1.5" /> Usar template
          </Button>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid w-full max-w-4xl grid-cols-7">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="builder">Builder</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
          <TabsTrigger value="logs">Errores</TabsTrigger>
          <TabsTrigger value="ia">IA</TabsTrigger>
        </TabsList>

        {/* DASHBOARD */}
        <TabsContent value="dashboard" className="mt-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi label="Activos" value={kpis?.activos ?? 0} icon={Zap} tone="default" />
            <Kpi label="Total" value={kpis?.total ?? 0} icon={WorkflowIcon} tone="default" />
            <Kpi label="Hoy" value={kpis?.ejecutados_hoy ?? 0} icon={Activity} tone="blue" />
            <Kpi label="Exitosos" value={kpis?.exitosos_hoy ?? 0} icon={CheckCircle2} tone="emerald" />
            <Kpi label="Fallidos" value={kpis?.fallidos_hoy ?? 0} icon={XCircle} tone="red" />
            <Kpi label="Min ahorrados" value={kpis?.tiempo_ahorrado_min ?? 0} icon={TimerReset} tone="amber" />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Últimas ejecuciones" icon={<History className="h-4 w-4" />}>
              <BitacoraCompacta runs={ultimos as RunRow[]} onOpen={(id) => setOpenDetalleRun(id)} />
            </Panel>
            <Panel title="Errores recientes" icon={<AlertTriangle className="h-4 w-4 text-red-500" />}>
              <BitacoraCompacta runs={errores as RunRow[]} onOpen={(id) => setOpenDetalleRun(id)} vacioMsg="Sin errores recientes." />
            </Panel>
          </div>
        </TabsContent>

        {/* WORKFLOWS */}
        <TabsContent value="workflows" className="mt-6">
          <Card className="border-border/60 overflow-hidden">
            <div className="divide-y divide-border/40">
              {wfs.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">Aún no hay workflows. Usa un template para empezar.</div>}
              {wfs.map((w) => {
                const trig = (TRIGGERS as any)[w.trigger_type];
                const Icon = trig?.icon ?? Zap;
                return (
                  <div key={w.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
                    <div className="h-9 w-9 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{w.nombre}</span>
                        <Badge className={STATUS_COLOR[w.status]}>{w.status}</Badge>
                        <Badge variant="outline" className="text-[10px]">{trig?.label ?? w.trigger_type}</Badge>
                        <Badge variant="outline" className="text-[10px]">Prio: {w.prioridad}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {w.descripcion || "—"} · {w.total_runs} ejec · {w.total_success} ok · {w.total_failed} fail
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => correr.mutate(w.id)} disabled={correr.isPending}>
                        <Play className="h-3.5 w-3.5 mr-1" /> Correr
                      </Button>
                      {w.status === "activo" ? (
                        <Button variant="ghost" size="sm" onClick={() => cambiarStatus.mutate({ id: w.id, status: "pausado" })}>
                          <Pause className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => cambiarStatus.mutate({ id: w.id, status: "activo" })}>
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => { setEditingId(w.id); setTab("builder"); }}>
                        <GitBranch className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { if (confirm("¿Eliminar workflow?")) eliminar.mutate(w.id); }}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>

        {/* BUILDER */}
        <TabsContent value="builder" className="mt-6">
          <BuilderVisual
            workflow={editingWf}
            onSaved={() => { invalidate(); setTab("workflows"); setEditingId(null); }}
            onCancel={() => { setEditingId(null); setTab("workflows"); }}
          />
        </TabsContent>

        {/* TEMPLATES */}
        <TabsContent value="templates" className="mt-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {TEMPLATES.map((t) => {
              const trig = (TRIGGERS as any)[t.trigger_type];
              const Icon = trig?.icon ?? Zap;
              return (
                <Card key={t.key} className="p-4 border-border/60 flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm">{t.nombre}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.descripcion}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {t.nodes.map((n) => {
                      const e = catalogEntry(n.type, n.kind);
                      return (
                        <Badge key={n.id} variant="outline" className="text-[10px]">
                          {e?.label ?? n.kind}
                        </Badge>
                      );
                    })}
                  </div>
                  <div className="mt-auto flex justify-between items-center pt-2">
                    <span className="text-xs text-muted-foreground">Trigger: {trig?.label ?? t.trigger_type}</span>
                    <Button size="sm" onClick={() => aplicar.mutate(t.key)} disabled={aplicar.isPending}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Aplicar
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* HISTORIAL */}
        <TabsContent value="historial" className="mt-6">
          <Card className="border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Workflow</th>
                  <th className="text-left px-3 py-2">Trigger</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="text-left px-3 py-2">Pasos</th>
                  <th className="text-left px-3 py-2">Duración</th>
                  <th className="text-left px-3 py-2">Fecha</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {(runsQ.data ?? []).map((r: any) => {
                  const S = RUN_STATUS[r.status] ?? RUN_STATUS.pendiente;
                  return (
                    <tr key={r.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => setOpenDetalleRun(r.id)}>
                      <td className="px-3 py-2 font-medium">{r.workflow_nombre ?? r.workflow_id.slice(0, 8)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.trigger_type}</td>
                      <td className="px-3 py-2"><Badge className={S.cls}>{S.label}</Badge></td>
                      <td className="px-3 py-2 text-xs">{r.steps_ok} ok / {r.steps_failed} fail</td>
                      <td className="px-3 py-2 text-xs">{r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—"}</td>
                      <td className="px-3 py-2 text-xs">{new Date(r.started_at).toLocaleString("es-MX")}</td>
                      <td className="px-3 py-2"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                    </tr>
                  );
                })}
                {!runsQ.data?.length && <tr><td colSpan={7} className="text-center text-muted-foreground py-10">Sin ejecuciones registradas.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {/* LOGS */}
        <TabsContent value="logs" className="mt-6">
          <Card className="border-border/60 divide-y divide-border/40">
            {(runsQ.data ?? []).filter((r: any) => r.status === "fallido" || r.status === "parcial").map((r: any) => (
              <div key={r.id} className="p-3 flex items-start gap-3 hover:bg-muted/20">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{r.workflow_nombre ?? r.workflow_id.slice(0, 8)}</div>
                  <div className="text-xs text-red-600 break-words">{r.error_message ?? "Falla parcial en algunos pasos."}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">{new Date(r.started_at).toLocaleString("es-MX")} · {r.steps_failed} paso(s) fallido(s)</div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button variant="secondary" size="sm" onClick={() => setOpenDetalleRun(r.id)}>
                    <Activity className="h-3.5 w-3.5 mr-1" /> Ver detalle
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => correr.mutate(r.workflow_id)}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reintentar
                  </Button>
                </div>
              </div>
            ))}

            {!(runsQ.data ?? []).some((r: any) => r.status === "fallido" || r.status === "parcial") && (
              <div className="p-10 text-center text-sm text-muted-foreground">Sin errores. Todo corre limpio.</div>
            )}
          </Card>
        </TabsContent>

        {/* IA SUPERVISORA */}
        <TabsContent value="ia" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              La IA supervisora detecta procesos repetitivos y sugiere automatizarlos.
            </div>
            <Button size="sm" variant="outline" onClick={() => generar.mutate()} disabled={generar.isPending}>
              <Sparkles className="h-4 w-4 mr-1.5" />
              {generar.isPending ? "Analizando…" : "Generar sugerencias"}
            </Button>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {(sugQ.data ?? []).map((s: any) => (
              <Card key={s.id} className="p-4 border-border/60 flex flex-col gap-2">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-md bg-amber-500/10 text-amber-600 grid place-items-center shrink-0">
                    <Lightbulb className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm">{s.titulo}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.descripcion}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <Badge variant="outline" className="text-[10px]">Confianza: {Math.round((s.confianza ?? 0) * 100)}%</Badge>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => resolver.mutate({ id: s.id, estado: "rechazada" })}>Descartar</Button>
                    {s.template_sugerido ? (
                      <Button size="sm" onClick={() => { aplicar.mutate(s.template_sugerido); resolver.mutate({ id: s.id, estado: "aplicada" }); }}>
                        Aplicar
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => resolver.mutate({ id: s.id, estado: "aceptada" })}>Aceptar</Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
            {!sugQ.data?.length && (
              <div className="md:col-span-2 p-10 text-center text-sm text-muted-foreground border border-dashed border-border/60 rounded-lg">
                Sin sugerencias activas. Pulsa "Generar sugerencias" para que la IA analice tus tareas y templates faltantes.
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {openDetalleRun && <DetalleRunDialog runId={openDetalleRun} onClose={() => setOpenDetalleRun(null)} />}
    </div>
  );
}

// ----------------- BUILDER VISUAL (simplificado lineal) -----------------

function BuilderVisual({ workflow, onSaved, onCancel }: { workflow: WorkflowRow | null; onSaved: () => void; onCancel: () => void }) {
  const _save = useServerFn(upsertWorkflow);
  const [nombre, setNombre] = useState(workflow?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(workflow?.descripcion ?? "");
  const [triggerType, setTriggerType] = useState<string>(workflow?.trigger_type ?? "xml_uploaded");
  const [triggerConfig, setTriggerConfig] = useState<any>(workflow?.trigger_config ?? {});
  const [prioridad, setPrioridad] = useState<string>(workflow?.prioridad ?? "media");
  const [nodes, setNodes] = useState<WorkflowNode[]>(
    workflow?.nodes ?? [{ id: "t1", type: "trigger", kind: "xml_uploaded" }],
  );

  const addNode = (kind: string, type: "action" | "condition") => {
    const id = `n${Date.now().toString(36)}`;
    const def = catalogEntry(type, kind);
    const params: Record<string, any> = {};
    Object.entries(def?.paramsSchema ?? {}).forEach(([k, v]) => { params[k] = (v as any).default; });
    setNodes((arr) => [...arr, { id, type, kind, params }]);
  };
  const removeNode = (id: string) => setNodes((arr) => arr.filter((n) => n.id !== id));
  const moveNode = (id: string, dir: -1 | 1) => {
    setNodes((arr) => {
      const idx = arr.findIndex((n) => n.id === id);
      if (idx < 0) return arr;
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return arr;
      const copy = [...arr];
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });
  };
  const updateParam = (id: string, key: string, value: any) =>
    setNodes((arr) => arr.map((n) => (n.id === id ? { ...n, params: { ...(n.params ?? {}), [key]: value } } : n)));

  const updateTriggerKind = (k: string) => {
    setTriggerType(k);
    setNodes((arr) => {
      const rest = arr.filter((n) => n.type !== "trigger");
      const def = catalogEntry("trigger", k);
      const params: Record<string, any> = {};
      Object.entries(def?.paramsSchema ?? {}).forEach(([pk, pv]) => { params[pk] = (pv as any).default; });
      return [{ id: "t1", type: "trigger", kind: k, params }, ...rest];
    });
    if (k === "cron") setTriggerConfig({ frecuencia: "diario" }); else setTriggerConfig({});
  };

  const guardar = useMutation({
    mutationFn: () => {
      const edges = nodes.slice(0, -1).map((n, i) => ({ from: n.id, to: nodes[i + 1].id }));
      // Sync trigger params hacia trigger_config en cron
      const tc = triggerType === "cron" ? { frecuencia: nodes[0]?.params?.frecuencia ?? triggerConfig.frecuencia ?? "diario" } : triggerConfig;
      return _save({ data: {
        id: workflow?.id,
        nombre: nombre.trim(),
        descripcion,
        trigger_type: triggerType,
        trigger_config: tc,
        nodes,
        edges,
        prioridad: prioridad as any,
        status: "activo",
      } as any });
    },
    onSuccess: () => { toast.success(workflow ? "Workflow actualizado" : "Workflow creado"); onSaved(); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar"),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4 border-border/60 space-y-3">
        <div className="grid md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <Label className="text-xs">Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Cierre mensual auto" />
          </div>
          <div>
            <Label className="text-xs">Prioridad</Label>
            <Select value={prioridad} onValueChange={setPrioridad}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["baja", "media", "alta", "critica"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-xs">Descripción</Label>
          <Textarea value={descripcion ?? ""} onChange={(e) => setDescripcion(e.target.value)} rows={2} />
        </div>
        <div>
          <Label className="text-xs">Trigger</Label>
          <Select value={triggerType} onValueChange={updateTriggerKind}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.values(TRIGGERS).map((t) => <SelectItem key={t.kind} value={t.kind}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-4 border-border/60 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Flujo</h3>
          <div className="flex gap-2 flex-wrap">
            <Select onValueChange={(v) => addNode(v, "action")}>
              <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="+ Acción" /></SelectTrigger>
              <SelectContent>
                {Object.values(ACTIONS).map((a) => <SelectItem key={a.kind} value={a.kind}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select onValueChange={(v) => addNode(v, "condition")}>
              <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="+ Condición" /></SelectTrigger>
              <SelectContent>
                {Object.values(CONDITIONS).map((c) => <SelectItem key={c.kind} value={c.kind}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {nodes.map((n, idx) => {
            const def = catalogEntry(n.type, n.kind);
            const Icon = def?.icon ?? Zap;
            const isTrigger = n.type === "trigger";
            const isCond = n.type === "condition";
            return (
              <div key={n.id} className="flex items-center gap-2 shrink-0">
                <Card className={`p-3 min-w-[200px] border-2 ${isTrigger ? "border-primary/40 bg-primary/5" : isCond ? "border-amber-500/40 bg-amber-500/5" : "border-border/60"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold">{def?.label}</span>
                  </div>
                  {def?.paramsSchema && Object.entries(def.paramsSchema).map(([k, schema]) => (
                    <div key={k} className="mt-1">
                      <Label className="text-[10px] text-muted-foreground">{schema.label}</Label>
                      {schema.type === "select" ? (
                        <Select value={String(n.params?.[k] ?? schema.default ?? "")} onValueChange={(v) => updateParam(n.id, k, v)}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(schema.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          className="h-7 text-xs"
                          type={schema.type === "number" ? "number" : "text"}
                          value={String(n.params?.[k] ?? schema.default ?? "")}
                          onChange={(e) => updateParam(n.id, k, schema.type === "number" ? Number(e.target.value) : e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                  {!isTrigger && (
                    <div className="flex gap-1 mt-2">
                      <Button size="sm" variant="ghost" className="h-6 px-1 text-[10px]" onClick={() => moveNode(n.id, -1)}>←</Button>
                      <Button size="sm" variant="ghost" className="h-6 px-1 text-[10px]" onClick={() => moveNode(n.id, 1)}>→</Button>
                      <Button size="sm" variant="ghost" className="h-6 px-1 text-[10px] text-red-500" onClick={() => removeNode(n.id)}>×</Button>
                    </div>
                  )}
                </Card>
                {idx < nodes.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button onClick={() => guardar.mutate()} disabled={!nombre.trim() || nodes.length < 2 || guardar.isPending}>
          {guardar.isPending ? "Guardando…" : workflow ? "Actualizar" : "Crear workflow"}
        </Button>
      </div>
    </div>
  );
}

// ----------------- Detalle de ejecución -----------------

function DetalleRunDialog({ runId, onClose }: { runId: string; onClose: () => void }) {
  const _det = useServerFn(getRunDetalle);
  const q = useQuery({ queryKey: ["wf-run", runId], queryFn: () => _det({ data: { runId } }) });
  const steps = q.data?.steps ?? [];
  const run = q.data?.run;
  const hasError = run?.status === "fallido" || run?.status === "parcial" || Boolean(run?.error_message);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Detalle de ejecución</DialogTitle>
          <DialogDescription>
            {q.data?.workflowNombre ?? "—"} · {run?.trigger_type} · {run?.started_at && new Date(run.started_at).toLocaleString("es-MX")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {q.isLoading && <div className="text-sm text-muted-foreground text-center py-10">Cargando bitácora de pasos…</div>}
          {q.isError && (
            <div className="p-3 rounded-md border border-red-500/30 bg-red-500/5 text-sm text-red-600">
              {(q.error as any)?.message ?? "No se pudo cargar el detalle de la ejecución."}
            </div>
          )}
          {!q.isLoading && !q.isError && hasError && run?.error_message && (
            <div className="p-3 rounded-md border border-red-500/30 bg-red-500/5">
              <div className="text-xs font-semibold text-red-700 dark:text-red-300">Error detectado</div>
              <div className="text-sm text-red-600 dark:text-red-300 mt-1 break-words">{run.error_message}</div>
            </div>
          )}
          {steps.map((s: any) => {
            const def = catalogEntry(s.step_type as any, s.kind);
            const Icon = def?.icon ?? Activity;
            const ok = s.status === "exito";
            const fail = s.status === "fallido";
            return (
              <div key={s.id} className={`p-3 rounded-md border ${fail ? "border-red-500/30 bg-red-500/5" : ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/60 bg-muted/30"}`}>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span className="font-medium text-sm">{def?.label ?? s.kind}</span>
                  <Badge variant="outline" className="text-[10px]">{s.status}</Badge>
                  {s.duration_ms != null && <span className="text-[10px] text-muted-foreground">{s.duration_ms}ms</span>}
                </div>
                {s.error_message && <div className="text-xs text-red-600 mt-1">{s.error_message}</div>}
                {s.output && <pre className="text-[10px] text-muted-foreground mt-2 max-h-24 overflow-auto bg-background/50 p-2 rounded">{JSON.stringify(s.output, null, 2)}</pre>}
              </div>
            );
          })}
          {!q.isLoading && !q.isError && steps.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-10">
              {run?.error_message
                ? "No hay pasos detallados disponibles, pero el error de la ejecución ya se muestra arriba."
                : "Sin pasos registrados."}
            </div>
          )}
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cerrar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------- helpers UI -----------------

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: string }) {
  const toneCls: Record<string, string> = {
    default: "bg-muted/30 text-foreground",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    red: "bg-red-500/10 text-red-600 dark:text-red-300",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  };
  return (
    <Card className="p-3 border-border/60">
      <div className={`h-8 w-8 rounded-md grid place-items-center mb-2 ${toneCls[tone]}`}><Icon className="h-4 w-4" /></div>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="border-border/60">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40">
        {icon}<span className="text-sm font-medium">{title}</span>
      </div>
      <div>{children}</div>
    </Card>
  );
}

function BitacoraCompacta({ runs, onOpen, vacioMsg }: { runs: RunRow[]; onOpen: (id: string) => void; vacioMsg?: string }) {
  if (!runs.length) {
    return <p className="text-xs text-muted-foreground p-4">{vacioMsg ?? "Sin ejecuciones recientes."}</p>;
  }
  return (
    <div className="divide-y divide-border/30">
      {runs.map((r: any) => {
        const S = RUN_STATUS[r.status] ?? RUN_STATUS.pendiente;
        const I = S.icon;
        return (
          <button key={r.id} onClick={() => onOpen(r.id)} className="w-full text-left flex items-center justify-between py-2 px-3 hover:bg-muted/30">
            <div className="flex items-center gap-2 min-w-0">
              <I className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm truncate">{r.workflow_nombre ?? r.workflow_id.slice(0, 8)}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge className={S.cls}>{S.label}</Badge>
              <span className="text-[10px] text-muted-foreground">{new Date(r.started_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
