import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Activity, AlertTriangle, CheckCircle2, FileText, Banknote, BookOpen,
  Play, ShieldCheck, Sparkles, ListChecks, TrendingUp, ScanSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveCliente } from "@/lib/active-cliente";
import {
  runConciliacionIntegral,
  listarIncidencias,
  getDashboardConciliacion,
  getTimeline,
  actualizarEstatus,
  crearTareaDesdeIncidencia,
  explicarIncidencia,
} from "@/lib/conciliacion-integral/engine.functions";

export const Route = createFileRoute("/app/conciliacion-integral")({
  component: ConciliacionIntegralPage,
});

const TIPO_LABEL: Record<string, string> = {
  ingreso_sat_sin_poliza: "Ingreso SAT sin póliza",
  gasto_sat_sin_poliza: "Gasto SAT sin póliza",
  pago_banco_sin_cfdi: "Pago banco sin CFDI",
  cfdi_sin_movimiento: "CFDI sin movimiento",
  diferencia_monto: "Diferencia de monto",
  cfdi_duplicado: "CFDI duplicado",
  cfdi_cancelado_no_ajustado: "CFDI cancelado no ajustado",
};

function mxn(n: number | null | undefined) {
  return `$${Number(n ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

function semaforoClass(g: string) {
  if (g === "critica") return "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30";
  if (g === "media") return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/30";
}

function ConciliacionIntegralPage() {
  const { cliente } = useActiveCliente();
  const qc = useQueryClient();
  const runFn = useServerFn(runConciliacionIntegral);
  const dashFn = useServerFn(getDashboardConciliacion);
  const listFn = useServerFn(listarIncidencias);

  const [tipoFiltro, setTipoFiltro] = useState<string>("all");
  const [gravedadFiltro, setGravedadFiltro] = useState<string>("all");
  const [estatusFiltro, setEstatusFiltro] = useState<string>("abierta");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const dashboard = useQuery({
    queryKey: ["ci-dashboard", cliente?.id ?? "all"],
    queryFn: () => dashFn({ data: { cliente_id: cliente?.id } }),
    staleTime: 30_000,
  });

  const incidencias = useQuery({
    queryKey: ["ci-incidencias", cliente?.id ?? "all", tipoFiltro, gravedadFiltro, estatusFiltro],
    queryFn: () =>
      listFn({
        data: {
          cliente_id: cliente?.id,
          tipo: tipoFiltro !== "all" ? tipoFiltro : undefined,
          gravedad: gravedadFiltro !== "all" ? gravedadFiltro : undefined,
          estatus: estatusFiltro !== "all" ? estatusFiltro : undefined,
          limit: 200,
        },
      }),
    staleTime: 15_000,
  });

  const run = useMutation({
    mutationFn: () => {
      if (!cliente) throw new Error("Selecciona un expediente primero");
      return runFn({ data: { cliente_id: cliente.id, trigger: "manual" } });
    },
    onSuccess: (r) => {
      toast.success(`Conciliación completada: ${r.total} incidencias · score ${r.score}`);
      qc.invalidateQueries({ queryKey: ["ci-dashboard"] });
      qc.invalidateQueries({ queryKey: ["ci-incidencias"] });
      qc.invalidateQueries({ queryKey: ["ci-timeline"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const k = dashboard.data?.kpis;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-primary mb-2">
            <ScanSearch className="h-3 w-3" /> Auditor automático
          </div>
          <h1 className="serif text-3xl text-foreground">Conciliación SAT vs Contabilidad</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Cruza CFDI del SAT, pólizas contables y movimientos bancarios para detectar
            ingresos omitidos, gastos sin registrar, CFDI sin pago, duplicados y diferencias.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cliente ? (
            <Badge variant="outline" className="font-mono text-xs">{cliente.rfc}</Badge>
          ) : (
            <Badge variant="outline" className="text-xs">Sin expediente activo</Badge>
          )}
          <Button asChild variant="outline">
            <a href="/app/polizas"><BookOpen className="h-4 w-4 mr-1" />Pólizas</a>
          </Button>
          <Button onClick={() => run.mutate()} disabled={!cliente || run.isPending}>
            <Play className="h-4 w-4 mr-1" />
            {run.isPending ? "Conciliando…" : "Correr ahora"}
          </Button>
        </div>
      </header>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard"><Activity className="h-4 w-4 mr-1" /> Dashboard</TabsTrigger>
          <TabsTrigger value="incidencias"><AlertTriangle className="h-4 w-4 mr-1" /> Incidencias</TabsTrigger>
          <TabsTrigger value="timeline"><TrendingUp className="h-4 w-4 mr-1" /> Tendencia</TabsTrigger>
        </TabsList>

        {/* DASHBOARD */}
        <TabsContent value="dashboard" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Incidencias abiertas" value={String(k?.total_abiertas ?? 0)} icon={AlertTriangle} accent="text-foreground" />
            <Kpi label="Críticas" value={String(k?.criticas ?? 0)} icon={ShieldCheck} accent="text-red-600 dark:text-red-300" />
            <Kpi label="Monto observado" value={mxn(k?.monto_observado)} icon={Banknote} accent="text-foreground" />
            <Kpi label="Impacto ISR estimado" value={mxn(k?.impacto_isr)} icon={TrendingUp} accent="text-amber-600 dark:text-amber-300" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MiniKpi label="Ingresos omitidos" value={k?.ingresos_omitidos ?? 0} icon={FileText} />
            <MiniKpi label="Gastos sin registrar" value={k?.gastos_sin_registrar ?? 0} icon={BookOpen} />
            <MiniKpi label="CFDI sin pago" value={k?.cfdi_sin_pago ?? 0} icon={FileText} />
            <MiniKpi label="Pagos sin CFDI" value={k?.pagos_sin_cfdi ?? 0} icon={Banknote} />
            <MiniKpi label="Duplicados" value={k?.duplicados ?? 0} icon={ListChecks} />
          </div>

          {!cliente && (
            <Card className="p-6 text-sm text-muted-foreground">
              Selecciona un expediente en el menú superior para ver KPIs y correr la conciliación.
            </Card>
          )}

          {dashboard.data && dashboard.data.top_clientes.length > 0 && (
            <Card className="p-4">
              <h3 className="font-semibold mb-3 text-sm">Top clientes con diferencias</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Incidencias</TableHead>
                    <TableHead className="text-right">Críticas</TableHead>
                    <TableHead className="text-right">Monto observado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.data.top_clientes.map((c) => (
                    <TableRow key={c.cliente_id}>
                      <TableCell>{c.nombre}</TableCell>
                      <TableCell className="text-right">{c.total}</TableCell>
                      <TableCell className="text-right">
                        <Badge className={semaforoClass("critica")}>{c.criticas}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{mxn(c.monto)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* INCIDENCIAS */}
        <TabsContent value="incidencias" className="space-y-3 mt-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={estatusFiltro} onValueChange={setEstatusFiltro}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Estatus" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estatus</SelectItem>
                <SelectItem value="abierta">Abiertas</SelectItem>
                <SelectItem value="revisada">Revisadas</SelectItem>
                <SelectItem value="escalada">Escaladas</SelectItem>
                <SelectItem value="resuelta">Resueltas</SelectItem>
                <SelectItem value="falso_positivo">Falsos positivos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={gravedadFiltro} onValueChange={setGravedadFiltro}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Gravedad" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="critica">Críticas</SelectItem>
                <SelectItem value="media">Medias</SelectItem>
                <SelectItem value="baja">Bajas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {Object.entries(TIPO_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Gravedad</TableHead>
                  <TableHead>Estatus</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidencias.isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">Cargando…</TableCell></TableRow>
                ) : (incidencias.data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                    Sin incidencias para los filtros actuales.
                  </TableCell></TableRow>
                ) : (
                  (incidencias.data as any[]).map((r) => (
                    <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelectedId(r.id)}>
                      <TableCell className="font-medium">{TIPO_LABEL[r.tipo] ?? r.tipo}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.clientes?.razon_social ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.fecha ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{mxn(r.monto)}</TableCell>
                      <TableCell><Badge className={semaforoClass(r.gravedad)}>{r.gravedad}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{r.estatus}</Badge></TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">Ver →</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* TIMELINE */}
        <TabsContent value="timeline" className="mt-4">
          {cliente ? <TimelinePanel clienteId={cliente.id} /> : (
            <Card className="p-6 text-sm text-muted-foreground">
              Selecciona un expediente para ver su tendencia de consistencia.
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <IncidenciaDrawer
        id={selectedId}
        onClose={() => setSelectedId(null)}
        onChanged={() => {
          qc.invalidateQueries({ queryKey: ["ci-incidencias"] });
          qc.invalidateQueries({ queryKey: ["ci-dashboard"] });
        }}
      />
    </div>
  );
}

function Kpi({ label, value, icon: Icon, accent }: { label: string; value: string; icon: any; accent: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <Icon className={`h-4 w-4 ${accent}`} />
      </div>
      <div className={`text-2xl font-bold mt-2 ${accent}`}>{value}</div>
    </Card>
  );
}

function MiniKpi({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return (
    <Card className="p-3 flex items-center gap-3">
      <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary grid place-items-center"><Icon className="h-4 w-4" /></div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
      </div>
    </Card>
  );
}

function TimelinePanel({ clienteId }: { clienteId: string }) {
  const fn = useServerFn(getTimeline);
  const q = useQuery({
    queryKey: ["ci-timeline", clienteId],
    queryFn: () => fn({ data: { cliente_id: clienteId, limit: 24 } }),
    staleTime: 30_000,
  });
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return <Card className="p-6 text-sm text-muted-foreground">Aún no hay corridas para este expediente.</Card>;
  }
  const max = Math.max(100, ...rows.map((r) => r.score));
  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-semibold text-sm mb-1">Score de consistencia (últimas corridas)</h3>
        <p className="text-xs text-muted-foreground">0 = inconsistencias severas. 100 = SAT, contabilidad y banco alineados.</p>
      </div>
      <div className="flex items-end gap-1 h-32">
        {rows.map((r, i) => {
          const h = Math.max(4, (r.score / max) * 100);
          const color = r.score < 60 ? "bg-red-500" : r.score < 80 ? "bg-amber-500" : "bg-emerald-500";
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
              <div className={`w-full rounded-t ${color}`} style={{ height: `${h}%` }} title={`${r.score} · ${r.created_at?.slice(0, 10)}`} />
            </div>
          );
        })}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead className="text-right">Críticas</TableHead>
            <TableHead className="text-right">Medias</TableHead>
            <TableHead className="text-right">Monto obs.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...rows].reverse().map((r, i) => (
            <TableRow key={i}>
              <TableCell className="text-xs">{r.created_at?.slice(0, 16).replace("T", " ")}</TableCell>
              <TableCell className="text-right font-semibold">{r.score}</TableCell>
              <TableCell className="text-right">{r.criticas}</TableCell>
              <TableCell className="text-right">{r.medias}</TableCell>
              <TableCell className="text-right">{mxn(r.monto_observado)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function IncidenciaDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const listFn = useServerFn(listarIncidencias);
  const explainFn = useServerFn(explicarIncidencia);
  const updFn = useServerFn(actualizarEstatus);
  const taskFn = useServerFn(crearTareaDesdeIncidencia);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["ci-incidencia-detail", id],
    queryFn: async () => {
      if (!id) return null;
      const rows = await listFn({ data: { cliente_id: undefined, limit: 500 } });
      return (rows as any[]).find((r) => r.id === id) ?? null;
    },
    enabled: !!id,
  });

  const explain = useMutation({
    mutationFn: () => explainFn({ data: { id: id! } }),
    onSuccess: (r) => {
      if (r.error) toast.error(r.error);
      else toast.success("Explicación generada");
      qc.invalidateQueries({ queryKey: ["ci-incidencia-detail", id] });
    },
  });

  const updateEstatus = useMutation({
    mutationFn: (estatus: "revisada" | "resuelta" | "falso_positivo" | "escalada") =>
      updFn({ data: { id: id!, estatus } }),
    onSuccess: () => { toast.success("Actualizada"); onChanged(); onClose(); },
  });

  const tarea = useMutation({
    mutationFn: () => taskFn({ data: { id: id! } }),
    onSuccess: () => { toast.success("Tarea creada en Centro de Tareas"); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const inc: any = q.data;

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{inc ? TIPO_LABEL[inc.tipo] ?? inc.tipo : "Incidencia"}</SheetTitle>
          <SheetDescription>
            {inc ? `${inc.clientes?.razon_social ?? ""} · ${inc.fecha ?? "—"} · ${mxn(inc.monto)}` : "Cargando…"}
          </SheetDescription>
        </SheetHeader>

        {inc && (
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-3">
              <Source title="SAT" color="bg-emerald-500/10 border-emerald-500/30" present={!!inc.cfdi_id}
                detail={inc.cfdi_id ? `CFDI ${String(inc.detalle?.uuid ?? "").slice(0, 8)}…` : "—"} />
              <Source title="Contabilidad" color="bg-blue-500/10 border-blue-500/30" present={!!inc.poliza_id}
                detail={inc.poliza_id ? "Póliza registrada" : "Sin póliza"} />
              <Source title="Banco" color="bg-amber-500/10 border-amber-500/30" present={!!inc.movimiento_id}
                detail={inc.movimiento_id ? "Movimiento conciliado" : "Sin movimiento"} />
            </div>

            <Card className="p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Recomendación base</div>
              <div className="text-sm">{inc.recomendacion ?? "—"}</div>
            </Card>

            <Card className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Explicación IA</div>
                <Button size="sm" variant="outline" onClick={() => explain.mutate()} disabled={explain.isPending}>
                  <Sparkles className="h-3 w-3 mr-1" />
                  {explain.isPending ? "Analizando…" : inc.explicacion_ia ? "Regenerar" : "Explicar con IA"}
                </Button>
              </div>
              <div className="text-sm whitespace-pre-line">{inc.explicacion_ia ?? "Aún no se ha generado explicación."}</div>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Card className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Impacto ISR estimado</div>
                <div className="text-lg font-semibold text-amber-600 dark:text-amber-300">{mxn(inc.impacto_isr)}</div>
              </Card>
              <Card className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Impacto IVA estimado</div>
                <div className="text-lg font-semibold text-amber-600 dark:text-amber-300">{mxn(inc.impacto_iva)}</div>
              </Card>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button size="sm" onClick={() => tarea.mutate()} disabled={tarea.isPending || !!inc.tarea_id}>
                <ListChecks className="h-3 w-3 mr-1" />
                {inc.tarea_id ? "Tarea ya creada" : "Crear tarea"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => updateEstatus.mutate("revisada")}>
                <CheckCircle2 className="h-3 w-3 mr-1" /> Marcar revisada
              </Button>
              <Button size="sm" variant="outline" onClick={() => updateEstatus.mutate("escalada")}>
                Escalar
              </Button>
              <Button size="sm" variant="outline" onClick={() => updateEstatus.mutate("resuelta")}>
                Resuelta
              </Button>
              <Button size="sm" variant="ghost" onClick={() => updateEstatus.mutate("falso_positivo")}>
                Falso positivo
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Source({ title, color, present, detail }: { title: string; color: string; present: boolean; detail: string }) {
  return (
    <div className={`rounded-lg border p-3 ${color}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="text-sm font-medium mt-1">{present ? "✓ Presente" : "✗ Ausente"}</div>
      <div className="text-[11px] text-muted-foreground truncate">{detail}</div>
    </div>
  );
}
