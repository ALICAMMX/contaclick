import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Sparkles, FileText, TrendingUp, AlertTriangle, Target, Send,
  CheckCircle2, Clock, Lightbulb, Calculator, Plus, ListTodo, ArrowRight, Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  obtenerKpisReportes, listarReportes, listarClientesParaReporte, generarReporte,
  obtenerReporte, marcarReporteEnviado, listarRecomendaciones, actualizarRecomendacion,
  crearTareaDesdeRecomendacion, simularEscenario, listarSimulaciones,
} from "@/lib/reportes-ejecutivos/reportes-ejecutivos.functions";

export const Route = createFileRoute("/app/reporte-ejecutivo")({
  head: () => ({
    meta: [
      { title: "Reporte Ejecutivo + Agente Fiscal IA — ContaClick" },
      { name: "description", content: "Reportes ejecutivos automáticos, hallazgos IA, recomendaciones y simulador estratégico." },
    ],
  }),
  component: ReporteEjecutivoPage,
});

const fmtMxn = (cents: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format((cents ?? 0) / 100);

const fmtPesos = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n ?? 0);

const prioridadColor: Record<string, string> = {
  alta: "bg-destructive/15 text-destructive border-destructive/30",
  media: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  baja: "bg-muted text-muted-foreground border-border",
};

const categoriaLabel: Record<string, string> = {
  optimizacion: "Optimización",
  correccion: "Corrección",
  riesgo_sat: "Riesgo SAT",
  flujo: "Flujo de efectivo",
  nomina: "Nómina",
  otro: "Otro",
};

function ReporteEjecutivoPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("dashboard");
  const [openGenerar, setOpenGenerar] = useState(false);
  const [openSim, setOpenSim] = useState(false);
  const [openReporte, setOpenReporte] = useState<string | null>(null);
  const [clienteSel, setClienteSel] = useState<string>("");
  const [escenario, setEscenario] = useState("");
  const [paramsTexto, setParamsTexto] = useState("");

  const kpis = useQuery({ queryKey: ["re-kpis"], queryFn: () => obtenerKpisReportes() });
  const reportes = useQuery({ queryKey: ["re-list"], queryFn: () => listarReportes({ data: {} }) });
  const clientes = useQuery({ queryKey: ["re-clientes"], queryFn: () => listarClientesParaReporte() });
  const recs = useQuery({ queryKey: ["re-recs"], queryFn: () => listarRecomendaciones({ data: {} }) });
  const sims = useQuery({ queryKey: ["re-sims"], queryFn: () => listarSimulaciones({ data: {} }) });

  const mGenerar = useMutation({
    mutationFn: (cliente_id: string) => generarReporte({ data: { cliente_id, tipo: "mensual" } }),
    onSuccess: (r) => {
      toast.success(`Reporte listo · ${r.hallazgos_count} hallazgos · ${r.recomendaciones_count} recomendaciones`);
      qc.invalidateQueries({ queryKey: ["re-list"] });
      qc.invalidateQueries({ queryKey: ["re-kpis"] });
      qc.invalidateQueries({ queryKey: ["re-recs"] });
      setOpenGenerar(false);
      setOpenReporte(r.id);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al generar"),
  });

  const mEnviar = useMutation({
    mutationFn: (id: string) => marcarReporteEnviado({ data: { id } }),
    onSuccess: () => { toast.success("Reporte marcado como enviado"); qc.invalidateQueries({ queryKey: ["re-list"] }); qc.invalidateQueries({ queryKey: ["re-kpis"] }); },
  });

  const mActualizarRec = useMutation({
    mutationFn: (v: { id: string; estado: "pendiente" | "en_proceso" | "implementada" | "descartada" }) =>
      actualizarRecomendacion({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["re-recs"] }); qc.invalidateQueries({ queryKey: ["re-kpis"] }); },
  });

  const mCrearTarea = useMutation({
    mutationFn: (id: string) => crearTareaDesdeRecomendacion({ data: { id } }),
    onSuccess: () => { toast.success("Tarea creada"); qc.invalidateQueries({ queryKey: ["re-recs"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const mSimular = useMutation({
    mutationFn: (v: { cliente_id: string; escenario: string; parametros: Record<string, string | number> }) =>
      simularEscenario({ data: v }),
    onSuccess: (r) => {
      toast.success("Simulación generada");
      qc.invalidateQueries({ queryKey: ["re-sims"] });
      setOpenSim(false);
      setEscenario(""); setParamsTexto("");
      console.log("Simulación:", r);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const repDetalle = useQuery({
    queryKey: ["re-detalle", openReporte],
    queryFn: () => openReporte ? obtenerReporte({ data: { id: openReporte } }) : null,
    enabled: !!openReporte,
  });

  const k = kpis.data;

  return (
    <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Sparkles className="h-4 w-4" />
            <span>Módulo premium</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mt-1">Reporte Ejecutivo + Agente Fiscal IA</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Convierte CFDI, bancos, SAT, conciliaciones y obligaciones en reportes ejecutivos con hallazgos, oportunidades y estrategia accionable.
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={openSim} onOpenChange={setOpenSim}>
            <DialogTrigger asChild>
              <Button variant="outline"><Calculator className="h-4 w-4 mr-2" />Simular escenario</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Simulador estratégico</DialogTitle>
                <DialogDescription>Evalúa "qué pasa si..." sobre el cliente seleccionado.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Cliente</label>
                  <Select value={clienteSel} onValueChange={setClienteSel}>
                    <SelectTrigger><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
                    <SelectContent>{clientes.data?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.razon_social ?? c.rfc} · {c.rfc}</SelectItem>
                    ))}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Escenario</label>
                  <Input placeholder="Ej. Migración a RESICO" value={escenario} onChange={(e) => setEscenario(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Parámetros (uno por línea, clave=valor)</label>
                  <Textarea rows={4} placeholder={`deduccion_extra=50000\ndiferir_gastos=true`} value={paramsTexto} onChange={(e) => setParamsTexto(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={!clienteSel || !escenario || mSimular.isPending}
                  onClick={() => {
                    const parametros: Record<string, string | number> = {};
                    paramsTexto.split("\n").forEach((l) => {
                      const [k, v] = l.split("=").map((s) => s.trim());
                      if (k && v !== undefined) parametros[k] = isNaN(Number(v)) ? v : Number(v);
                    });
                    mSimular.mutate({ cliente_id: clienteSel, escenario, parametros });
                  }}
                >{mSimular.isPending ? "Calculando..." : "Calcular"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={openGenerar} onOpenChange={setOpenGenerar}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Generar reporte ejecutivo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generar reporte ejecutivo</DialogTitle>
                <DialogDescription>El agente IA analizará todos los datos del cliente y producirá un diagnóstico premium.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <label className="text-sm font-medium">Cliente</label>
                <Select value={clienteSel} onValueChange={setClienteSel}>
                  <SelectTrigger><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
                  <SelectContent>{clientes.data?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.razon_social ?? c.rfc} · {c.rfc}</SelectItem>
                  ))}</SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button disabled={!clienteSel || mGenerar.isPending} onClick={() => mGenerar.mutate(clienteSel)}>
                  {mGenerar.isPending ? "Analizando con IA..." : "Generar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<FileText className="h-4 w-4" />} label="Reportes este mes" value={k?.reportes_generados ?? "—"} sub={`${k?.reportes_enviados ?? 0} enviados`} />
        <KpiCard icon={<Clock className="h-4 w-4" />} label="Clientes pendientes" value={k?.clientes_pendientes ?? "—"} sub="sin reporte del periodo" />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Ahorro detectado" value={k ? fmtMxn(k.ahorro_total_centavos) : "—"} sub="acumulado del mes" highlight />
        <KpiCard icon={<Lightbulb className="h-4 w-4" />} label="Recomendaciones" value={k?.recomendaciones_pendientes ?? "—"} sub={`${k?.recomendaciones_alta_prioridad ?? 0} alta prioridad`} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
          <TabsTrigger value="recomendaciones">Recomendaciones IA</TabsTrigger>
          <TabsTrigger value="simulaciones">Simulaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />Últimos reportes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {reportes.isLoading && <Skeleton className="h-24" />}
                {reportes.data?.slice(0, 6).map((r) => (
                  <button key={r.id} onClick={() => setOpenReporte(r.id)}
                    className="w-full text-left border rounded-lg p-3 hover:bg-muted/50 transition flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.clientes?.razon_social ?? r.clientes?.rfc ?? "Cliente"}</div>
                      <div className="text-xs text-muted-foreground">{r.periodo} · {r.tipo}</div>
                    </div>
                    <div className="text-right">
                      <Badge variant={r.estado === "enviado" ? "default" : "secondary"}>{r.estado}</Badge>
                      {r.ahorro_estimado_centavos > 0 && <div className="text-xs text-emerald-600 mt-1">+{fmtMxn(r.ahorro_estimado_centavos)}</div>}
                    </div>
                  </button>
                ))}
                {reportes.data?.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay reportes. Genera el primero.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Lightbulb className="h-4 w-4" />Oportunidades activas</CardTitle>
                <CardDescription>Recomendaciones de alta prioridad pendientes</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {recs.data?.filter((r) => r.estado === "pendiente" && r.prioridad === "alta").slice(0, 5).map((r) => (
                  <div key={r.id} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-sm">{r.titulo}</div>
                      <Badge className={prioridadColor[r.prioridad]} variant="outline">{r.prioridad}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.descripcion}</p>
                  </div>
                ))}
                {recs.data?.filter((r) => r.estado === "pendiente" && r.prioridad === "alta").length === 0 && (
                  <p className="text-sm text-muted-foreground">Sin recomendaciones críticas pendientes.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Target className="h-4 w-4" />Impacto potencial estimado</CardTitle>
              <CardDescription>Suma del impacto de todas las recomendaciones vigentes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold tracking-tight">{k ? fmtMxn(k.impacto_potencial_centavos) : "—"}</div>
              <p className="text-sm text-muted-foreground mt-1">{k?.recomendaciones_implementadas ?? 0} recomendaciones ya implementadas</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reportes" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Historial de reportes</CardTitle></CardHeader>
            <CardContent>
              {reportes.isLoading && <Skeleton className="h-40" />}
              <div className="divide-y">
                {reportes.data?.map((r) => (
                  <div key={r.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{r.clientes?.razon_social ?? r.clientes?.rfc}</div>
                      <div className="text-xs text-muted-foreground">{r.periodo} · {r.tipo} · {new Date(r.created_at).toLocaleString("es-MX")}</div>
                      {r.resumen_ejecutivo && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.resumen_ejecutivo}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {r.ahorro_estimado_centavos > 0 && <Badge variant="outline" className="text-emerald-600 border-emerald-600/30">+{fmtMxn(r.ahorro_estimado_centavos)}</Badge>}
                      <Badge variant={r.estado === "enviado" ? "default" : "secondary"}>{r.estado}</Badge>
                      <Button size="sm" variant="outline" onClick={() => setOpenReporte(r.id)}>Ver</Button>
                      {r.estado !== "enviado" && (
                        <Button size="sm" variant="outline" onClick={() => mEnviar.mutate(r.id)}>
                          <Send className="h-3 w-3 mr-1" />Enviar
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {reportes.data?.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Sin reportes todavía.</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recomendaciones" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Bandeja de recomendaciones</CardTitle>
              <CardDescription>Generadas por el agente IA a partir de los reportes ejecutivos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recs.isLoading && <Skeleton className="h-40" />}
              {recs.data?.map((r) => (
                <div key={r.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium">{r.titulo}</h3>
                        <Badge variant="outline">{categoriaLabel[r.categoria] ?? r.categoria}</Badge>
                        <Badge className={prioridadColor[r.prioridad]} variant="outline">{r.prioridad}</Badge>
                        <Badge variant="secondary">{r.estado}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{r.descripcion}</p>
                      {r.accion_sugerida && (
                        <p className="text-sm mt-2 flex items-start gap-2">
                          <ArrowRight className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                          <span>{r.accion_sugerida}</span>
                        </p>
                      )}
                      <div className="text-xs text-muted-foreground mt-2">
                        Cliente: {r.clientes?.razon_social ?? r.clientes?.rfc ?? "—"}
                        {r.impacto_estimado_centavos > 0 && <> · Impacto: <span className="text-emerald-600 font-medium">{fmtMxn(r.impacto_estimado_centavos)}</span></>}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => mCrearTarea.mutate(r.id)} disabled={!!r.tarea_id}>
                        <ListTodo className="h-3 w-3 mr-1" />{r.tarea_id ? "Tarea creada" : "Crear tarea"}
                      </Button>
                      {r.estado !== "implementada" && (
                        <Button size="sm" onClick={() => mActualizarRec.mutate({ id: r.id, estado: "implementada" })}>
                          <CheckCircle2 className="h-3 w-3 mr-1" />Marcar implementada
                        </Button>
                      )}
                      {r.estado !== "descartada" && (
                        <Button size="sm" variant="ghost" onClick={() => mActualizarRec.mutate({ id: r.id, estado: "descartada" })}>
                          Descartar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {recs.data?.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Sin recomendaciones aún. Genera un reporte ejecutivo.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="simulaciones" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Simulaciones estratégicas</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {sims.data?.map((s: any) => (
                <div key={s.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{s.escenario}</div>
                      <div className="text-xs text-muted-foreground">{s.clientes?.razon_social ?? s.clientes?.rfc} · {new Date(s.created_at).toLocaleString("es-MX")}</div>
                    </div>
                  </div>
                  {s.narrativa && <p className="text-sm text-muted-foreground mt-2">{s.narrativa}</p>}
                  {s.resultado && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-sm">
                      {Object.entries(s.resultado as Record<string, number>).map(([k, v]) => (
                        <div key={k} className="border rounded p-2">
                          <div className="text-xs text-muted-foreground">{k.replaceAll("_", " ")}</div>
                          <div className="font-medium">{fmtPesos(Number(v) || 0)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {(!sims.data || sims.data.length === 0) && <p className="text-sm text-muted-foreground py-6 text-center">Aún no has corrido simulaciones.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detalle de reporte */}
      <Dialog open={!!openReporte} onOpenChange={(v) => !v && setOpenReporte(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Reporte ejecutivo</DialogTitle>
            <DialogDescription>
              {repDetalle.data?.reporte?.clientes?.razon_social ?? repDetalle.data?.reporte?.clientes?.rfc} · Periodo {repDetalle.data?.reporte?.periodo}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            {repDetalle.isLoading && <Skeleton className="h-60" />}
            {repDetalle.data && (
              <ReporteDetalle data={repDetalle.data} onCrearTarea={(id) => mCrearTarea.mutate(id)} />
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground pt-4 border-t">
        Tip: enlazado desde <Link to="/app/contable" className="underline">Caja de herramientas</Link> → Auditoría y Conciliación.
      </p>
    </div>
  );
}

function KpiCard({ icon, label, value, sub, highlight }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary/30 bg-gradient-to-br from-primary/5 to-transparent" : ""}>
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">{icon}{label}</div>
        <div className="text-2xl md:text-3xl font-semibold mt-1">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function ReporteDetalle({ data, onCrearTarea }: { data: { reporte: any; recomendaciones: any[] }; onCrearTarea: (id: string) => void }) {
  const r = data.reporte;
  return (
    <div className="space-y-5">
      {r.resumen_ejecutivo && (
        <section className="border rounded-lg p-4 bg-muted/30">
          <h3 className="font-medium text-sm flex items-center gap-2 mb-2"><Sparkles className="h-4 w-4 text-primary" />Resumen ejecutivo</h3>
          <p className="text-sm whitespace-pre-line">{r.resumen_ejecutivo}</p>
        </section>
      )}

      <section className="grid md:grid-cols-2 gap-3">
        <Bloque titulo="Resumen financiero" datos={r.resumen_financiero} />
        <Bloque titulo="Resumen fiscal" datos={r.resumen_fiscal} />
      </section>

      <section className="grid md:grid-cols-2 gap-3">
        <Bloque titulo="Conciliación" datos={r.conciliacion} />
        <Bloque titulo="Salud fiscal" datos={r.salud?.subscores ?? r.salud ?? {}} />
      </section>

      {(r.hallazgos ?? []).length > 0 && (
        <section>
          <h3 className="font-medium text-sm flex items-center gap-2 mb-2"><AlertTriangle className="h-4 w-4 text-amber-500" />Hallazgos</h3>
          <div className="space-y-2">
            {(r.hallazgos as any[]).map((h, i) => (
              <div key={i} className="border rounded p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm">{h.titulo}</div>
                  {h.severidad && <Badge variant="outline">{h.severidad}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground mt-1">{h.detalle}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {(r.oportunidades ?? []).length > 0 && (
        <section>
          <h3 className="font-medium text-sm flex items-center gap-2 mb-2"><TrendingUp className="h-4 w-4 text-emerald-600" />Oportunidades</h3>
          <div className="space-y-2">
            {(r.oportunidades as any[]).map((o, i) => (
              <div key={i} className="border rounded p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm">{o.titulo}</div>
                  {o.impacto > 0 && <Badge variant="outline" className="text-emerald-600 border-emerald-600/30">+{fmtPesos(o.impacto)}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground mt-1">{o.detalle}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.recomendaciones.length > 0 && (
        <section>
          <Separator className="my-2" />
          <h3 className="font-medium text-sm flex items-center gap-2 mb-2"><Lightbulb className="h-4 w-4 text-primary" />Recomendaciones IA</h3>
          <div className="space-y-2">
            {data.recomendaciones.map((rec) => (
              <div key={rec.id} className="border rounded p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-medium text-sm">{rec.titulo}</div>
                  <div className="flex gap-2">
                    <Badge variant="outline">{categoriaLabel[rec.categoria] ?? rec.categoria}</Badge>
                    <Badge className={prioridadColor[rec.prioridad]} variant="outline">{rec.prioridad}</Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{rec.descripcion}</p>
                {rec.accion_sugerida && <p className="text-sm mt-1"><ArrowRight className="h-3 w-3 inline mr-1" />{rec.accion_sugerida}</p>}
                <div className="mt-2">
                  <Button size="sm" variant="outline" onClick={() => onCrearTarea(rec.id)} disabled={!!rec.tarea_id}>
                    <ListTodo className="h-3 w-3 mr-1" />{rec.tarea_id ? "Tarea creada" : "Crear tarea"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Bloque({ titulo, datos }: { titulo: string; datos: Record<string, unknown> }) {
  const entries = Object.entries(datos ?? {}).filter(([, v]) => typeof v === "number" || typeof v === "string");
  return (
    <div className="border rounded-lg p-3">
      <h4 className="font-medium text-sm mb-2">{titulo}</h4>
      <div className="grid grid-cols-2 gap-2 text-sm">
        {entries.map(([k, v]) => (
          <div key={k}>
            <div className="text-xs text-muted-foreground capitalize">{k.replaceAll("_", " ")}</div>
            <div className="font-medium">
              {typeof v === "number" && k.match(/ingres|gasto|isr|iva|saldo|utilidad|impacto|monto/i) ? fmtPesos(v) :
               typeof v === "number" && k === "margen" ? `${(v * 100).toFixed(1)}%` :
               typeof v === "number" ? v.toLocaleString("es-MX") : String(v)}
            </div>
          </div>
        ))}
        {entries.length === 0 && <div className="text-xs text-muted-foreground col-span-2">Sin datos</div>}
      </div>
    </div>
  );
}
