import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ListChecks,
  Plus,
  Search,
  Filter,
  Clock,
  AlertTriangle,
  CheckCircle2,
  UserRound,
  Calendar,
  Sparkles,
  Trash2,
  X,
  MessageSquare,
  History,
  Timer,
  Inbox,
  ShieldAlert,
  FileText,
  Hand,
  Bot,
} from "lucide-react";
import { ToolShell } from "@/components/ToolShell";
import { HerramientaHelp } from "@/components/HerramientaHelp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useActiveCliente } from "@/lib/active-cliente";
import { toast } from "sonner";
import {
  listTareas,
  getTareasDashboard,
  upsertTarea,
  setKanbanEstado,
  eliminarTarea,
  sumarTiempo,
  getTareaDetalle,
  addComentario,
  generarDesdeCalendario,
  listEquipo,
  listClientesDespacho,
  KANBAN_ESTADOS,
  TIPOS_TAREA,
  PRIORIDADES,
  type TareaRow,
} from "@/lib/tareas/tareas.functions";

export const Route = createFileRoute("/app/tareas")({
  component: CentroTareas,
});

const KANBAN_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  esperando_cliente: "Esperando cliente",
  en_revision: "En revisión",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

const TIPO_LABEL: Record<string, string> = {
  declaracion: "Declaración",
  conciliacion: "Conciliación",
  tramite_sat: "Trámite SAT",
  requerimiento: "Requerimiento",
  nomina: "Nómina",
  devolucion: "Devolución",
  defensa: "Defensa",
  cobranza: "Cobranza",
  juridico: "Jurídico",
  administrativo: "Administrativo",
  otro: "Otro",
};

const ORIGEN_LABEL: Record<string, { label: string; icon: typeof Bot }> = {
  manual: { label: "Manual", icon: Hand },
  calendario: { label: "Calendario", icon: Calendar },
  buzon: { label: "Buzón SAT", icon: Inbox },
  riesgo: { label: "Riesgo SAT", icon: ShieldAlert },
  cfdi: { label: "CFDI", icon: FileText },
  auditor: { label: "Auditor", icon: Sparkles },
  portal: { label: "Portal cliente", icon: UserRound },
};

const PRIO_COLOR: Record<string, string> = {
  baja: "bg-slate-500/10 text-slate-600 border-slate-500/30 dark:text-slate-300",
  media: "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-300",
  alta: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  critica: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300",
};

const ESTADO_COLOR: Record<string, string> = {
  pendiente: "bg-slate-500/10 text-slate-700 border-slate-500/30 dark:text-slate-300",
  en_proceso: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300",
  esperando_cliente: "bg-purple-500/10 text-purple-700 border-purple-500/30 dark:text-purple-300",
  en_revision: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  finalizado: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  cancelado: "bg-zinc-500/10 text-zinc-600 border-zinc-500/30 dark:text-zinc-300",
  vencida: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300",
};

function diasRestantes(due?: string | null): { texto: string; tono: string } {
  if (!due) return { texto: "Sin fecha", tono: "text-muted-foreground" };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(due + "T00:00:00");
  const diff = Math.round((d.getTime() - today.getTime()) / 86400_000);
  if (diff < 0) return { texto: `${Math.abs(diff)}d vencida`, tono: "text-red-600 dark:text-red-400" };
  if (diff === 0) return { texto: "Hoy", tono: "text-amber-600 dark:text-amber-400" };
  if (diff <= 3) return { texto: `${diff}d`, tono: "text-amber-600 dark:text-amber-400" };
  return { texto: `${diff}d`, tono: "text-muted-foreground" };
}

function CentroTareas() {
  const qc = useQueryClient();
  const { cliente } = useActiveCliente();
  const [tab, setTab] = useState<"dashboard" | "kanban" | "lista" | "productividad">("dashboard");
  const [filters, setFilters] = useState<{ search: string; prioridad: string; asignadoA: string; origen: string; soloCliente: boolean }>(
    { search: "", prioridad: "", asignadoA: "", origen: "", soloCliente: false },
  );
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);

  const _list = useServerFn(listTareas);
  const _dash = useServerFn(getTareasDashboard);
  const _equipo = useServerFn(listEquipo);
  const _setEstado = useServerFn(setKanbanEstado);
  const _eliminar = useServerFn(eliminarTarea);
  const _gen = useServerFn(generarDesdeCalendario);

  const tareasQ = useQuery({
    queryKey: ["tareas", filters, cliente?.id ?? null],
    queryFn: () =>
      _list({
        data: {
          search: filters.search || undefined,
          prioridad: filters.prioridad || undefined,
          asignadoA: filters.asignadoA || undefined,
          origen: filters.origen || undefined,
          clienteId: filters.soloCliente && cliente?.id ? cliente.id : undefined,
        },
      }),
  });
  const dashQ = useQuery({ queryKey: ["tareas-dash"], queryFn: () => _dash({}) });
  const equipoQ = useQuery({ queryKey: ["tareas-equipo"], queryFn: () => _equipo({}) });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tareas"] });
    qc.invalidateQueries({ queryKey: ["tareas-dash"] });
  };

  const cambiarEstado = useMutation({
    mutationFn: (v: { id: string; estado: typeof KANBAN_ESTADOS[number] }) => _setEstado({ data: v }),
    onSuccess: () => { invalidate(); toast.success("Estado actualizado"); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo cambiar"),
  });

  const eliminar = useMutation({
    mutationFn: (id: string) => _eliminar({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Tarea eliminada"); },
  });

  const generar = useMutation({
    mutationFn: () => _gen({ data: { clienteId: cliente!.id } }),
    onSuccess: (r: any) => {
      invalidate();
      toast.success(r.inserted ? `${r.inserted} tarea(s) generadas desde el calendario` : "No hay obligaciones pendientes nuevas");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al generar"),
  });

  const tareas = tareasQ.data ?? [];
  const kpis = dashQ.data?.kpis;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4 min-w-0">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--gradient-primary)" }}>
            <ListChecks className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Centro de Tareas</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Organiza, asigna y supervisa todo el trabajo operativo del despacho desde un solo lugar.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HerramientaHelp slug="centro-tareas" />
          {cliente?.id && (
            <Button variant="outline" size="sm" onClick={() => generar.mutate()} disabled={generar.isPending}>
              <Sparkles className="h-4 w-4 mr-1.5" />
              {generar.isPending ? "Generando…" : "Generar desde calendario"}
            </Button>
          )}
          <Button size="sm" onClick={() => setOpenCreate(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Nueva tarea
          </Button>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="lista">Lista</TabsTrigger>
          <TabsTrigger value="productividad">Productividad</TabsTrigger>
        </TabsList>

        {/* DASHBOARD */}
        <TabsContent value="dashboard" className="mt-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi label="Total" value={kpis?.total ?? 0} icon={ListChecks} tone="default" />
            <Kpi label="Pendientes" value={kpis?.pendientes ?? 0} icon={Clock} tone="default" />
            <Kpi label="En proceso" value={kpis?.en_proceso ?? 0} icon={Timer} tone="blue" />
            <Kpi label="Vencidas" value={kpis?.vencidas ?? 0} icon={AlertTriangle} tone="red" />
            <Kpi label="Sin asignar" value={kpis?.sin_asignar ?? 0} icon={UserRound} tone="amber" />
            <Kpi label="Finalizadas" value={kpis?.finalizadas ?? 0} icon={CheckCircle2} tone="emerald" />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Próximas a vencer (7 días)" icon={<Calendar className="h-4 w-4" />}>
              <ListaCompacta
                items={tareas.filter((t) => t.kanban_estado !== "finalizado" && t.kanban_estado !== "cancelado" && t.due_date).slice(0, 6)}
                onClick={(id) => setDetalleId(id)}
              />
            </Panel>
            <Panel title="Tareas atrasadas" icon={<AlertTriangle className="h-4 w-4 text-red-500" />}>
              <ListaCompacta
                items={tareas.filter((t) => t.estatus === "vencida").slice(0, 6)}
                onClick={(id) => setDetalleId(id)}
                vacioMsg="Sin atrasos. Buen trabajo."
              />
            </Panel>
            <Panel title="Carga por colaborador" icon={<UserRound className="h-4 w-4" />}>
              {(dashQ.data?.carga ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground p-4">Aún no hay tareas asignadas.</p>
              ) : (
                <div className="divide-y divide-border/40">
                  {(dashQ.data?.carga ?? []).map((c: any) => (
                    <div key={c.user_id} className="flex items-center justify-between py-2 px-1 text-sm">
                      <span className="font-medium truncate">{c.nombre}</span>
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="outline">{c.activas} activas</Badge>
                        {c.vencidas > 0 && <Badge className="bg-red-500/15 text-red-600 border-red-500/30">{c.vencidas} venc</Badge>}
                        <span className="text-muted-foreground">{c.tasa}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
            <Panel title="Clientes con más tareas abiertas" icon={<UserRound className="h-4 w-4" />}>
              {(dashQ.data?.clientesTop ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground p-4">Sin datos.</p>
              ) : (
                <div className="divide-y divide-border/40">
                  {(dashQ.data?.clientesTop ?? []).map((c: any) => (
                    <div key={c.cliente_id} className="flex items-center justify-between py-2 px-1 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.nombre}</div>
                        <div className="text-[10px] text-muted-foreground">{c.rfc}</div>
                      </div>
                      <Badge variant="outline">{c.abiertas} abiertas</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </TabsContent>

        {/* KANBAN */}
        <TabsContent value="kanban" className="mt-6 space-y-4">
          <FiltrosBar filters={filters} setFilters={setFilters} equipo={equipoQ.data ?? []} cliente={cliente} />
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {KANBAN_ESTADOS.map((est) => (
              <KanbanColumna
                key={est}
                estado={est}
                tareas={tareas.filter((t) => t.kanban_estado === est)}
                onCardClick={(id) => setDetalleId(id)}
                onChangeEstado={(id, nuevo) => cambiarEstado.mutate({ id, estado: nuevo })}
              />
            ))}
          </div>
        </TabsContent>

        {/* LISTA */}
        <TabsContent value="lista" className="mt-6 space-y-4">
          <FiltrosBar filters={filters} setFilters={setFilters} equipo={equipoQ.data ?? []} cliente={cliente} />
          <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Tarea</th>
                    <th className="text-left p-3">Cliente</th>
                    <th className="text-left p-3">Responsable</th>
                    <th className="text-left p-3">Fecha límite</th>
                    <th className="text-left p-3">Prioridad</th>
                    <th className="text-left p-3">Estado</th>
                    <th className="text-left p-3">Origen</th>
                    <th className="text-right p-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {tareas.length === 0 && (
                    <tr><td colSpan={8} className="p-6 text-center text-muted-foreground text-xs">Sin tareas. Crea la primera o genera desde calendario.</td></tr>
                  )}
                  {tareas.map((t) => {
                    const dr = diasRestantes(t.due_date);
                    const orig = ORIGEN_LABEL[t.origen ?? "manual"] ?? ORIGEN_LABEL.manual;
                    return (
                      <tr key={t.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setDetalleId(t.id)}>
                        <td className="p-3 max-w-xs">
                          <div className="font-medium truncate">{t.titulo}</div>
                          {t.tipo && <div className="text-[10px] text-muted-foreground">{TIPO_LABEL[t.tipo] ?? t.tipo}</div>}
                        </td>
                        <td className="p-3 text-xs">
                          {t.cliente_nombre ? (
                            <div><div className="font-medium">{t.cliente_nombre}</div><div className="text-muted-foreground">{t.cliente_rfc}</div></div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3 text-xs">{t.asignado_nombre ?? <span className="text-amber-600">Sin asignar</span>}</td>
                        <td className={`p-3 text-xs ${dr.tono}`}>{dr.texto}{t.due_date && <div className="text-[10px] text-muted-foreground">{t.due_date}</div>}</td>
                        <td className="p-3"><Badge className={PRIO_COLOR[t.prioridad]}>{t.prioridad}</Badge></td>
                        <td className="p-3"><Badge className={ESTADO_COLOR[t.estatus] ?? ESTADO_COLOR[t.kanban_estado]}>{KANBAN_LABEL[t.kanban_estado] ?? t.estatus}</Badge></td>
                        <td className="p-3 text-xs"><span className="inline-flex items-center gap-1 text-muted-foreground"><orig.icon className="h-3 w-3" />{orig.label}</span></td>
                        <td className="p-3 text-right">
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); if (confirm("¿Eliminar tarea?")) eliminar.mutate(t.id); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* PRODUCTIVIDAD */}
        <TabsContent value="productividad" className="mt-6 space-y-4">
          <Panel title="Desempeño del equipo" icon={<Sparkles className="h-4 w-4" />}>
            {(dashQ.data?.carga ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground p-4">Aún no hay tareas asignadas para calcular productividad.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="text-left p-2">Colaborador</th><th className="text-right p-2">Activas</th><th className="text-right p-2">Vencidas</th><th className="text-right p-2">Finalizadas</th><th className="text-right p-2">Cumplimiento</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {(dashQ.data?.carga ?? []).map((c: any) => (
                      <tr key={c.user_id}>
                        <td className="p-2 font-medium">{c.nombre}</td>
                        <td className="p-2 text-right tabular-nums">{c.activas}</td>
                        <td className={`p-2 text-right tabular-nums ${c.vencidas > 0 ? "text-red-600" : ""}`}>{c.vencidas}</td>
                        <td className="p-2 text-right tabular-nums">{c.finalizadas}</td>
                        <td className="p-2 text-right">
                          <div className="inline-flex items-center gap-2">
                            <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full ${c.tasa >= 80 ? "bg-emerald-500" : c.tasa >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${c.tasa}%` }} />
                            </div>
                            <span className="text-xs tabular-nums">{c.tasa}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <Panel title="Cuellos de botella" icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}>
            <div className="grid sm:grid-cols-2 gap-3 p-3 text-sm">
              <BottleneckCard label="Esperando cliente" value={kpis?.esperando ?? 0} hint="Tareas detenidas por documentación pendiente del cliente." />
              <BottleneckCard label="En revisión" value={kpis?.revision ?? 0} hint="Esperan visto bueno del titular o supervisor." />
            </div>
          </Panel>
        </TabsContent>
      </Tabs>

      <CrearTareaDialog open={openCreate} onClose={() => setOpenCreate(false)} onCreated={invalidate} equipo={equipoQ.data ?? []} clienteActivo={cliente} />
      {detalleId && (
        <DetalleTareaDialog id={detalleId} onClose={() => setDetalleId(null)} onChanged={invalidate} equipo={equipoQ.data ?? []} />
      )}
    </div>
  );
}

// ----------------- Sub componentes -----------------

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: "default" | "red" | "amber" | "emerald" | "blue" }) {
  const map: Record<string, string> = {
    default: "text-foreground",
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    blue: "text-blue-600 dark:text-blue-400",
  };
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span><Icon className={`h-4 w-4 ${map[tone]}`} />
      </div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${map[tone]}`}>{value}</div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/60 flex items-center gap-2 text-sm font-medium">{icon}{title}</div>
      <div className="p-2">{children}</div>
    </div>
  );
}

function BottleneckCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between"><span className="text-sm font-medium">{label}</span><Badge variant="outline">{value}</Badge></div>
      <p className="text-xs text-muted-foreground mt-1.5">{hint}</p>
    </div>
  );
}

function ListaCompacta({ items, onClick, vacioMsg }: { items: TareaRow[]; onClick: (id: string) => void; vacioMsg?: string }) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground p-4">{vacioMsg ?? "Sin elementos."}</p>;
  return (
    <div className="divide-y divide-border/40">
      {items.map((t) => {
        const dr = diasRestantes(t.due_date);
        return (
          <button key={t.id} onClick={() => onClick(t.id)} className="w-full text-left flex items-center justify-between py-2 px-2 hover:bg-muted/30 rounded">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{t.titulo}</div>
              <div className="text-[10px] text-muted-foreground truncate">{t.cliente_nombre ?? "Sin cliente"} · {t.asignado_nombre ?? "Sin asignar"}</div>
            </div>
            <span className={`text-xs whitespace-nowrap ${dr.tono}`}>{dr.texto}</span>
          </button>
        );
      })}
    </div>
  );
}

function FiltrosBar({ filters, setFilters, equipo, cliente }: { filters: any; setFilters: any; equipo: { id: string; name: string }[]; cliente: any }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/40 p-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={filters.search} onChange={(e) => setFilters((f: any) => ({ ...f, search: e.target.value }))} placeholder="Buscar tarea…" className="pl-8 h-9" />
      </div>
      <Select value={filters.prioridad || "all"} onValueChange={(v) => setFilters((f: any) => ({ ...f, prioridad: v === "all" ? "" : v }))}>
        <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="Prioridad" /></SelectTrigger>
        <SelectContent><SelectItem value="all">Todas</SelectItem>{PRIORIDADES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={filters.asignadoA || "all"} onValueChange={(v) => setFilters((f: any) => ({ ...f, asignadoA: v === "all" ? "" : v }))}>
        <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Responsable" /></SelectTrigger>
        <SelectContent><SelectItem value="all">Todos</SelectItem>{equipo.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={filters.origen || "all"} onValueChange={(v) => setFilters((f: any) => ({ ...f, origen: v === "all" ? "" : v }))}>
        <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Origen" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {Object.entries(ORIGEN_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {cliente?.id && (
        <label className="flex items-center gap-2 text-xs px-2 cursor-pointer">
          <Checkbox checked={filters.soloCliente} onCheckedChange={(c) => setFilters((f: any) => ({ ...f, soloCliente: !!c }))} />
          Solo {cliente.razon_social}
        </label>
      )}
    </div>
  );
}

function KanbanColumna({ estado, tareas, onCardClick, onChangeEstado }: {
  estado: typeof KANBAN_ESTADOS[number];
  tareas: TareaRow[];
  onCardClick: (id: string) => void;
  onChangeEstado: (id: string, est: typeof KANBAN_ESTADOS[number]) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`rounded-xl border bg-card/40 p-2 min-h-[400px] transition-colors ${over ? "border-primary bg-primary/5" : "border-border/60"}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const id = e.dataTransfer.getData("text/plain");
        if (id) onChangeEstado(id, estado);
      }}
    >
      <div className="flex items-center justify-between px-2 py-1.5 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide">{KANBAN_LABEL[estado]}</span>
        <Badge variant="outline" className="text-[10px]">{tareas.length}</Badge>
      </div>
      <div className="space-y-2">
        {tareas.map((t) => {
          const dr = diasRestantes(t.due_date);
          const orig = ORIGEN_LABEL[t.origen ?? "manual"] ?? ORIGEN_LABEL.manual;
          return (
            <div
              key={t.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
              onClick={() => onCardClick(t.id)}
              className="rounded-lg border border-border/60 bg-background/80 p-3 hover:border-primary/50 cursor-pointer space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium leading-tight">{t.titulo}</div>
                <Badge className={`${PRIO_COLOR[t.prioridad]} text-[10px] shrink-0`}>{t.prioridad}</Badge>
              </div>
              {t.cliente_nombre && <div className="text-[11px] text-muted-foreground truncate">{t.cliente_nombre} · {t.cliente_rfc}</div>}
              <div className="flex items-center justify-between text-[11px]">
                <span className="inline-flex items-center gap-1 text-muted-foreground"><orig.icon className="h-3 w-3" />{orig.label}</span>
                <span className={dr.tono}>{dr.texto}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/40">
                <span className="text-muted-foreground truncate">{t.asignado_nombre ?? "Sin asignar"}</span>
              </div>
            </div>
          );
        })}
        {tareas.length === 0 && <div className="text-[11px] text-muted-foreground text-center py-6 border border-dashed border-border/40 rounded">Vacío</div>}
      </div>
    </div>
  );
}

// ----------------- CREATE DIALOG -----------------

function CrearTareaDialog({ open, onClose, onCreated, equipo, clienteActivo }: { open: boolean; onClose: () => void; onCreated: () => void; equipo: { id: string; name: string }[]; clienteActivo: any }) {
  const _upsert = useServerFn(upsertTarea);
  const _clientes = useServerFn(listClientesDespacho);
  const clientesQ = useQuery({ queryKey: ["clientes-despacho"], queryFn: () => _clientes({}), enabled: open });
  const [form, setForm] = useState<any>({
    titulo: "",
    descripcion: "",
    cliente_id: clienteActivo?.id ?? "",
    tipo: "administrativo",
    prioridad: "media",
    asignado_a: "",
    due_date: "",
    requires_evidence: false,
  });

  const mut = useMutation({
    mutationFn: () =>
      _upsert({
        data: {
          titulo: form.titulo,
          descripcion: form.descripcion || null,
          cliente_id: form.cliente_id || null,
          tipo: form.tipo || null,
          prioridad: form.prioridad,
          asignado_a: form.asignado_a || null,
          due_date: form.due_date || null,
          requires_evidence: form.requires_evidence,
          origen: "manual",
        },
      }),
    onSuccess: () => {
      toast.success("Tarea creada");
      onCreated();
      onClose();
      setForm({ titulo: "", descripcion: "", cliente_id: clienteActivo?.id ?? "", tipo: "administrativo", prioridad: "media", asignado_a: "", due_date: "", requires_evidence: false });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nueva tarea</DialogTitle>
          <DialogDescription>Crea una tarea manual para tu despacho.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nombre *</Label>
            <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ej. Conciliar BBVA octubre" />
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea value={form.descripcion} rows={2} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cliente</Label>
              <Select value={form.cliente_id || "none"} onValueChange={(v) => setForm({ ...form, cliente_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Sin cliente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin cliente</SelectItem>
                  {(clientesQ.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.razon_social}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS_TAREA.map((t) => <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Responsable</Label>
              <Select value={form.asignado_a || "none"} onValueChange={(v) => setForm({ ...form, asignado_a: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {equipo.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridad</Label>
              <Select value={form.prioridad} onValueChange={(v) => setForm({ ...form, prioridad: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORIDADES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha límite</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox checked={form.requires_evidence} onCheckedChange={(c) => setForm({ ...form, requires_evidence: !!c })} />
                Requiere evidencia para cerrar
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={!form.titulo.trim() || mut.isPending} onClick={() => mut.mutate()}>Crear tarea</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------- DETALLE DIALOG -----------------

function DetalleTareaDialog({ id, onClose, onChanged, equipo }: { id: string; onClose: () => void; onChanged: () => void; equipo: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const _detalle = useServerFn(getTareaDetalle);
  const _comentar = useServerFn(addComentario);
  const _setEstado = useServerFn(setKanbanEstado);
  const _upsert = useServerFn(upsertTarea);
  const _tiempo = useServerFn(sumarTiempo);
  const _eliminar = useServerFn(eliminarTarea);

  const detalleQ = useQuery({ queryKey: ["tarea", id], queryFn: () => _detalle({ data: { id } }) });
  const [comentario, setComentario] = useState("");
  const [minutos, setMinutos] = useState(15);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["tarea", id] }); onChanged(); };

  const addCom = useMutation({ mutationFn: () => _comentar({ data: { tareaId: id, contenido: comentario } }), onSuccess: () => { setComentario(""); refresh(); } });
  const chgEstado = useMutation({
    mutationFn: (e: typeof KANBAN_ESTADOS[number]) => _setEstado({ data: { id, estado: e } }),
    onSuccess: () => { refresh(); toast.success("Estado actualizado"); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  const chgAsignado = useMutation({
    mutationFn: (uid: string | null) => _upsert({ data: { id, titulo: detalleQ.data!.tarea.titulo, prioridad: detalleQ.data!.tarea.prioridad as any, asignado_a: uid } }),
    onSuccess: refresh,
  });
  const sumar = useMutation({ mutationFn: () => _tiempo({ data: { id, minutos } }), onSuccess: refresh });
  const elim = useMutation({ mutationFn: () => _eliminar({ data: { id } }), onSuccess: () => { onChanged(); onClose(); } });

  if (detalleQ.isLoading || !detalleQ.data) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent><div className="py-10 text-center text-muted-foreground text-sm">Cargando…</div></DialogContent>
      </Dialog>
    );
  }
  const t = detalleQ.data.tarea;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-lg">{t.titulo}</DialogTitle>
              <DialogDescription className="text-xs">{t.cliente_nombre ? `${t.cliente_nombre} · ${t.cliente_rfc}` : "Sin cliente"}</DialogDescription>
            </div>
            <Badge className={ESTADO_COLOR[t.estatus] ?? ESTADO_COLOR[t.kanban_estado]}>{KANBAN_LABEL[t.kanban_estado]}</Badge>
          </div>
        </DialogHeader>

        <div className="grid md:grid-cols-3 gap-3 text-sm">
          <div className="md:col-span-2 space-y-4">
            {t.descripcion && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{t.descripcion}</p>}

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Cambiar estado</div>
              <div className="flex flex-wrap gap-1.5">
                {KANBAN_ESTADOS.map((e) => (
                  <Button key={e} size="sm" variant={t.kanban_estado === e ? "default" : "outline"} onClick={() => chgEstado.mutate(e)}>{KANBAN_LABEL[e]}</Button>
                ))}
              </div>
              {t.requires_evidence && t.kanban_estado !== "finalizado" && (
                <p className="text-[11px] text-amber-600 mt-2 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Esta tarea requiere evidencia para finalizarse.</p>
              )}
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />Comentarios</div>
              <div className="flex gap-2">
                <Textarea value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Agregar comentario interno…" rows={2} />
                <Button onClick={() => addCom.mutate()} disabled={!comentario.trim() || addCom.isPending}>Enviar</Button>
              </div>
              <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                {detalleQ.data.comentarios.length === 0 && <p className="text-xs text-muted-foreground">Sin comentarios.</p>}
                {detalleQ.data.comentarios.map((c: any) => (
                  <div key={c.id} className="rounded border border-border/60 p-2 bg-muted/20">
                    <div className="text-[11px] text-muted-foreground flex justify-between"><span>{c.autor}</span><span>{new Date(c.created_at).toLocaleString("es-MX")}</span></div>
                    <p className="text-sm whitespace-pre-wrap">{c.contenido}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1"><History className="h-3.5 w-3.5" />Bitácora</div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto text-xs">
                {detalleQ.data.bitacora.map((b: any) => (
                  <div key={b.id} className="flex items-start gap-2 text-muted-foreground">
                    <span className="font-mono text-[10px] mt-0.5">{new Date(b.created_at).toLocaleString("es-MX")}</span>
                    <span><b className="text-foreground">{b.autor}</b> · {b.evento}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="rounded-lg border border-border/60 p-3 space-y-2">
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Responsable</Label>
                <Select value={t.asignado_a ?? "none"} onValueChange={(v) => chgAsignado.mutate(v === "none" ? null : v)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {equipo.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Prioridad</span><Badge className={PRIO_COLOR[t.prioridad]}>{t.prioridad}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Fecha límite</span><span>{t.due_date ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tipo</span><span>{t.tipo ? TIPO_LABEL[t.tipo] : "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Origen</span><span>{(ORIGEN_LABEL[t.origen ?? "manual"] ?? ORIGEN_LABEL.manual).label}</span></div>
            </div>

            <div className="rounded-lg border border-border/60 p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Timer className="h-3 w-3" />Tiempo invertido</div>
              <div className="text-lg font-semibold tabular-nums">{Math.floor(t.tiempo_invertido_min / 60)}h {t.tiempo_invertido_min % 60}m</div>
              <div className="flex items-center gap-1.5">
                <Input type="number" min={1} max={480} value={minutos} onChange={(e) => setMinutos(parseInt(e.target.value || "0", 10))} className="h-8" />
                <Button size="sm" variant="outline" onClick={() => sumar.mutate()}>+ min</Button>
              </div>
            </div>

            <Button variant="ghost" size="sm" className="w-full text-red-600 hover:text-red-700" onClick={() => { if (confirm("¿Eliminar tarea?")) elim.mutate(); }}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar tarea
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
